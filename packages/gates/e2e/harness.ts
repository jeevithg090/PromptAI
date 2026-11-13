/**
 * What the G-P and axe journeys run against (docs/gates.md): apps/server in
 * dev mode, behind a pass-through that records every request it forwards and
 * can also serve the built apps/app on the same origin.
 *
 * apps/server sends no CORS headers yet, so the SPA and the API share one
 * origin here: the server URL the app was built with (its CSP connect-src).
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Page } from 'playwright';

export const REPO = path.resolve(import.meta.dirname, '../../..');
export const APP_DIST = path.join(REPO, 'apps/app/dist');

type Forwarded = { method: string; url: string; body: string };

/** apps/server on a free port (in-memory PGlite, deterministic forge). */
export async function startServer(): Promise<{ url: string; stop(): void }> {
  const child = spawn(process.execPath, [path.join(REPO, 'apps/server/src/main.ts')], {
    env: { ...process.env, PORT: '0', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await new Promise<string>((resolve, reject) => {
    // Keep reading after "listening" so the request log never fills the pipe.
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const entry = JSON.parse(line) as { msg?: string; port?: number };
        if (entry.msg === 'listening') resolve(`http://127.0.0.1:${entry.port}`);
      } catch {}
    });
    child.once('exit', (code) => reject(new Error(`apps/server exited (${code}) before listening`)));
  });
  return { url, stop: () => child.kill() };
}

/** The origin apps/app/dist talks to, read from the CSP the build wrote. It must be on this machine. */
export async function builtAppOrigin(): Promise<URL> {
  const index = path.join(APP_DIST, 'index.html');
  if (!existsSync(index)) throw new Error(`${index} is missing: run pnpm build first`);
  const html = (await readFile(index, 'utf8')).replaceAll('&#39;', "'");
  const src = /connect-src 'self' ([^;"'\s]+)/.exec(html)?.[1];
  if (!src) throw new Error('apps/app/dist/index.html has no connect-src server origin');
  const url = new URL(src);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`apps/app was built for ${url.origin}; build it with a localhost VITE_PROMPTAI_SERVER_URL (the default) for the gates`);
  }
  return url;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(dir: string, req: IncomingMessage, res: ServerResponse) {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = path.join(dir, path.normalize(pathname));
  if (!file.startsWith(dir)) return res.writeHead(403).end();
  // Client-side routes (no extension) get the SPA shell.
  if (pathname.endsWith('/') || !path.extname(pathname)) file = path.join(dir, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

/**
 * Listen on `listen` (or a free loopback port), forward /v1/* and /health to
 * the server, and serve `staticDir` for everything else. Every forwarded
 * request is kept in `forwarded`.
 */
export async function startFront(opts: { upstream: string; listen?: URL; staticDir?: string }) {
  const forwarded: Forwarded[] = [];
  const upstream = new URL(opts.upstream);
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    if (!(url.startsWith('/v1/') || url === '/health')) {
      if (opts.staticDir && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(opts.staticDir, req, res);
      return res.writeHead(404).end();
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    forwarded.push({ method: req.method ?? 'GET', url, body: body.toString('utf8') });
    const out = request({ host: upstream.hostname, port: upstream.port, method: req.method, path: url, headers: { ...req.headers, host: upstream.host } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    out.on('error', () => res.writeHead(502).end());
    out.end(body);
  });
  const host = opts.listen?.hostname.replace(/^\[|\]$/g, '') ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) =>
      reject(err.code === 'EADDRINUSE' ? new Error(`port ${opts.listen?.port} is busy: stop the dev server using it, then rerun the gate`) : err),
    );
    server.listen(Number(opts.listen?.port || 0), host, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const origin = opts.listen ? opts.listen.origin : `http://127.0.0.1:${port}`;
  return {
    origin,
    forwarded,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A per-run marker for personal data: lowercase letters and digits only, so cleanup and tokenizers keep it whole. */
export const canary = (label: string) => `gpcanary${label}${randomBytes(5).toString('hex')}`;

/**
 * First run (blueprint §15): the neutral date-of-birth screen, then provider
 * consent (answered No, the privacy-preserving choice). Ends on Capture, after
 * the app has solved the guest proof of work against the real server.
 * `check` runs on each first-run screen, for gates that inspect them.
 */
export async function completeFirstRun(page: Page, check?: (screen: 'age' | 'consent') => Promise<void>): Promise<void> {
  await page.getByRole('textbox', { name: 'Day' }).waitFor();
  await check?.('age');
  await page.getByRole('textbox', { name: 'Day' }).fill('14');
  await page.getByRole('textbox', { name: 'Month' }).fill('5');
  await page.getByRole('textbox', { name: 'Year' }).fill('1990');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Draft with AI providers?' }).waitFor();
  await check?.('consent');
  await page.getByRole('button', { name: 'No' }).click();
  await page.getByRole('heading', { name: 'Draft a brief' }).waitFor({ timeout: 30_000 });
}

