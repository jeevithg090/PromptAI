import { describe, expect, it } from 'vitest';
import {
  consentUpdateSchema,
  eventSchema,
  forgeRequestSchema,
  forgeResponseSchema,
  intentFrameSchema,
  nativeCommandSchema,
  nativeEventSchema,
  reportRequestSchema,
} from '../src/index.ts';

describe('contract', () => {
  it('defaults surface, locale and answers on a forge request', () => {
    expect(forgeRequestSchema.parse({ text: ' write a haiku ' })).toEqual({ text: 'write a haiku', surface: 'web', locale: 'en', answers: {} });
  });

  it('fills the v2 response defaults so a v1-shaped response still parses', () => {
    const parsed = forgeResponseSchema.parse({
      toolId: 'generic',
      toolName: 'Generic',
      brief: 'x',
      assumptions: [],
      unsourced: [],
      coverage: { covered: 0, total: 0 },
      usage: { llmCalls: 0, ms: 1 },
    });
    expect(parsed.fields).toEqual([]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.coverage.items).toEqual([]);
  });

  it('requires a target on a report and accepts a valid consent update', () => {
    expect(reportRequestSchema.safeParse({ reason: 'wrong_or_harmful' }).success).toBe(false);
    expect(reportRequestSchema.safeParse({ reason: 'spam', artifactId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' }).success).toBe(true);
    expect(consentUpdateSchema.safeParse({ entries: [{ purpose: 'improve_defaults', granted: false, version: '1' }] }).success).toBe(true);
    expect(consentUpdateSchema.safeParse({ entries: [{ purpose: 'sell_my_data', granted: true, version: '1' }] }).success).toBe(false);
  });

  it('validates an IntentFrame with the language context', () => {
    const frame = intentFrameSchema.parse({
      family: 'writing.email',
      target: { toolId: 'gmail', source: 'context' },
      goal: 'Ask for a deadline extension',
      deliverable: 'an email',
      successCriteria: ['polite', 'under 120 words'],
      slots: [{ id: 'recipient', value: 'my manager', source: 'said', confidence: 'high' }],
      coveredForYou: [{ text: 'A clear subject line' }],
      unsure: [],
      language: { spoken: ['en-IN', 'hi'], script: 'Latn' },
      risk: 'none',
    });
    expect(frame.language.spoken).toEqual(['en-IN', 'hi']);
  });

  it('rejects an empty forge request', () => {
    expect(forgeRequestSchema.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('accepts a well-formed event and rejects a non-uuid id', () => {
    const at = '2026-11-13T10:00:00.000Z';
    expect(eventSchema.safeParse({ id: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', type: 'brief.inserted', at }).success).toBe(true);
    expect(eventSchema.safeParse({ id: 'nope', type: 'brief.inserted', at }).success).toBe(false);
  });

  it('round-trips the native protocol', () => {
    expect(nativeCommandSchema.parse({ cmd: 'paste', id: '1', text: 'hi' })).toEqual({ cmd: 'paste', id: '1', text: 'hi', restoreClipboard: true });
    expect(nativeEventSchema.parse({ event: 'hotkey', state: 'up' })).toEqual({ event: 'hotkey', state: 'up' });
    expect(nativeEventSchema.safeParse({ event: 'hotkey', state: 'sideways' }).success).toBe(false);
  });
});
