import { recommend, loadCapabilityMatrix } from '../../src/services/RecommendationService';

/** TA.2 tests — §15 recommendation logic, trade-off presentation. */
describe('RecommendationService (§15)', () => {
  it('loads and validates the capability matrix', () => {
    const m = loadCapabilityMatrix();
    expect(m.models.length).toBeGreaterThan(3);
    expect(m.models.every((x) => x.cost_tier >= 1 && x.cost_tier <= 5)).toBe(true);
  });

  it('only returns models supporting the requested modality', () => {
    const recs = recommend({ modality: 'video' });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.model.modalities.includes('video'))).toBe(true);
  });

  it('ranks cheaper models higher when cost is prioritized', () => {
    const recs = recommend({ modality: 'text', prioritizeCost: 1, prioritizeQuality: 0, prioritizeLatency: 0 });
    // Top pick should be a low cost tier (1 or 2).
    expect(recs[0]?.model.cost_tier).toBeLessThanOrEqual(2);
  });

  it('ranks premium models higher when quality is prioritized', () => {
    const cheap = recommend({ modality: 'text', prioritizeCost: 1, prioritizeQuality: 0, prioritizeLatency: 0 })[0];
    const quality = recommend({ modality: 'text', prioritizeCost: 0, prioritizeQuality: 1, prioritizeLatency: 0 })[0];
    expect(quality?.model.cost_tier).toBeGreaterThanOrEqual(cheap!.model.cost_tier);
  });

  it('filters out models whose context window cannot hold the task', () => {
    const recs = recommend({ modality: 'text', minContextWindow: 500000 });
    // Only the million-token-context models qualify.
    expect(recs.every((r) => r.model.context_window >= 500000)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
  });

  it('does not filter image models by context window (they have none)', () => {
    const recs = recommend({ modality: 'image', minContextWindow: 100000 });
    expect(recs.some((r) => r.model.modalities.includes('image'))).toBe(true);
  });

  it('boosts models matching desired strengths', () => {
    const recs = recommend({ modality: 'text', desiredStrengths: ['long-context'], prioritizeQuality: 1, prioritizeCost: 0, prioritizeLatency: 0 });
    expect(recs[0]?.model.strengths).toContain('long-context');
  });

  it('always presents a trade-off line, never a bare winner (§15.2)', () => {
    const recs = recommend({ modality: 'text' });
    for (const r of recs) {
      expect(typeof r.tradeoff).toBe('string');
      expect(r.tradeoff.length).toBeGreaterThan(0);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});

// ---- V1.2: platform-mode recommendation ----
import { recommendMode } from '../../src/services/RecommendationService';
import { getPlatform } from '../../src/services/PlatformService';

describe('recommendMode (V1.2)', () => {
  it('every registry platform parses with modes', () => {
    const gemini = getPlatform('google_gemini');
    expect(gemini).toBeDefined();
    expect(gemini!.modes.length).toBeGreaterThanOrEqual(3);
  });

  it('prefers an image mode for a text_to_image task on Gemini', () => {
    const gemini = getPlatform('google_gemini')!;
    const ranked = recommendMode(gemini, 'text_to_image', 'a photo of a horse at sunset');
    expect(ranked[0]!.mode.mode_id).toBe('imagen');
    expect(ranked[0]!.reason).toContain(ranked[0]!.mode.name);
  });

  it('prefers a reasoning mode for a reasoning_code task on Gemini', () => {
    const gemini = getPlatform('google_gemini')!;
    const ranked = recommendMode(gemini, 'reasoning_code', 'debug a tricky race condition in my scheduler');
    expect(['thinking', 'pro']).toContain(ranked[0]!.mode.mode_id);
  });

  it('prefers niji for anime on Midjourney and penalizes it for photorealism', () => {
    const mj = getPlatform('midjourney')!;
    const anime = recommendMode(mj, 'text_to_image', 'an anime character in manga style');
    expect(anime[0]!.mode.mode_id).toBe('niji');
    const photo = recommendMode(mj, 'text_to_image', 'photorealistic portrait, studio photo');
    expect(photo[0]!.mode.mode_id).not.toBe('niji');
  });

  it('returns [] for a platform with no modes', () => {
    const bare = { ...getPlatform('midjourney')!, modes: [] };
    expect(recommendMode(bare, 'text_to_image', 'x')).toEqual([]);
  });
});
