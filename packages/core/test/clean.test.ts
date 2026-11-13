import { describe, expect, it } from 'vitest';
import { cleanTranscript, numbersConsistent } from '../src/clean.ts';

const clean = (t: string, locale = 'en') => cleanTranscript(t, locale);

describe('fillers', () => {
  it.each([
    ['um so i was thinking we could uh move the standup to tomorrow morning', 'so i was thinking we could move the standup to tomorrow morning'],
    ['Uh, the build is, um, failing on the main branch again.', 'The build is failing on the main branch again.'],
    ['Erm, the er numbers look fine', 'The numbers look fine'],
    ['I think so, um.', 'I think so.'],
    ['Ummm uhh hello', 'Hello'],
  ])('%s', (raw, want) => expect(clean(raw)).toBe(want));

  it('keeps words that only look like fillers', () => {
    expect(clean('To err is human')).toBe('To err is human');
    expect(clean('Take him to the ER now')).toBe('Take him to the ER now');
    expect(clean('The umbrella and the herd')).toBe('The umbrella and the herd');
    expect(clean("It's in the user's um-brella")).toBe("It's in the user's um-brella");
  });
});

describe('"you know"', () => {
  it.each([
    ['i was like you know really impressed with the demo', 'i was really impressed with the demo'],
    ['You know, the thing is broken', 'The thing is broken'],
    ["it's broken, you know.", "it's broken."],
  ])('removes the filler: %s', (raw, want) => expect(clean(raw)).toBe(want));

  it.each([
    'Do you know the way to the station',
    "I'll let you know tomorrow",
    'if you know him, ask him',
    'you know what I mean',
    'as you know, the deadline moved',
  ])('keeps the verb: %s', (raw) => expect(clean(raw)).toBe(raw));
});

describe('"like"', () => {
  it.each([
    ['it was, like, huge', 'it was huge'],
    ['Like, I do not know', 'I do not know'],
    ["she's like totally sure", "she's totally sure"],
    ['I was like, so excited', 'I was so excited'],
  ])('removes the filler: %s', (raw, want) => expect(clean(raw)).toBe(want));

  it.each([
    'I like pizza',
    'it is like a dream',
    'it looks like rain',
    'it takes like 5 minutes',
    'he was like, no way',
    'I just like really spicy food',
    'Like I said, ship it',
  ])('keeps meaningful like: %s', (raw) => expect(clean(raw)).toBe(raw));
});

describe('"scratch that"', () => {
  it.each([
    ['Send it to John, scratch that, send it to Mary', 'Send it to Mary'],
    ['Book a table for four. Scratch that, book for five.', 'Book for five.'],
    ['We need milk, eggs, scratch that, bread', 'We need milk, bread'],
    ['It costs 5.50, scratch that, 6', '6'],
    ['first line new line second line scratch that third line', 'first line\nthird line'],
    ['Buy apples, scratch that', ''],
    ['Get milk, buy apples, scratch that', 'Get milk'],
    ['scratch that hello', 'hello'],
    ['one, two scratch that three, scratch that four', 'one, four'],
    // the repair restarts the clause: only the restarted part goes
    ['I want a song about my dog, scratch that, about my cat', 'I want a song about my cat'],
    ['Meet at the cafe at noon, scratch that, at one', 'Meet at the cafe at one'],
    ['Call Mom about dinner, scratch that, call Dad', 'Call Dad'],
  ])('%s', (raw, want) => expect(clean(raw)).toBe(want));
});

describe('layout commands', () => {
  it.each([
    ['Dear John, new line thanks for the update', 'Dear John,\nthanks for the update'],
    ['Intro new paragraph Body text', 'Intro\n\nBody text'],
    ['Hello New line. How are you', 'Hello\nHow are you'],
    ['pehla point naya line doosra point', 'pehla point\ndoosra point'],
  ])('%s', (raw, want) => expect(clean(raw)).toBe(want));

  it.each([
    'we are launching a new line of products',
    'start a new paragraph about pricing',
    'draw the new line of the chart',
  ])('keeps content: %s', (raw) => expect(clean(raw)).toBe(raw));
});

describe('en-IN number grouping', () => {
  it('regroups grouped numbers in Indian style only for en-IN', () => {
    expect(clean('budget is 100,000 and 1,234,567.50 rupees', 'en-IN')).toBe('budget is 1,00,000 and 12,34,567.50 rupees');
    expect(clean('budget is 100,000', 'en-US')).toBe('budget is 100,000');
    expect(clean('budget is 100,000', 'EN-in')).toBe('budget is 1,00,000');
    expect(clean('1,000 items', 'en-IN')).toBe('1,000 items');
  });

  it('leaves bare digit runs (PIN codes, phone numbers) alone', () => {
    expect(clean('pin 560001, call 9876543210', 'en-IN')).toBe('pin 560001, call 9876543210');
  });
});

it('runs English rules only for en and hi locales', () => {
  expect(clean('Er ist um zehn Uhr da', 'de')).toBe('Er ist um zehn Uhr da');
  expect(clean('pehle yeh um naya line theek hai', 'hi-Latn')).toBe('pehle yeh\ntheek hai');
});

describe('numbersConsistent', () => {
  it.each([
    ['meet at 5:30 with 3 people', 'Meet at 5:30 with 3 people.', true],
    ['budget 100,000', 'budget 1,00,000', true],
    ['budget 100000', 'budget 1,00,000', true],
    ['राशि ५०० है', 'amount 500', true],
    ['meet at 5', 'meet at 6', false],
    ['price 2.5', 'price 25', false],
    ['no numbers here', 'still none', true],
    ['call 3 people', 'call three people', true],
  ])('%s -> %s', (before, after, want) => expect(numbersConsistent(before, after)).toBe(want));
});
