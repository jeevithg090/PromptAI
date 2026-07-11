import { analyzeImprovements, autotuneStrategyProfile } from '../../src/services/ContinuousImprovement';
import { setPoolForTesting } from '../../src/utils/db';
import { logger } from '../../src/utils/logger';
import type { Pool } from 'pg';

jest.mock('fs');
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}));

describe('ContinuousImprovement (T7.9)', () => {
  afterEach(() => {
    setPoolForTesting(null);
    jest.resetAllMocks();
  });

  it('returns [] with no data', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    setPoolForTesting({ query } as unknown as Pool);
    const result = await analyzeImprovements();
    expect(result).toEqual([]);
  });

  it('returns suggestions when didnt_work share > 30% and n >= 10', async () => {
    const rows: Array<{
      task_type: string;
      platform_id: string;
      feedback: string;
      rubric_scores: Record<string, number>;
    }> = [];

    for (let i = 0; i < 8; i++) {
      rows.push({
        task_type: 'text_to_image',
        platform_id: 'google_gemini',
        feedback: 'didnt_work',
        rubric_scores: {
          specificity: 1,
          unambiguity: 1,
          non_conflict: 2,
          platform_fit: 2,
          constraint_completeness: 2,
          format_determinacy: 2,
          context_efficiency: 2,
          technique_fit: 2,
        },
      });
    }

    for (let i = 0; i < 2; i++) {
      rows.push({
        task_type: 'text_to_image',
        platform_id: 'google_gemini',
        feedback: 'worked',
        rubric_scores: {
          specificity: 3,
          unambiguity: 3,
          non_conflict: 3,
          platform_fit: 3,
          constraint_completeness: 3,
          format_determinacy: 3,
          context_efficiency: 3,
          technique_fit: 3,
        },
      });
    }

    const query = jest.fn().mockResolvedValue({ rows });
    setPoolForTesting({ query } as unknown as Pool);

    const result = await analyzeImprovements();

    const flag = result.find((s) => s.type === 'flag_moderation');
    expect(flag).toBeDefined();
    expect(flag!.taskType).toBe('text_to_image');
    expect(flag!.platformId).toBe('google_gemini');

    const tune = result.filter((s) => s.type === 'tune_strategy_profile');
    expect(tune.length).toBeGreaterThanOrEqual(2);

    const spec = tune.find((s) => s.dimension === 'specificity');
    expect(spec).toBeDefined();
    expect(spec!.currentAvgScore).toBe(1);
    expect(spec!.targetAvgScore).toBe(2);

    const unamb = tune.find((s) => s.dimension === 'unambiguity');
    expect(unamb).toBeDefined();
    expect(unamb!.currentAvgScore).toBe(1);

    expect(tune.every((s) => s.taskType === 'text_to_image')).toBe(true);
    expect(tune.every((s) => s.platformId === 'google_gemini')).toBe(true);
  });

  it('autotuneStrategyProfile logs and returns the modified profile', () => {
    const mockProfiles = JSON.stringify({
      profiles: {
        text_to_image: {
          version: 2,
          guidance: 'original guidance text',
          mpkb_refs: ['composition'],
        },
      },
    });
    const fs = require('fs');
    fs.readFileSync.mockReturnValue(mockProfiles);

    const result = autotuneStrategyProfile('text_to_image', 'specificity');

    expect(result.guidance).toContain('original guidance text');
    expect(result.guidance).toContain("Increase emphasis on 'specificity'");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'improvement:profile_tuned',
        taskType: 'text_to_image',
        dimension: 'specificity',
      })
    );

    expect(Array.isArray(result.autotune_log)).toBe(true);
    expect(result.autotune_log[0].dimension).toBe('specificity');
  });
});
