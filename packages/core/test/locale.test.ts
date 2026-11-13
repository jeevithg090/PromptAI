/** Locale packs (catalog/locales): parsing, pack-driven cleanup and the voice-command grammar. */
import { describe, expect, it } from 'vitest';
import { cleanTranscript, numbersConsistent } from '../src/clean.ts';
import { lookupPack, matchVoiceCommand, parseLocalePack } from '../src/locale.ts';
import { localePack, localePacks } from './helpers.ts';

const en = localePack('en'), enIN = localePack('en-IN'), hinglish = localePack('hi-Latn');

it('every catalog pack parses, and the folder name is its locale', () => {
  expect(localePacks().map((p) => p.locale)).toEqual(['en', 'en-IN', 'hi-Latn']);
});

it('bad packs are rejected with useful messages', () => {
  const cases: Array<[string, RegExp]> = [
    ['locale: en\ncommands: { refine: [{ say: "change tone", instruction: "x {x}" }] }', /exactly one \{x\}/],
    ['locale: en\ncommands: { insert: ["insert {x}"] }', /refine phrases only/],
    ['locale: en\ncommands: { cancel: ["cancel [it"] }', /bracket/],
    ['locale: en\ncommands: { refine: [{ say: "make it {x}", instruction: "no placeholder" }] }', /instruction needs/],
    ['locale: en\nfillers: ["two words"]', /fillers/],
    ['locale: en\nnumbers: { scales: { lakh: 1 } }', /numbers/],
    ['locale: english_US', /locale/],
    ['locale: en\nextra: 1', /Unrecognized/i],
  ];
  for (const [yaml, re] of cases) expect(() => parseLocalePack(yaml), yaml).toThrow(re);
});

it('lookupPack falls back along the tag (RFC 4647 lookup)', () => {
  const packs = localePacks();
  expect(lookupPack(packs, 'en-IN')?.locale).toBe('en-IN');
  expect(lookupPack(packs, 'en-US')?.locale).toBe('en');
  expect(lookupPack(packs, 'hi-Latn-IN')?.locale).toBe('hi-Latn');
  expect(lookupPack(packs, 'hi')).toBeUndefined();   // Devanagari Hindi is not Hinglish
  expect(lookupPack(undefined, 'en')).toBeUndefined();
});

describe('cleanTranscript with a pack', () => {
  it('without a pack nothing changes', () => {
    expect(cleanTranscript('hmm send it to chat gpt', 'en')).toBe('hmm send it to chat gpt');
  });

  it('removes pack fillers and applies replacements', () => {
    expect(cleanTranscript('hmm, ask chat gpt to review the git hub PR', 'en', en)).toBe('ask ChatGPT to review the GitHub PR');
    expect(cleanTranscript('Hmm, the build is green. Mhm ship it', 'en', en)).toBe('The build is green. Ship it');   // the capital moves on, like "Um"
    expect(cleanTranscript('the hmmingbird stays', 'en', en)).toBe('the hmmingbird stays');
  });

  it('turns "<number> <scale>" into grouped digits, with the pack grouping', () => {
    expect(cleanTranscript('the budget is 5 lakh and 2.5 crore', 'en-IN', enIN)).toBe('the budget is 5,00,000 and 2,50,00,000');
    expect(cleanTranscript('raise five thousand dollars', 'en', en)).toBe('raise 5,000 dollars');
    expect(cleanTranscript('1.5 million users', 'en', en)).toBe('1,500,000 users');
    expect(cleanTranscript('budget paanch lakh hai, do sau log', 'hi-Latn', hinglish)).toBe('budget 5,00,000 hai, 200 log');
  });

  it('leaves numbers alone where conversion could change meaning', () => {
    expect(cleanTranscript('in two thousand twenty six', 'en', en)).toBe('in two thousand twenty six');
    expect(cleanTranscript('5 lakh 50 thousand', 'en-IN', enIN)).toBe('5 lakh 50,000');
    expect(cleanTranscript('1.23456 thousand', 'en', en)).toBe('1.23456 thousand');
    expect(cleanTranscript('do it now', 'hi-Latn', hinglish)).toBe('do it now');   // "do" is two only before a scale word
    expect(cleanTranscript('a thousand thanks', 'en', en)).toBe('a thousand thanks');
  });

  it('Hinglish layout words: "naya line" built in, "naya paragraph" from the pack', () => {
    expect(cleanTranscript('pehla point naya line doosra point naya paragraph teesra', 'hi-Latn', hinglish)).toBe('pehla point\ndoosra point\n\nteesra');
  });

  it('the number rule agrees with the pack: "5 lakh" equals 500000', () => {
    expect(numbersConsistent('budget 5 lakh', 'budget 5,00,000', enIN)).toBe(true);
    expect(numbersConsistent('budget paanch lakh', 'budget 500000', hinglish)).toBe(true);
    expect(numbersConsistent('budget 5 lakh', 'budget 50,000', enIN)).toBe(false);
    expect(numbersConsistent('budget 5 lakh', 'budget 5,00,000')).toBe(false);   // without a pack, lakh is a word
  });
});

describe('matchVoiceCommand', () => {
  it.each([
    ['insert', en, { kind: 'insert' }],
    ['Insert it.', en, { kind: 'insert' }],
    ['copy', en, { kind: 'copy' }],
    ['copy that!', en, { kind: 'copy' }],
    ['just draft it', en, { kind: 'just_draft' }],
    ['cancel', en, { kind: 'cancel' }],
    ['never mind', en, { kind: 'cancel' }],
    ['change tone to formal', en, { kind: 'refine', instruction: 'Change the tone to formal.' }],
    ['Change the tone to warm and friendly', en, { kind: 'refine', instruction: 'Change the tone to warm and friendly.' }],
    ['make it shorter', en, { kind: 'refine', instruction: 'Make it shorter.' }],
    ['insert', enIN, { kind: 'insert' }],
    ['cancel karo', hinglish, { kind: 'cancel' }],
    ['cancel kar do', hinglish, { kind: 'cancel' }],
    ['insert karo', hinglish, { kind: 'insert' }],
    ['copy karo', hinglish, { kind: 'copy' }],
    ['bas draft karo', hinglish, { kind: 'just_draft' }],
    ['tone formal karo', hinglish, { kind: 'refine', instruction: 'Change the tone to formal.' }],
  ] as const)('%s', (text, pack, want) => expect(matchVoiceCommand(text, pack)).toEqual(want));

  it.each([
    'insert a table of last quarter results',
    'copy the tone of my last email',
    'please make the intro punchier and cut the second paragraph',
    'cancel karo',          // Hinglish, but this is the English pack
    '',
    '...',
  ])('anything else is null, a Refine instruction for the caller: %s', (text) => expect(matchVoiceCommand(text, en)).toBeNull());
});
