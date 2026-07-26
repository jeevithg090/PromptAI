import dns from 'node:dns/promises';
import { assertPublicHttpUrl, fetchDocs, htmlToText, extractDocLinks, DocFetchError } from '../../src/services/DocFetchService';

/** V1.1 — SSRF guards are the point of this service; test every rejection class. */

describe('assertPublicHttpUrl (SSRF guard)', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/docs',
    'gopher://example.com',
  ])('rejects non-http scheme %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(DocFetchError);
  });

  it.each([
    'http://127.0.0.1/admin',
    'http://127.0.0.1:8080/health',
    'https://10.0.0.5/internal',
    'http://192.168.1.1/router',
    'http://169.254.169.254/latest/meta-data', // cloud metadata endpoint
    'http://172.16.0.1/',
    'http://0.0.0.0/',
  ])('rejects private/reserved IP %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(DocFetchError);
  });

  it.each([
    'http://localhost/docs',
    'http://foo.localhost/docs',
    'http://intranet.local/wiki',
    'http://service.internal/api',
  ])('rejects private hostname %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(DocFetchError);
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(assertPublicHttpUrl('https://user:pass@example.com/docs')).rejects.toBeInstanceOf(DocFetchError);
  });

  it('rejects garbage that is not a URL', async () => {
    await expect(assertPublicHttpUrl('not a url at all')).rejects.toBeInstanceOf(DocFetchError);
  });
});

describe('htmlToText', () => {
  it('strips tags, scripts, and chrome', () => {
    const html = '<html><head><style>.x{}</style><script>evil()</script></head><body><nav>Menu</nav><h1>Prompting Guide</h1><p>Write clear prompts.</p><footer>©</footer></body></html>';
    const text = htmlToText(html);
    expect(text).toContain('Prompting Guide');
    expect(text).toContain('Write clear prompts.');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('Menu');
  });
});

describe('extractDocLinks', () => {
  const base = new URL('https://docs.example.com/start');

  it('keeps same-origin doc-ish links, drops cross-origin and assets', () => {
    const html = `
      <a href="/docs/prompting">Prompting</a>
      <a href="https://docs.example.com/guide/advanced">Advanced</a>
      <a href="https://evil.com/steal">External</a>
      <a href="/logo.png">Logo</a>
      <a href="/docs/prompting">Duplicate</a>`;
    const links = extractDocLinks(html, base, 5);
    expect(links).toContain('https://docs.example.com/docs/prompting');
    expect(links).toContain('https://docs.example.com/guide/advanced');
    expect(links.every((l) => !l.includes('evil.com') && !l.endsWith('.png'))).toBe(true);
    expect(links.filter((l) => l.endsWith('/docs/prompting')).length).toBe(1);
  });

  it('respects the limit', () => {
    const html = Array.from({ length: 20 }, (_, i) => `<a href="/docs/page-${i}">p${i}</a>`).join('');
    expect(extractDocLinks(html, base, 5).length).toBe(5);
  });
});

describe('fetchDocs (mocked network)', () => {
  // The fake test hosts don't resolve in real DNS — stub the lookup to a public IP.
  beforeEach(() => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const page = (body: string, status = 200): Response =>
    ({ ok: status < 300, status, headers: new Headers(), text: async () => body } as unknown as Response);

  it('fetches the seed page and same-origin links, capped', async () => {
    const seedHtml = '<h1>Guide</h1><p>Main content here for the guide.</p><a href="/docs/a">A</a><a href="/docs/b">B</a>';
    const fetchFn = jest.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('/docs/a')) return page('<p>Alpha page content</p>');
      if (u.endsWith('/docs/b')) return page('<p>Beta page content</p>');
      return page(seedHtml);
    });
    const pages = await fetchDocs('https://docs.example.com/start', fetchFn as never);
    expect(pages.length).toBe(3);
    expect(pages[0]!.text).toContain('Main content');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('skips linked pages that fail without failing the whole fetch', async () => {
    const seedHtml = '<p>Seed content is fine.</p><a href="/docs/broken">X</a>';
    const fetchFn = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/docs/broken')) return page('nope', 500);
      return page(seedHtml);
    });
    const pages = await fetchDocs('https://docs.example.com/start', fetchFn as never);
    expect(pages.length).toBe(1);
  });

  it('fails when the seed page has no readable text', async () => {
    const fetchFn = jest.fn(async () => page('<script>only()</script>'));
    await expect(fetchDocs('https://docs.example.com/start', fetchFn as never)).rejects.toBeInstanceOf(DocFetchError);
  });
});
