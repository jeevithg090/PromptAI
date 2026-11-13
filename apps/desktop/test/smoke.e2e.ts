/**
 * Launches the built app with Playwright's _electron, a fake pf-native
 * (test/fake-native.mjs, driven over a TCP control socket) and a fake forge
 * server, then runs hold → speak → release → draft → Insert.
 */
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { createServer as createTcpServer, type AddressInfo, type Socket } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { ForgeResponse } from '@promptai/contract';

const root = path.resolve(import.meta.dirname, '..');
const DRAFT: ForgeResponse = {
  toolId: 'claude',
  toolName: 'Claude',
  brief: 'Write a launch email for the PromptAI beta.\n\nAudience: existing waitlist. Send date: 3 March.\n',
  assumptions: [
    { slotId: 'tone', label: 'Tone', value: 'Friendly', source: 'default', kind: 'assumption', options: ['Formal', 'Playful'] },
    { slotId: 'length', label: 'Length', value: 'Short', source: 'inferred', kind: 'pick', options: ['Medium', 'Long'] },
  ],
  unsourced: ['3 March'],
  coverage: { covered: 4, total: 6 },
  usage: { llmCalls: 1, ms: 850 },
};

const forgeBodies: unknown[] = [];
const forge = createHttpServer(async (req: IncomingMessage, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.method !== 'POST' || req.url !== '/v1/forge') {
    res.writeHead(404).end();
    return;
  }
  forgeBodies.push(JSON.parse(body));
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(DRAFT));
});

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

let app: ElectronApplication;

beforeAll(async () => {
  forge.listen(0, '127.0.0.1');
  control.listen(0, '127.0.0.1');
  await Promise.all([once(forge, 'listening'), once(control, 'listening')]);
  app = await electron.launch({
    executablePath: createRequire(import.meta.url)('electron') as unknown as string,
    args: [root],
    env: {
      ...process.env,
      PROMPTAI_NATIVE_BIN: path.join(root, 'test', 'fake-native.mjs'),
      PROMPTAI_SERVER_URL: `http://127.0.0.1:${(forge.address() as AddressInfo).port}`,
      FAKE_NATIVE_CONTROL: String((control.address() as AddressInfo).port),
    },
  });
});

afterAll(async () => {
  await app?.close();
  forge.close();
  control.close();
});

it('holds, drafts and inserts through the panel', async () => {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  expect(await command('hotkey.register')).toMatchObject({ keyCode: 49, modifiers: ['control', 'option'] });

  // Hold ⌃⌥Space: target recorded, panel shown without focus, mic opened.
  send({ event: 'hotkey', state: 'down' });
  await command('dictation.start');
  expect(commands.map((c) => c.cmd)).toEqual(['hotkey.register', 'frontmost', 'dictation.start']);
  expect(await command('dictation.start')).toMatchObject({ locale: 'en-US' });
  await page.getByRole('heading', { name: 'Listening…' }).waitFor();
  const win = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { visible: w.isVisible(), focused: w.isFocused(), onTop: w.isAlwaysOnTop() };
  });
  expect(win).toEqual({ visible: true, focused: false, onTop: true });

  send({ event: 'transcript', text: 'write a launch email', final: false });
  await page.getByText('write a launch email', { exact: true }).waitFor();
  send({ event: 'transcript', text: 'write a launch email for the beta', final: false });

  // Release: final transcript, then the draft.
  send({ event: 'hotkey', state: 'up' });
  await command('dictation.stop');
  await page.getByRole('heading', { name: 'Claude' }).waitFor();
  expect(forgeBodies).toEqual([{ text: 'write a launch email for the beta', hostApp: 'com.apple.Notes' }]);

  const insert = page.getByRole('button', { name: 'Insert', exact: true });
  expect(await insert.getAttribute('aria-disabled')).toBe('true');
  await page.getByText('Ran on: Dictation: on this Mac · Draft: server').waitFor();
  await page.getByText('One detail you didn’t say').waitFor();

  // One tap accepts the suggested pick.
  await page.getByRole('group', { name: 'Length, pick one' }).getByRole('button', { name: /Short/ }).click();
  await vi.waitFor(async () => expect(await insert.getAttribute('aria-disabled')).not.toBe('true'));

  await mkdir(path.join(root, 'test', 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test', 'artifacts', 'panel-ready.png') });

  await page.keyboard.press('Meta+Enter');
  const paste = await command('paste');
  expect(paste.text).toBe(DRAFT.brief.trimEnd());
  await page.getByRole('heading', { name: 'Inserted into Notes' }).waitFor();
  expect(commands.filter((c) => c.cmd === 'frontmost')).toHaveLength(2); // checked again at insert
  expect(forgeBodies).toHaveLength(1); // accepting a suggestion needs no redraft
});
