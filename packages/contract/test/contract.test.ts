import { describe, expect, it } from 'vitest';
import { eventSchema, forgeRequestSchema, nativeCommandSchema, nativeEventSchema } from '../src/index.ts';

describe('contract', () => {
  it('defaults locale and answers on a forge request', () => {
    expect(forgeRequestSchema.parse({ text: ' write a haiku ' })).toEqual({ text: 'write a haiku', locale: 'en', answers: {} });
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
