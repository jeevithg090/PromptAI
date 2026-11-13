/**
 * The thin slice end to end: the built Electron app against the REAL server
 * (apps/server with @promptai/core's forge and the catalog). Only pf-native is
 * faked, because real key presses, the microphone and ⌘V into another app need
 * a person (see apps/native-macos for those manual checks).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createServer as createTcpServer, type AddressInfo, type Socket } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const serverMain = path.resolve(root, '../server/src/main.ts');

const commands: Record<string, unknown>[] = [];
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
    { timeout: 10_000 },
  );

let server: ChildProcess;
let app: ElectronApplication;

/** Start apps/server on a free port and resolve with its URL once it logs "listening". */
async function startServer(): Promise<string> {
  server = spawn(process.execPath, [serverMain], { env: { ...process.env, PORT: '0', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'inherit'] });
  for await (const line of createInterface({ input: server.stdout! })) {
    const entry = JSON.parse(line) as { msg?: string; port?: number };
    if (entry.msg === 'listening') return `http://127.0.0.1:${entry.port}`;
  }
  throw new Error('server exited before listening');
}

beforeAll(async () => {
  control.listen(0, '127.0.0.1');
  const [serverUrl] = await Promise.all([startServer(), once(control, 'listening')]);
  app = await electron.launch({
    executablePath: createRequire(import.meta.url)('electron') as unknown as string,
    args: [root],
    env: {
      ...process.env,
      PROMPTAI_NATIVE_BIN: path.join(root, 'test', 'fake-native.mjs'),
      PROMPTAI_SERVER_URL: serverUrl,
      FAKE_NATIVE_CONTROL: String((control.address() as AddressInfo).port),
    },
  });
});

afterAll(async () => {
  await app?.close();
  server?.kill();
  control.close();
});

it('dictates, drafts with the real core and catalog, and inserts the rendered brief', async () => {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await command('hotkey.register');

  send({ event: 'hotkey', state: 'down' });
  await command('dictation.start');
  // Fillers and "scratch that" are cleaned on the Mac before the server sees the text.
  send({ event: 'transcript', text: 'um write a launch email for the PromptAI beta in Claude, scratch that, in Claude for the waitlist', final: true });
  send({ event: 'hotkey', state: 'up' });

  // The real catalog's Claude card was chosen from the words "in Claude".
  await page.getByRole('heading', { name: 'Claude' }).waitFor({ timeout: 15_000 });
  await page.getByText(/launch email/i).first().waitFor();
  await page.getByText('Ran on: Dictation: on this Mac · Draft: server').waitFor();

  const insert = page.getByRole('button', { name: 'Insert', exact: true });
  // Accept any picks the card asks for, then Insert must be enabled.
  for (const group of await page.getByRole('group', { name: /pick one/ }).all()) {
    await group.getByRole('button').first().click();
  }
  await vi.waitFor(async () => expect(await insert.getAttribute('aria-disabled')).not.toBe('true'));

  await mkdir(path.join(root, 'test', 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test', 'artifacts', 'panel-ready-fullstack.png') });

  await page.keyboard.press('Meta+Enter');
  const paste = await command('paste');
  expect(String(paste.text)).toMatch(/launch email/i);
  expect(String(paste.text)).not.toMatch(/\bum\b|scratch that/i);
  expect(String(paste.text)).not.toMatch(/\n$/);
  await page.getByRole('heading', { name: 'Inserted into Notes' }).waitFor();
});
