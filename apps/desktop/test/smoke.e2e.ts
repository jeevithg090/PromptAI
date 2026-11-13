/**
 * Launches the built app with Playwright's _electron, a fake pf-native
 * (test/fake-native.mjs, driven over a TCP control socket) and the fake API
 * (apps/app/test/fake-server.ts), then runs first run → hold → speak →
 * release → draft → Insert → "Did it work?" → Report, checking what main sent.
 */
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer as createTcpServer, type AddressInfo, type Socket } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { startFakeServer, type FakeServer } from '@promptai/app/test/fake-server';

const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, 'test', 'artifacts');

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

let fake: FakeServer;
let app: ElectronApplication;
let userData: string;

beforeAll(async () => {
  fake = await startFakeServer();
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  userData = await mkdtemp(path.join(tmpdir(), 'promptai-desktop-'));
  app = await electron.launch({
    executablePath: createRequire(import.meta.url)('electron') as unknown as string,
    args: [root],
    env: {
      ...process.env,
      PROMPTAI_NATIVE_BIN: path.join(root, 'test', 'fake-native.mjs'),
      PROMPTAI_SERVER_URL: fake.url,
      PROMPTAI_USER_DATA: userData,
      FAKE_NATIVE_CONTROL: String((control.address() as AddressInfo).port),
    },
  });
});

afterAll(async () => {
  await app?.close();
  await fake?.close();
  control.close();
});

const panelState = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { visible: w.isVisible(), focused: w.isFocused(), onTop: w.isAlwaysOnTop() };
  });

it('runs first run in the panel, then holds, drafts, inserts, rates and reports', async () => {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  expect(await command('hotkey.register')).toMatchObject({ keyCode: 49, modifiers: ['control', 'option'] });
  await mkdir(artifacts, { recursive: true });

  // First run shows itself; until it is done the hotkey opens nothing.
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await vi.waitFor(async () => expect((await panelState()).visible).toBe(true));
  send({ event: 'hotkey', state: 'down' });
  send({ event: 'hotkey', state: 'up' });
  await page.getByRole('textbox', { name: 'Day' }).fill('14');
  await page.getByRole('textbox', { name: 'Month' }).fill('5');
  await page.getByRole('textbox', { name: 'Year' }).fill('1990');
  await page.screenshot({ path: path.join(artifacts, 'panel-first-run-dob.png') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Draft with AI providers?' }).waitFor();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('heading', { name: 'Draft a brief' }).waitFor();
  expect(commands.map((c) => c.cmd)).toEqual(['hotkey.register']); // no mic before first run was done
  // The panel's /v1 calls went through main to the server, with the guest token after the ALTCHA.
  const guestToken = fake.api.state.token!;
  expect(fake.to('GET', '/v1/guest/challenge')).toHaveLength(1);
  expect(fake.to('POST', '/v1/me/age')[0]).toMatchObject({ auth: guestToken, body: { dob: '1990-05-14' } });
  expect(fake.to('PUT', '/v1/me/consent')[0]).toMatchObject({ auth: guestToken, body: { entries: [{ purpose: 'llm_processing', granted: true }] } });
  await page.screenshot({ path: path.join(artifacts, 'panel-capture.png') });

  // Hold ⌃⌥Space: target recorded, panel shown without focus, mic opened.
  send({ event: 'hotkey', state: 'down' });
  await command('dictation.start');
  expect(commands.map((c) => c.cmd)).toEqual(['hotkey.register', 'frontmost', 'dictation.start']);
  expect(await command('dictation.start')).toMatchObject({ locale: 'en-US' });
  await page.getByRole('heading', { name: 'Listening…' }).waitFor();
  expect(await panelState()).toEqual({ visible: true, focused: false, onTop: true });

  send({ event: 'transcript', text: 'write a launch email', final: false });
  await page.getByText('write a launch email', { exact: true }).waitFor();
  send({ event: 'transcript', text: 'write a launch email for the beta', final: false });

  // Release: final transcript, then the draft, sent by main with surface 'desktop' and the token.
  send({ event: 'hotkey', state: 'up' });
  await command('dictation.stop');
  await page.getByRole('heading', { name: 'Claude' }).waitFor();
  expect(fake.to('POST', '/v1/forge').map((r) => [r.auth, r.body])).toEqual([
    [guestToken, { text: 'write a launch email for the beta', surface: 'desktop', hostApp: 'com.apple.Notes' }],
  ]);

  const insert = page.getByRole('button', { name: 'Insert', exact: true });
  expect(await insert.getAttribute('aria-disabled')).toBe('true');
  await page.getByText('Ran on: Dictation: on this Mac · Draft: server').waitFor();
  await page.getByText('One detail you didn’t say').waitFor();

  // One tap accepts the suggested pick.
  await page.getByRole('group', { name: 'Length, pick one' }).getByRole('button', { name: /Short/ }).click();
  await vi.waitFor(async () => expect(await insert.getAttribute('aria-disabled')).not.toBe('true'));
  await page.screenshot({ path: path.join(artifacts, 'panel-ready.png') });

  await page.keyboard.press('Meta+Enter');
  const paste = await command('paste');
  expect(String(paste.text)).toMatch(/^Write a launch email for the beta on 3 March\./);
  expect(String(paste.text)).not.toMatch(/\s$/);
  await page.getByRole('heading', { name: 'Inserted into Notes' }).waitFor();
  expect(commands.filter((c) => c.cmd === 'frontmost')).toHaveLength(2); // checked again at insert
  expect(fake.to('POST', '/v1/forge')).toHaveLength(1); // accepting a suggestion needs no redraft

  // The receipt: "Did it work?", sent by main's queue with the decisionId.
  await page.getByRole('button', { name: 'It worked' }).click();
  await page.getByText('Thanks for telling us.').waitFor();
  await vi.waitFor(() => expect(fake.api.state.events.map((e) => e.type)).toEqual(['brief.shown', 'brief.inserted', 'outcome.rated']), { timeout: 10_000 });
  const decisionId = fake.api.state.events[0]!.props?.decisionId;
  expect(decisionId).toEqual(expect.any(String));
  for (const e of fake.api.state.events) expect(e.props).toMatchObject({ decisionId, surface: 'desktop' });
  expect(fake.to('POST', '/v1/events').every((r) => r.auth === guestToken)).toBe(true);
  // Acknowledged, so the queue under userData is empty again.
  await vi.waitFor(async () => expect(JSON.parse(await readFile(path.join(userData, 'events-queue.json'), 'utf8'))).toEqual([]));
  await page.screenshot({ path: path.join(artifacts, 'panel-receipt.png') });

  // Report this output, through main's proxy.
  await page.getByRole('button', { name: 'Report this output' }).click();
  const report = page.getByRole('dialog', { name: 'Report this output' });
  await report.getByRole('radio', { name: 'It’s wrong or harmful' }).check();
  await report.getByRole('button', { name: 'Send report' }).click();
  await report.getByText('Thanks. Your report reached us.').waitFor();
  expect(fake.api.state.reports).toEqual([{ decisionId, reason: 'wrong_or_harmful' }]);
});
