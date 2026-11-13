/** Golden-file tests: every fixture x every card. UPDATE_GOLDEN=1 rewrites the files. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '../src/compose/render.ts';
import { allCards, fixtureIds, goldenText, loadFixture, GOLDEN_DIR } from './helpers.ts';

const UPDATE = process.env.UPDATE_GOLDEN === '1';
const HARD = new Set(['template_artifact', 'template_error', 'field_empty', 'brief_invalid', 'schema_violation']);

describe('golden', () => {
  for (const fx of fixtureIds()) {
    for (const card of allCards()) {
      it(`${fx} -> ${card.id}`, () => {
        const r = render(loadFixture(fx), card);
        // deterministic: same input, same bytes
        expect(goldenText(fx, render(loadFixture(fx), card))).toBe(goldenText(fx, r));
        expect(r.issues.filter((i) => HARD.has(i.code))).toEqual([]);
        const file = `${GOLDEN_DIR}${fx}/${card.id}.txt`;
        const text = goldenText(fx, r);
        if (UPDATE) { mkdirSync(`${GOLDEN_DIR}${fx}`, { recursive: true }); writeFileSync(file, text); return; }
        expect(existsSync(file), `missing golden ${file}; run UPDATE_GOLDEN=1`).toBe(true);
        expect(text).toBe(readFileSync(file, 'utf8'));
      });
    }
  }
});
