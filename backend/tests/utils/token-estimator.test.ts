import { estimateTokens } from '../../src/utils/token-estimator';

describe('estimateTokens', () => {
  it('returns ceil(len/4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('handles multi-word text', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const tokens = estimateTokens(text);
    expect(tokens).toBe(Math.ceil(text.length / 4));
  });
});
