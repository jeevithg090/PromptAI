import { extractJson } from '../../src/utils/json';

describe('extractJson (tolerant LLM-output parsing)', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses markdown-fenced JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('slices JSON out of surrounding prose (reasoning-model preamble/postamble)', () => {
    expect(extractJson('Sure! Here is the result:\n{"a":1, "b":[2,3]}\nHope that helps.')).toEqual({ a: 1, b: [2, 3] });
  });

  it('handles a top-level array', () => {
    expect(extractJson('[{"x":1},{"x":2}]')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow(/no parseable JSON/);
  });

  it('throws on genuinely truncated JSON (does not silently accept partial)', () => {
    expect(() => extractJson('{"nodes":[{"type":"subject","value":"a hor')).toThrow();
  });
});
