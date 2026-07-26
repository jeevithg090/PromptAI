import dns from 'node:dns/promises';
import net from 'node:net';
import { logger } from '../utils/logger';

/**
 * Docs fetcher for custom platforms (V1.1). Fetches a user-supplied docs URL
 * plus a handful of same-origin linked pages, strips HTML to text, and
 * returns the corpus the PlatformProfileAgent grounds a platform profile in.
 *
 * SSRF is the threat model here (§27): the URL is attacker-controlled and the
 * fetch runs from inside our network. Guards: http(s) only, no credentials in
 * the URL, DNS-resolve the host and reject private/loopback/link-local ranges
 * BEFORE fetching, re-validate on every page (redirect targets included via
 * manual redirect handling), page/time/size caps.
 */
const MAX_PAGES = 6; // seed page + up to 5 linked
const PER_PAGE_TIMEOUT_MS = 10_000;
const TOTAL_TEXT_CAP = 500_000; // chars across all pages
const PER_PAGE_BYTE_CAP = 2_000_000;

export class DocFetchError extends Error {}

export interface FetchedPage {
  url: string;
  text: string;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fe80:') || // link-local
      lower.startsWith('fc') || lower.startsWith('fd') || // unique-local
      lower.startsWith('::ffff:127.') || lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.') || lower.startsWith('::ffff:169.254.')
    );
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // fail closed
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 127 || // loopback
    a === 10 || // rfc1918
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local / cloud metadata
    a === 0 ||
    a >= 224 // multicast/reserved
  );
}

/** Validates scheme/credentials and resolves the host, rejecting private ranges. Exported for tests. */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DocFetchError('not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DocFetchError('only http(s) URLs are allowed');
  }
  if (url.username || url.password) {
    throw new DocFetchError('URLs with credentials are not allowed');
  }
  const host = url.hostname;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new DocFetchError('private or reserved addresses are not allowed');
    return url;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new DocFetchError('private hostnames are not allowed');
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new DocFetchError('host could not be resolved');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new DocFetchError('host resolves to a private or reserved address');
  }
  return url;
}

/** Crude but dependency-free HTML → text: drop script/style/nav chrome, strip tags, collapse whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract same-origin doc-ish links from HTML, docs-path-biased, deduped. */
export function extractDocLinks(html: string, base: URL, limit: number): string[] {
  const hrefs = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => m[1]!);
  const seen = new Set<string>();
  const scored: Array<{ url: string; score: number }> = [];
  for (const href of hrefs) {
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.origin !== base.origin) continue;
    if (/\.(png|jpe?g|gif|svg|css|js|ico|pdf|zip|mp4)(\?|$)/i.test(resolved.pathname)) continue;
    resolved.hash = '';
    const key = resolved.toString();
    if (key === base.toString() || seen.has(key)) continue;
    seen.add(key);
    const p = resolved.pathname.toLowerCase();
    const score =
      (/(doc|guide|prompt|reference|api|learn|help|tutorial|getting-started)/.test(p) ? 2 : 0) +
      (p.split('/').length <= 4 ? 1 : 0);
    scored.push({ url: key, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.url);
}

type FetchFn = typeof fetch;

async function fetchPage(url: URL, fetchFn: FetchFn): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);
  try {
    // redirect:'manual' so a public host can't bounce us to a private one unvalidated.
    let current = url;
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetchFn(current.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          // A browser-like UA: many docs sites 403 unknown bots even for
          // public pages. We only read public docs the user pointed us at.
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new DocFetchError('redirect without location');
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if (!res.ok) throw new DocFetchError(`fetch failed with ${res.status}`);
      const body = await res.text();
      return body.length > PER_PAGE_BYTE_CAP ? body.slice(0, PER_PAGE_BYTE_CAP) : body;
    }
    throw new DocFetchError('too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDocs(rawUrl: string, fetchFn: FetchFn = fetch): Promise<FetchedPage[]> {
  const seedUrl = await assertPublicHttpUrl(rawUrl);
  const pages: FetchedPage[] = [];
  let totalChars = 0;

  const seedHtml = await fetchPage(seedUrl, fetchFn);
  const seedText = htmlToText(seedHtml);
  if (!seedText) throw new DocFetchError('the page contained no readable text');
  pages.push({ url: seedUrl.toString(), text: seedText.slice(0, TOTAL_TEXT_CAP) });
  totalChars += pages[0]!.text.length;

  const links = extractDocLinks(seedHtml, seedUrl, MAX_PAGES - 1);
  for (const link of links) {
    if (pages.length >= MAX_PAGES || totalChars >= TOTAL_TEXT_CAP) break;
    try {
      const linkUrl = await assertPublicHttpUrl(link);
      const text = htmlToText(await fetchPage(linkUrl, fetchFn));
      if (!text) continue;
      const room = TOTAL_TEXT_CAP - totalChars;
      pages.push({ url: link, text: text.slice(0, room) });
      totalChars += Math.min(text.length, room);
    } catch (error) {
      logger.warn({ type: 'docfetch:page_skipped', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return pages;
}
