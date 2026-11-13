/**
 * G-P, desktop (docs/blueprint/BLUEPRINT.md §14, docs/gates.md): the built
 * apps/desktop with the fake pf-native helper, against apps/server. Every
 * network request is recorded two ways, because the app has two stacks:
 *   - Chromium's (renderer, Electron's net): the net log (--log-net-log), from launch;
 *   - Node's in the main process (fetch, http): diagnostics_channel.
 * Fails on any request to a host other than the server, and on a canary in a
 * /v1/events payload or a URL.
 */
import { createServer as createTcpServer, type AddressInfo, type Socket } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { REPO, canary, startFront, startServer } from './harness.ts';

const DESKTOP = path.join(REPO, 'apps/desktop');

const commands: Array<{ cmd?: string; text?: unknown }> = [];
let helper: Socket | null = null;
const control = createTcpServer((socket) => {
  helper = socket;
  createInterface({ input: socket }).on('line', (l) => commands.push(JSON.parse(l)));
});
const send = (event: unknown) => helper!.write(`${JSON.stringify(event)}\n`);
const command = (cmd: string) =>
  vi.waitFor(
    () => {
      const found = commands.find((c) => c.cmd === cmd);
      expect(found, `pf-native never got ${cmd}`).toBeDefined();
      return found!;
    },
    { timeout: 15_000 },
  );

let server: Awaited<ReturnType<typeof startServer>>;
let front: Awaited<ReturnType<typeof startFront>>;
let app: ElectronApplication;
let tmp: string;
const netLog = () => path.join(tmp, 'netlog.json');

beforeAll(async () => {
  if (!existsSync(path.join(DESKTOP, 'dist/main.cjs'))) throw new Error('apps/desktop/dist is missing: run pnpm build first');
  tmp = await mkdtemp(path.join(tmpdir(), 'gp-electron-'));
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  server = await startServer();
  front = await startFront({ upstream: server.url });
  app = await electron.launch({
    executablePath: createRequire(path.join(DESKTOP, 'package.json'))('electron') as unknown as string,
    args: [`--log-net-log=${netLog()}`, DESKTOP],
    env: {
      ...process.env,
      PROMPTAI_NATIVE_BIN: path.join(DESKTOP, 'test/fake-native.mjs'),
      PROMPTAI_SERVER_URL: front.origin,
      FAKE_NATIVE_CONTROL: String((control.address() as AddressInfo).port),
    },
  });
  // The main process makes no request before the hotkey, so subscribing now misses nothing.
  await app.evaluate(() => {
    const dc = process.getBuiltinModule('node:diagnostics_channel');
    const urls: string[] = [];
    (globalThis as { __gpUrls?: string[] }).__gpUrls = urls;
    dc.subscribe('undici:request:create', (m) => {
      const r = (m as { request: { origin: string; path: string } }).request;
      urls.push(`${r.origin}${r.path}`);
    });
    dc.subscribe('http.client.request.start', (m) => {
      const r = (m as { request: { protocol: string; host: string; path: string } }).request;
      urls.push(`${r.protocol}//${r.host}${r.path}`);
    });
  });
});

afterAll(async () => {
  await app?.close().catch(() => {});
  await front?.close();
  server?.stop();
  control.close();
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

/** Network URLs in a Chromium net log; tolerant of a log cut short. */
function netLogUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const m of text.matchAll(/"(?:url|original_url|new_location)":"([^"]+)"/g)) {
    if (/^(?:https?|wss?):/i.test(m[1]!)) urls.add(m[1]!);
  }
  return [...urls];
}

it('dictates, drafts and inserts with requests only to the server', async () => {
  const secret = canary('dictation');
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await command('hotkey.register');

  send({ event: 'hotkey', state: 'down' });
  await command('dictation.start');
  send({ event: 'transcript', text: `write a launch email for ${secret} in Claude`, final: true });
  send({ event: 'hotkey', state: 'up' });

  await vi.waitFor(() => expect(front.forwarded.some((r) => r.url === '/v1/forge'), 'no /v1/forge reached the server').toBe(true), { timeout: 15_000 });
  for (const group of await page.getByRole('group', { name: /pick one/i }).all()) await group.getByRole('button').first().click();
  await page.keyboard.press('Meta+Enter');
  expect(String((await command('paste')).text)).toContain(secret);

  // One request through Chromium's stack from the main process, so the net log is shown to record.
  const probe = `${front.origin}/health`;
  expect(await app.evaluate(({ net }, url) => net.fetch(url).then((r) => r.status), probe)).toBe(200);

  const mainUrls = await app.evaluate(() => (globalThis as { __gpUrls?: string[] }).__gpUrls ?? []);
  await app.close();
  const chromiumUrls = netLogUrls(await readFile(netLog(), 'utf8'));
  console.log(`G-P electron: ${mainUrls.length} main-process and ${chromiumUrls.length} Chromium request URL(s) recorded`);

  // The recorders saw the traffic, or the gate proves nothing.
  expect(chromiumUrls, 'the net log recorded no request').toContain(probe);
  expect(mainUrls, 'diagnostics_channel saw no main-process request').toContain(`${front.origin}/v1/forge`);
  expect(front.forwarded.find((r) => r.url === '/v1/forge')?.body).toContain(secret);

  const foreign = [...mainUrls, ...chromiumUrls].filter((u) => new URL(u).origin !== front.origin);
  expect(foreign, 'requests to hosts other than the server').toEqual([]);
  const leaked = [
    ...front.forwarded.filter((r) => r.url.startsWith('/v1/events') && r.body.includes(secret)).map((r) => `canary in a /v1/events payload: ${r.url}`),
    ...[...mainUrls, ...chromiumUrls].filter((u) => u.includes(secret)).map((u) => `canary in a URL: ${u}`),
  ];
  expect(leaked).toEqual([]);
});
