import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { forge, type Clock } from '@promptai/core';
import { forgeResponseSchema } from '@promptai/contract';
import { createApp } from '../src/app.ts';
import { loadCatalog } from '../src/catalog.ts';

/** The real catalog through the real core forge, as main.ts wires it. */
const CATALOG = path.resolve(import.meta.dirname, '../../../catalog');
const clock: Clock = {
  now: () => performance.now(),
  after: (ms) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
  },
};

async function appWithCatalog() {
  const cards = await loadCatalog(CATALOG);
  const events = { insert: async () => {} };
  return { cards, app: createApp({ forge: (req) => forge(req, { cards, clock }), events, log: () => {} }) };
}

async function post(app: Awaited<ReturnType<typeof appWithCatalog>>['app'], body: unknown) {
  const res = await app.request('/v1/forge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('catalog + core forge', () => {
  it('loads every tool card and the generic family card', async () => {
    const { cards } = await appWithCatalog();
    const ids = cards.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['claude', 'gpt', 'midjourney', 'cursor', 'generic']));
  });

  it('drafts for the tool named in the text, with no LLM configured', async () => {
    const { app } = await appWithCatalog();
    const { status, body } = await post(app, { text: 'write a launch email for the PromptAI beta in Claude' });
    expect(status).toBe(200);
    const res = forgeResponseSchema.parse(body);
    expect(res.toolId).toBe('claude');
    expect(res.brief).toContain('launch email');
    expect(res.usage.llmCalls).toBe(0);
  });

  it('uses the host app when the text names no tool, and falls back to generic otherwise', async () => {
    const { app } = await appWithCatalog();
    const hinted = forgeResponseSchema.parse((await post(app, { text: 'a fox in the snow at dusk', toolHint: 'midjourney' })).body);
    expect(hinted.toolId).toBe('midjourney');
    const plain = forgeResponseSchema.parse((await post(app, { text: 'summarise my notes from today' })).body);
    expect(plain.toolId).toBe('generic');
  });

  it('fails startup on a malformed card, naming the file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'catalog-'));
    await mkdir(path.join(root, 'tools', 'broken'), { recursive: true });
    await mkdir(path.join(root, 'families'));
    await writeFile(path.join(root, 'tools', 'broken', 'card.yaml'), 'id: broken\n');
    await expect(loadCatalog(root)).rejects.toThrow(/tools\/broken\/card\.yaml/);
  });
});
