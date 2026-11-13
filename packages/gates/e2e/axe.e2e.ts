/**
 * axe (docs/blueprint/BLUEPRINT.md §14 G0 UI checks, docs/gates.md): the
 * built apps/app in both themes at 320, 390 and 1280 px, on each screen a
 * user reaches (the ask form, then a draft). Fails on any serious or
 * critical violation.
 */
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_DIST, builtAppOrigin, completeFirstRun, startFront, startServer } from './harness.ts';

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [320, 390, 1280] as const;

/**
 * Baseline: violations that existed when the gate was added (2026-11-13),
 * printed but not failing. It only shrinks: fix one, then delete its entry.
 */
// Baseline of serious findings that existed when the gate was added. Empty: the
// chip label mismatch (WCAG 2.5.3) was fixed on 2026-11-13. Only ever shrinks.
const KNOWN: Record<string, string> = {};
const knownSeen = new Set<string>();

let server: Awaited<ReturnType<typeof startServer>>;
let front: Awaited<ReturnType<typeof startFront>>;
let browser: Browser;

beforeAll(async () => {
  const listen = await builtAppOrigin();
  server = await startServer();
  front = await startFront({ upstream: server.url, listen, staticDir: APP_DIST });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await front?.close();
  server?.stop();
  for (const [id, where] of Object.entries(KNOWN)) {
    console.log(knownSeen.has(id) ? `axe baseline: ${id} still occurs in ${where}` : `axe baseline: ${id} no longer occurs; delete it from KNOWN in packages/gates/e2e/axe.e2e.ts`);
  }
});

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of serious) if (KNOWN[v.id]) knownSeen.add(v.id);
  return serious
    .filter((v) => !KNOWN[v.id])
    .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`);
}

describe.each(THEMES)('%s theme', (theme) => {
  it.each(WIDTHS)('%i px: no serious or critical axe violations', async (width) => {
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme });
    // The same key public/color-mode.js reads, so the app's own theme switch is used too.
    await context.addInitScript((mode) => {
      try {
        localStorage.setItem('promptai.mode', mode);
      } catch {}
    }, theme);
    try {
      const page = await context.newPage();
      await page.goto(`${front.origin}/`);
      const found: string[] = [];
      await completeFirstRun(page, async (screen) => {
        found.push(...(await seriousViolations(page)).map((v) => `first run (${screen}): ${v}`));
      });
      const ask = page.getByRole('textbox').first();
      await ask.waitFor();
      found.push(...(await seriousViolations(page)).map((v) => `ask form: ${v}`));

      await ask.fill('write a launch email for the beta in Claude');
      const forged = page.waitForResponse((r) => new URL(r.url()).pathname === '/v1/forge');
      await ask.press('ControlOrMeta+Enter');
      await forged;
      await page.getByRole('button', { name: /copy/i }).first().waitFor();
      found.push(...(await seriousViolations(page)).map((v) => `draft: ${v}`));

      expect(found).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
