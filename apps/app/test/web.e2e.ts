/**
 * The PWA's first-run journey in Chromium against the fake API
 * (test/fake-server.ts): DOB → consent → a guest brief → receipt → report →
 * sign up to keep it → Library → You; then the ⌘K palette, the events queue's
 * retry, the offline shell, the pseudo-locale and 44 px targets on a phone.
 * Screenshots of each place go to test/artifacts/.
 */
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { build, preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startFakeServer, type FakeServer } from './fake-server.ts';

const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, 'test', 'artifacts');
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });

let fake: FakeServer;
let site: PreviewServer;
let baseUrl: string;
let browser: Browser;

beforeAll(async () => {
  await mkdir(artifacts, { recursive: true });
  // The first events POST answers 503: the queue must keep the batch and retry it.
  fake = await startFakeServer({ failEvents: 1 });
  process.env.VITE_PROMPTAI_SERVER_URL = fake.url;
  process.env.VITE_PROMPTAI_DEV_AUTH = '1';
  // Vitest sets NODE_ENV=test, which would give a development build (React dev, no service worker).
  process.env.NODE_ENV = 'production';
  const outDir = await mkdtemp(path.join(tmpdir(), 'promptai-pwa-'));
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  site = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { port: 0, host: '127.0.0.1', strictPort: false } });
  baseUrl = site.resolvedUrls!.local[0]!;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
  await fake?.close();
});

async function newPage(options: Parameters<Browser['newContext']>[0] = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
  const page = await context.newPage();
  return { context, page };
}

it('runs first run, a guest brief, the receipt, a report, sign-up, Library and You', async () => {
  const { context, page } = await newPage();
  await page.goto(baseUrl);

  // 1. A neutral date-of-birth screen: nothing prefilled, no checkbox.
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  expect(await page.getByRole('checkbox').count()).toBe(0);
  await shot(page, 'first-run-dob');
  await page.getByRole('textbox', { name: 'Day' }).fill('14');
  await page.getByRole('textbox', { name: 'Month' }).fill('5');
  await page.getByRole('textbox', { name: 'Year' }).fill('1990');
  await page.getByRole('button', { name: 'Continue' }).click();

  // 2. Provider consent: equal Yes and No, nothing preselected.
  await page.getByRole('heading', { name: 'Draft with AI providers?' }).waitFor();
  const [yes, no] = [await page.getByRole('button', { name: 'Yes' }).boundingBox(), await page.getByRole('button', { name: 'No' }).boundingBox()];
  expect([yes!.width, yes!.height]).toEqual([no!.width, no!.height]);
  await shot(page, 'first-run-consent');
  await page.getByRole('button', { name: 'Yes' }).click();
  expect(fake.to('GET', '/v1/guest/challenge')).toHaveLength(1);
  const guestToken = fake.api.state.token!;
  expect(guestToken).toMatch(/^guest-/);
  expect(fake.to('POST', '/v1/me/age')[0]).toMatchObject({ auth: guestToken, body: { dob: '1990-05-14' } });
  expect(fake.to('PUT', '/v1/me/consent')[0]!.body).toEqual({ entries: [{ purpose: 'llm_processing', granted: true, version: 'providers-2026-11' }] });

  // 3. Capture: a text box, and the mic off with the reason.
  await page.getByRole('heading', { name: 'Draft a brief' }).waitFor();
  expect(await page.getByRole('button', { name: 'Dictate' }).isDisabled()).toBe(true);
  await page.getByText('Dictation on the web is coming').waitFor();
  await shot(page, 'place-capture');
  await page.getByRole('textbox', { name: /What do you want the AI to do/ }).fill('write a launch email for the beta');
  await page.keyboard.press('ControlOrMeta+Enter');

  // 4. The Draft sheet: fields, issues, "Why this is better".
  await page.getByRole('heading', { name: 'Claude' }).waitFor();
  expect(fake.to('POST', '/v1/forge')[0]).toMatchObject({ auth: guestToken, body: { text: 'write a launch email for the beta' } });
  await page.getByText('Say who the email is for to make it sharper.').waitFor();
  await page.getByText('Why this is better').click();
  await page.getByText('Covers 3 of 4.').waitFor();
  await page.getByRole('group', { name: 'Length, pick one' }).getByRole('button', { name: /Medium/ }).click(); // a flip redrafts
  await page.getByRole('group', { name: 'Length' }).waitFor();
  await shot(page, 'place-draft-sheet');

  // 5. Copy → receipt → "Did it work?".
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByText('Copied to the clipboard.').waitFor();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Write a launch email/);
  await page.getByRole('button', { name: 'It worked' }).click();
  await page.getByText('Thanks for telling us.').waitFor();
  await page.getByText('Sign up to keep this').waitFor();
  await shot(page, 'place-draft-receipt');

  // 6. Report this output, with the draft's decisionId.
  await page.getByRole('button', { name: 'Report this output' }).click();
  const report = page.getByRole('dialog', { name: 'Report this output' });
  await report.getByRole('radio', { name: 'Spam' }).check();
  await report.getByRole('textbox', { name: /Anything else/ }).fill('repeats itself');
  await shot(page, 'report-dialog');
  await report.getByRole('button', { name: 'Send report' }).click();
  await report.getByText('Thanks. Your report reached us.').waitFor();
  await report.getByRole('button', { name: 'Close', exact: true }).last().click();
  expect(fake.api.state.reports).toHaveLength(1);
  expect(fake.api.state.reports[0]).toMatchObject({ reason: 'spam', note: 'repeats itself', decisionId: expect.any(String) });

  // 7. Events: content-free, carrying that decisionId; the first POST got a 503 and the batch was retried.
  await expect
    .poll(() => fake.api.state.events.map((e) => e.type), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['brief.shown', 'chip.flipped', 'brief.copied', 'outcome.rated']));
  const rated = fake.api.state.events.find((e) => e.type === 'outcome.rated')!;
  expect(rated.props).toMatchObject({ decisionId: fake.api.state.reports[0]!.decisionId, rating: 'worked', surface: 'web' });
  const posts = fake.to('POST', '/v1/events');
  expect(posts.length).toBeGreaterThanOrEqual(2);
  expect(new Set(fake.api.state.events.map((e) => e.id)).size).toBe(fake.api.state.events.length);
  expect(JSON.stringify(fake.api.state.events)).not.toMatch(/launch email/);

  // 8. Sign up to keep it: the dev AuthPort, then the brief lands in Library.
  await page.getByRole('button', { name: 'Sign up' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in or sign up' });
  await signIn.getByRole('textbox', { name: /^Email/ }).fill('ana@example.com');
  await signIn.getByRole('button', { name: 'Email me a code' }).click();
  await signIn.getByRole('textbox', { name: /^Code/ }).fill('123456');
  await signIn.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => fake.api.state.library.length).toBe(1);

  // 9. Library: list, search, open.
  await page.getByRole('link', { name: 'Library' }).click();
  await page.getByRole('heading', { name: 'Library', level: 1 }).waitFor();
  await page.getByText('Write a launch email for the beta on 3 March.').first().waitFor();
  await shot(page, 'place-library');
  await page.getByRole('searchbox', { name: 'Search saved briefs' }).fill('zebra');
  await page.getByRole('heading', { name: 'Nothing matches “zebra”' }).waitFor();
  await page.getByRole('searchbox', { name: 'Search saved briefs' }).fill('launch');
  await page.getByRole('button', { name: /^Open / }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Copy' }).click();
  await page.keyboard.press('Escape');

  // 10. You: profile, the four privacy controls, memory, export, delete.
  await page.getByRole('link', { name: 'You' }).click();
  await page.getByRole('heading', { name: 'You', level: 1 }).waitFor();
  await page.getByText('ana@example.com').waitFor();
  expect(await page.getByRole('radio', { name: /This device only/ }).isDisabled()).toBe(true);
  await page.getByRole('switch', { name: /Help improve defaults/ }).click();
  await expect.poll(() => fake.api.state.consents.at(-1)).toMatchObject({ purpose: 'improve_defaults', granted: true });
  await shot(page, 'place-you');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByRole('alertdialog').waitFor();
  await shot(page, 'you-delete-confirm');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

  // 11. The ⌘K palette, by keyboard.
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.waitFor();
  await page.keyboard.type('Capture');
  await palette.getByRole('option', { name: 'Capture' }).waitFor();
  await page.keyboard.press('ArrowDown'); // the palette starts with nothing highlighted
  await shot(page, 'palette');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Draft a brief' }).waitFor();

  // 12. Installable, and the offline app shell.
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href)).json());
  expect(manifest).toMatchObject({ name: 'PromptAI', display: 'standalone' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Draft a brief' }).waitFor();
  await shot(page, 'offline-shell');
  await context.close();
});

it('renders the pseudo-locale (every string from the catalog)', async () => {
  const { context, page } = await newPage();
  await context.addInitScript(() => {
    localStorage.setItem('promptai.locale', 'pseudo');
    localStorage.setItem('promptai.firstRun', 'done');
  });
  await page.goto(baseUrl);
  const heading = page.getByRole('heading', { level: 1 });
  await heading.waitFor();
  expect(await heading.textContent()).toMatch(/^⟦.+⟧$/);
  await shot(page, 'place-capture-pseudo');
  await context.close();
});

it('gives every control 44 px under a finger', async () => {
  const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('promptai.firstRun', 'done'));
  await page.goto(baseUrl);
  await page.getByRole('heading', { name: 'Draft a brief' }).waitFor();
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, [role=tab], a[href], input, textarea')]
      .filter((el) => el.offsetParent !== null && !el.closest('[aria-hidden=true]'))
      .map((el) => ({ name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 44)
      .map(({ name, box }) => `${name}: ${Math.round(box.height)}px`),
  );
  expect(small).toEqual([]);
  await shot(page, 'place-capture-phone');
  await context.close();
});
