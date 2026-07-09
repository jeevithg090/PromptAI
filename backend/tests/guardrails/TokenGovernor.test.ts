import { govern, estimateTokens } from '../../src/guardrails/TokenGovernor';
import type { Platform } from '../../src/types/Platform';

const platform: Platform = {
  platform_id: 'test',
  display_name: 'Test Platform',
  modalities: ['image'],
  url_patterns: [],
  dom_fingerprint_selectors: [],
  input_selector_candidates: [],
  docs_url: 'https://example.com',
  quirks: [],
  syntax_rules: [],
  max_prompt_tokens: 100,
  tos_reviewed: true,
};

describe('TokenGovernor (deterministic, §16)', () => {
  it('counts more tokens for longer text', () => {
    expect(estimateTokens('word '.repeat(100))).toBeGreaterThan(estimateTokens('word'));
  });

  it('flags prompts over the platform length ceiling', () => {
    const long = 'descriptor, '.repeat(80); // ~well over 100 tokens
    const report = govern(long, platform);
    expect(report.exceedsPlatformLength).toBe(true);
    expect(report.suggestions.length).toBeGreaterThan(0);
  });

  it('does not flag a short prompt', () => {
    const report = govern('a red bicycle', platform);
    expect(report.exceedsPlatformLength).toBe(false);
  });
});
