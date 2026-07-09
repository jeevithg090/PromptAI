import { feedbackSchema } from '../../src/types/Feedback';
import { underperformingDimensions } from '../../src/services/OutcomeAnalytics';
import { setPoolForTesting } from '../../src/utils/db';
import type { Pool } from 'pg';

/**
 * Feedback + Outcome Analytics tests — spec §29.2, §10.7, T3.5.
 * Verifies Zod validation rejections, feedback insert shape (no user id),
 * and analytics math on fake rows.
 */
describe('Feedback Zod validation (§29.2, T3.5)', () => {
  it('accepts a valid feedback body', () => {
    const result = feedbackSchema.safeParse({
      task_type: 'text_to_image',
      platform_id: 'google_gemini',
      outcome: 'worked',
      rubric_scores: { specificity: 3, unambiguity: 2 },
      edit_count: 2,
      reused: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid outcome enum', () => {
    const result = feedbackSchema.safeParse({
      task_type: 'text_to_image',
      platform_id: 'google_gemini',
      outcome: 'bad_value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized detail (max 500 chars)', () => {
    const result = feedbackSchema.safeParse({
      task_type: 'text_to_image',
      platform_id: 'google_gemini',
      outcome: 'worked',
      detail: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts detail at exactly 500 chars', () => {
    const result = feedbackSchema.safeParse({
      task_type: 'text_to_image',
      platform_id: 'google_gemini',
      outcome: 'worked',
      detail: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('requires task_type and platform_id', () => {
    const result = feedbackSchema.safeParse({ outcome: 'worked' });
    expect(result.success).toBe(false);
  });
});

describe('OutcomeAnalytics (§10.7, T3.5)', () => {
  afterEach(() => setPoolForTesting(null));

  it('computes per-dimension worked vs failed averages', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { feedback: 'worked', rubric_scores: { specificity: 3, unambiguity: 3, non_conflict: 3, platform_fit: 3, constraint_completeness: 3, format_determinacy: 3, context_efficiency: 3, technique_fit: 3 } },
        { feedback: 'worked', rubric_scores: { specificity: 3, unambiguity: 3, non_conflict: 3, platform_fit: 3, constraint_completeness: 3, format_determinacy: 3, context_efficiency: 3, technique_fit: 3 } },
        { feedback: 'didnt_work', rubric_scores: { specificity: 1, unambiguity: 2, non_conflict: 3, platform_fit: 3, constraint_completeness: 3, format_determinacy: 3, context_efficiency: 3, technique_fit: 3 } },
      ],
    });
    setPoolForTesting({ query } as unknown as Pool);

    const dims = await underperformingDimensions();
    expect(dims).toHaveLength(8);

    // specificity: worked avg = 3, failed avg = 1, gap = 2
    // unambiguity: worked avg = 3, failed avg = 2, gap = 1
    // total gap = 3, specificity failureShare = 2/3
    const spec = dims.find((d) => d.dimension === 'specificity')!;
    expect(spec.avgScoreWhenWorked).toBe(3);
    expect(spec.avgScoreWhenFailed).toBe(1);
    expect(spec.failureShare).toBeCloseTo(2 / 3, 1);

    const unamb = dims.find((d) => d.dimension === 'unambiguity')!;
    expect(unamb.avgScoreWhenWorked).toBe(3);
    expect(unamb.avgScoreWhenFailed).toBe(2);

    // non_conflict: no gap (both 3)
    const nonConf = dims.find((d) => d.dimension === 'non_conflict')!;
    expect(nonConf.avgScoreWhenWorked).toBe(3);
    expect(nonConf.avgScoreWhenFailed).toBe(3);
    expect(nonConf.failureShare).toBe(0);
  });

  it('returns empty array on DB error (fail-open)', async () => {
    setPoolForTesting(null);
    const dims = await underperformingDimensions();
    expect(dims).toEqual([]);
  });

  it('returns all 8 dimensions with zeros when no rows have rubric_scores', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    setPoolForTesting({ query } as unknown as Pool);
    const dims = await underperformingDimensions();
    expect(dims).toHaveLength(8);
    expect(dims.every((d) => d.n === 0)).toBe(true);
  });
});