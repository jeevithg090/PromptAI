import { computeStrength, RUBRIC_DIMENSIONS, type RubricScores } from '../../src/types/Prompt';

/** Verifies the strength formula matches docs/quality-rubric.md exactly. */
function scoresOf(v: 1 | 2 | 3): RubricScores {
  return Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d, v])) as RubricScores;
}

describe('Prompt strength score (§10.1)', () => {
  it('all 1s → 0', () => expect(computeStrength(scoresOf(1))).toBe(0));
  it('all 2s → 50', () => expect(computeStrength(scoresOf(2))).toBe(50));
  it('all 3s → 100', () => expect(computeStrength(scoresOf(3))).toBe(100));

  it('weights specificity most heavily', () => {
    const base = scoresOf(1);
    const bumpSpecificity: RubricScores = { ...base, specificity: 3 };
    const bumpEfficiency: RubricScores = { ...base, context_efficiency: 3 };
    expect(computeStrength(bumpSpecificity)).toBeGreaterThan(computeStrength(bumpEfficiency));
  });
});
