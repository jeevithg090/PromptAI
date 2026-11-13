/** L1 counts, frecency, vocabulary ranking and the ISO parser: pure functions over rows. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contextKey, countDefault, weightFor, L1, SHOW_GATE, type CountRow } from '../src/learn.ts';
import { frecencyTool, rankVocabulary, FRECENCY_TAU_DAYS } from '../src/predict.ts';
import { ageDays, isoMs } from '../src/time.ts';

const NOW = '2026-11-13T00:00:00Z';
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

describe('isoMs (no Date in core)', () => {
  it('agrees with Date.parse on ISO strings', () => {
    fc.assert(fc.property(fc.date({ min: new Date('1900-01-01'), max: new Date('2200-12-31'), noInvalidDate: true }), (d) => {
      expect(isoMs(d.toISOString())).toBe(d.getTime());
    }), { numRuns: 500 });
    for (const s of ['2026-11-13', '2026-11-13T10:30:00+05:30', '2026-02-28T23:59:59.5-08:00', '2024-02-29T00:00Z']) expect(isoMs(s), s).toBe(Date.parse(s));
  });

  it('rejects what is not ISO 8601, and ages are never negative', () => {
    for (const s of ['', 'yesterday', '2026-13-01', '2026-11-32', '13/11/2026', '2026-11-13T25:00:00Z']) expect(isoMs(s), s).toBeNaN();
    expect(ageDays('2026-11-20T00:00:00Z', NOW)).toBe(0);
    expect(ageDays('2026-11-03T00:00:00Z', NOW)).toBe(10);
  });
});

describe('L1 counts', () => {
  const tone = { id: 'tone', impact: 1, options: ['formal', 'friendly', 'concise'], default: 'clear and direct' };
  const key = contextKey({ toolId: 'gmail', hostApp: 'Mail', recipientClass: 'manager' });
  const row = (value: string, d = 1, k = key, weight = 1): CountRow => ({ slotId: 'tone', value, contextKey: k, weight, at: daysAgo(d) });

  it('contextKey is stable, normalized and unambiguous', () => {
    expect(contextKey({ toolId: 'gmail', hostApp: ' Mail ', recipientClass: 'Manager' })).toBe(key);
    expect(contextKey({ toolId: 'gmail' })).toBe('gmail||');
    expect(contextKey({ toolId: 'a|b' })).not.toBe(contextKey({ toolId: 'a', hostApp: 'b' }));
  });

  it('weights: explicit choices and opened or successful chips count; a chip kept unopened counts 0', () => {
    expect(['pick', 'flip', 'answer', 'kept_opened', 'kept_went_well'].map((s) => weightFor(s as never))).toEqual([1, 1, 1, 1, 1]);
    expect(weightFor('kept_unopened')).toBe(0);
  });

  it('a Dirichlet with pseudo-count 2: two picks in this context clear the pre-fill gate, one does not', () => {
    expect(countDefault([row('formal')], tone, key, NOW)).toBeNull();
    const two = countDefault([row('formal'), row('formal', 2)], tone, key, NOW)!;
    expect(two.value).toBe('formal');
    expect(two.p).toBeGreaterThan(SHOW_GATE.prefill);
    // by hand: 4 candidates (3 options + default), uniform base 1/4, weights ~1 a day old
    const w = 0.5 ** (1 / 30) + 0.5 ** (2 / 30);
    const pFree = (w + 2 / 4) / (w + 2);
    expect(two.p).toBeCloseTo((w + 2 * pFree) / (w + 2), 10);
  });

  it('backs off to the context-free count, which needs more evidence', () => {
    const elsewhere = (n: number) => Array.from({ length: n }, (_, i) => row('formal', i + 1, 'slack||'));
    expect(countDefault(elsewhere(3), tone, key, NOW)).toBeNull();
    expect(countDefault(elsewhere(5), tone, key, NOW)?.value).toBe('formal');
    // the context's own evidence outweighs the back-off
    const mixed = [...elsewhere(5), row('friendly', 1), row('friendly', 2), row('friendly', 3)];
    expect(countDefault(mixed, tone, key, NOW)?.value).toBe('friendly');
  });

  it('half-life 30 days: the same picks a month older weigh half', () => {
    const fresh = countDefault([row('formal', 0), row('formal', 0)], tone, key, NOW)!;
    const old = [row('formal', 30), row('formal', 30), row('formal', 30), row('formal', 30)];
    expect(countDefault(old, tone, key, NOW)!.p).toBeCloseTo(fresh.p, 10);
    expect(L1.halfLifeDays).toBe(30);
  });

  it('caps personal p at 0.85 on impact-3 slots', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row('formal', i));
    expect(countDefault(rows, tone, key, NOW)!.p).toBeGreaterThan(0.9);
    expect(countDefault(rows, { ...tone, impact: 3 }, key, NOW)!.p).toBe(L1.impact3Cap);
  });

  it("ignores zero weights, invalid dates and another tool's values that are not this slot's options", () => {
    expect(countDefault(Array.from({ length: 5 }, () => row('formal', 1, key, 0)), tone, key, NOW)).toBeNull();
    expect(countDefault([{ ...row('formal'), at: 'nope' }, { ...row('formal'), at: 'nope' }], tone, key, NOW)).toBeNull();
    const otherTool = Array.from({ length: 9 }, (_, i) => row('documentary', i, 'veo||'));
    expect(countDefault(otherTool, tone, key, NOW)).toBeNull();
    // a custom value the user chose in this very context is a candidate
    expect(countDefault([row('like a pirate'), row('like a pirate', 2), row('like a pirate', 3)], tone, key, NOW)?.value).toBe('like a pirate');
  });

  it('p is a probability and the choice is deterministic, for any rows', () => {
    const rows = fc.array(fc.record({
      slotId: fc.constantFrom('tone', 'other'), value: fc.constantFrom('formal', 'friendly', 'concise', 'x'),
      contextKey: fc.constantFrom(key, 'slack||'), weight: fc.double({ min: 0, max: 1, noNaN: true }), at: fc.integer({ min: 0, max: 400 }).map(daysAgo),
    }), { maxLength: 30 });
    fc.assert(fc.property(rows, (rs) => {
      const a = countDefault(rs, tone, key, NOW);
      expect(a).toEqual(countDefault([...rs].reverse(), tone, key, NOW));
      if (a) { expect(a.p).toBeGreaterThan(SHOW_GATE.prefill); expect(a.p).toBeLessThanOrEqual(1); }
    }), { numRuns: 300 });
  });
});

describe('frecency', () => {
  const use = (toolId: string, d: number, hostApp: string | null = 'Slack', surface = 'desktop') => ({ toolId, hostApp, surface, at: daysAgo(d) });

  it('scores Σ exp(−Δt/τ) per tool in the (host app, surface) bucket', () => {
    const r = frecencyTool([use('claude', 0), use('gpt', 14), use('gpt', 14)], { hostApp: 'Slack', surface: 'desktop', now: NOW })!;
    const claude = 1, gpt = 2 * Math.exp(-14 / FRECENCY_TAU_DAYS);
    expect(r).toEqual({ toolId: 'claude', p: claude / (claude + gpt), scope: 'context' });
  });

  it('recent habits win over old ones', () => {
    const rows = [...Array.from({ length: 5 }, (_, i) => use('gpt', 90 + i)), use('claude', 1), use('claude', 2)];
    expect(frecencyTool(rows, { hostApp: 'Slack', surface: 'desktop', now: NOW })?.toolId).toBe('claude');
  });

  it('backs off to all usage when the bucket is empty, and returns null with no usage', () => {
    const rows = [use('gpt', 1, null, 'web'), use('gpt', 2, 'Notes', 'desktop')];
    expect(frecencyTool(rows, { hostApp: 'Slack', surface: 'desktop', now: NOW })).toEqual({ toolId: 'gpt', p: 1, scope: 'global' });
    expect(frecencyTool(rows, { hostApp: null, surface: 'web', now: NOW })?.scope).toBe('context');
    expect(frecencyTool([], { hostApp: 'Slack', surface: 'desktop', now: NOW })).toBeNull();
  });
});

describe('vocabulary ranking', () => {
  const item = (text: string, uses: number, d: number, hostApps?: string[]) => ({ text, uses, lastUsedAt: daysAgo(d), ...(hostApps && { hostApps }) });

  it('ranks by recency × frequency × app match and keeps the top k', () => {
    const items = [item('Kubernetes', 10, 1), item('Priya', 2, 1, ['Slack']), item('pgvector', 10, 120), item('Figma', 3, 2, ['Figma'])];
    // Priya: (1 + ln 3) × 2 for the Slack match beats Kubernetes's (1 + ln 11); pgvector is four months stale
    expect(rankVocabulary(items, { hostApp: 'Slack', now: NOW, k: 3 })).toEqual(['Priya', 'Kubernetes', 'Figma']);
    expect(rankVocabulary(items, { hostApp: 'Figma', now: NOW, k: 2 })).toEqual(['Figma', 'Kubernetes']);
    expect(rankVocabulary(items, { now: NOW, k: 1 })).toEqual(['Kubernetes']);
  });

  it('dedupes, skips blanks and bad dates, and is deterministic', () => {
    const items = [item('GPT', 1, 1), item(' gpt ', 5, 1), item('', 9, 0), { text: 'x', uses: 1, lastUsedAt: 'never' }, item('b', 1, 1), item('a', 1, 1)];
    expect(rankVocabulary(items, { now: NOW, k: 10 })).toEqual(['gpt', 'a', 'b']);
    expect(rankVocabulary(items, { now: NOW, k: 0 })).toEqual([]);
  });
});
