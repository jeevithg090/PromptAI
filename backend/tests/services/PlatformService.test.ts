import { listPlatforms, getPlatform, loadRegistry } from '../../src/services/PlatformService';

describe('PlatformService / registry (§5.1)', () => {
  it('loads and validates the registry file against the schema', () => {
    const reg = loadRegistry();
    expect(reg.platforms.length).toBeGreaterThanOrEqual(3);
  });

  it('lists the launch platforms', () => {
    const ids = listPlatforms().map((p) => p.platform_id);
    expect(ids).toContain('google_gemini');
    expect(ids).toContain('midjourney');
  });

  it('resolves a known platform and returns undefined for an unknown one', () => {
    expect(getPlatform('anthropic_claude')?.display_name).toBe('Claude (Anthropic)');
    expect(getPlatform('nope')).toBeUndefined();
  });
});
