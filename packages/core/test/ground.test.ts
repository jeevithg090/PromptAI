import { describe, expect, it } from 'vitest';
import { findUnsourced, groundSlot, isGrounded } from '../src/ground.ts';
import { BriefSchema, type Brief } from '../src/compose/ir.ts';
import { resolveTool } from '../src/resolve.ts';
import { allCards } from './helpers.ts';

describe('isGrounded', () => {
  it.each([
    ['Formal', 'make it formal please', true],
    ['16:9', 'a wide 16:9 shot', true],
    ['३ लोग', '3 लोग आएंगे', true],                        // Devanagari digits fold to ASCII
    ['１２', 'room 12', true],                              // fullwidth digits
    ['1,00,000', 'a budget of 100,000', true],             // grouping folds
    ['Café', 'meet at the café', true],               // NFC
    ['new   york', 'flying to New York', true],             // whitespace collapse
    ['art', 'start the build', false],                      // whole words only
    ['5', 'wait 15 minutes', false],                        // whole numbers only
    ['15', 'a 15s clip', true],                             // a number next to a unit letter is its own token
    ['John', "John's laptop", true],
    ['', 'anything', false],
    ['formal', 'make it casual', false],
  ])('%s in %s', (value, source, want) => expect(isGrounded(value, source)).toBe(want));
});

it('groundSlot keeps said only when grounded', () => {
  expect(groundSlot({ value: 'experts', source: 'said' }, 'explain it for experts').source).toBe('said');
  expect(groundSlot({ value: 'experts', source: 'said' }, 'explain it').source).toBe('inferred');
  expect(groundSlot({ value: null, source: 'said' }, 'explain it').source).toBe('inferred');
  expect(groundSlot({ value: 'x', source: 'default' }, '').source).toBe('default');
});

describe('findUnsourced', () => {
  const brief = (goal: string, extra: object = {}): Brief =>
    BriefSchema.parse({ ir_version: '0.1', intent: { mode: 'do', task_family: 'generic', deliverable: { kind: 'text' } }, goal, ...extra });

  it('lists specifics that trace to no source', () => {
    const b = brief('Email Priya at priya@acme.io about the March 5 launch, budget 1,00,000, see https://acme.io/plan. Ask Rahul too, on 03/11/2026.');
    expect(findUnsourced(b, ['email priya about the launch'])).toEqual(['priya@acme.io', 'March 5', '1,00,000', 'https://acme.io/plan', 'Rahul', '03/11/2026']);
  });

  it('accepts specifics found in any source, normalized', () => {
    const b = brief('Email Priya at priya@acme.io about the March 5 launch, budget 1,00,000.');
    expect(findUnsourced(b, ['mail priya', 'PRIYA@ACME.IO', 'march 5 launch', 'budget 100,000'])).toEqual([]);
  });

  it('ignores capitals that only start a sentence or line, and the pronoun I', () => {
    const b = brief('Write it. Then I review it.\n- Check it', { context: ['Keep it short'], assumptions: [{ id: 'tone', text: 'Tone: clear and direct' }] });
    expect(findUnsourced(b, [''])).toEqual([]);
  });

  it('skips routing metadata', () => {
    const b = brief('do it', { id: 'Run-42', provenance: { '/goal': { source: 'user' } } });
    expect(findUnsourced(b, ['do it'])).toEqual([]);
  });

  it('reports each specific once', () => {
    expect(findUnsourced(brief('Acme and Acme again'), ['x'])).toEqual(['Acme']);
  });
});

describe('resolveTool', () => {
  const cards = allCards();
  it.each([
    ['write a midjourney prompt for a cat', undefined, 'midjourney'],
    ['make a song on Suno about rain', undefined, 'suno'],
    ['ask ChatGPT to summarise this', undefined, 'gpt'],
    ['draft a github issue for the crash', undefined, 'github-issue'],
    ['a flux 3 image of a fox', undefined, 'flux3'],
    ['a veo clip of waves', undefined, 'gemini-omni-video'],
    ['fix the login bug', 'Cursor', 'cursor'],
    ['fix the login bug', 'com.todesktop.230313mzl4w4u92', 'cursor'],
    ['summarise this', 'com.anthropic.claudefordesktop', 'claude'],
    ['write a midjourney prompt', 'Cursor', 'midjourney'],           // a named tool beats the host app
    ['use Claude to brainstorm, then Midjourney', undefined, 'claude'], // leftmost mention
    ['fix the flaky test in cursor', 'Slack', 'cursor'],
    ['move the cursor to the left', 'Slack', null],                  // the bare id is not a spoken name
    ['plans are in flux', undefined, null],
    ['write a haiku', undefined, null],
    ['write a haiku', 'Notes', null],
  ])('%s (host %s)', (text, host, want) => expect(resolveTool(text, host, cards)).toBe(want));

  it('never resolves to the generic card', () => {
    expect(resolveTool('any ai tool', 'generic', cards)).toBe(null);
  });
});
