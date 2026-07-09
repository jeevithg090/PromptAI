import { checkMonthlyBudget, checkSessionCap } from '../../src/services/BudgetService';
import { setPoolForTesting } from '../../src/utils/db';
import type { Pool } from 'pg';
import type { TransitionRecord } from '../../src/services/Supervisor';

/**
 * BudgetService tests — spec §16, §22.4, T3.2.
 * Verifies monthly budget math (fail-open), session cap calculation,
 * and DB-error graceful degradation. Uses a fake pool via setPoolForTesting.
 */
describe('BudgetService (§16, §22.4, T3.2)', () => {
  afterEach(() => setPoolForTesting(null));

  /** Fake pool that routes queries by SQL content. */
  function fakePool(opts: { used?: number; budget?: number; noUser?: boolean }): { query: jest.Mock } {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('usage_events')) return { rows: [{ used: opts.used ?? 0 }] };
      if (sql.includes('app_users')) return { rows: opts.noUser ? [] : [{ monthly_token_budget: opts.budget ?? 10000 }] };
      return { rows: [] };
    });
    setPoolForTesting({ query } as unknown as Pool);
    return { query };
  }

  it('blocks when monthly usage exceeds budget', async () => {
    fakePool({ used: 11000, budget: 10000 });
    const result = await checkMonthlyBudget('user-1');
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(11000);
    expect(result.budget).toBe(10000);
  });

  it('allows when usage is under budget', async () => {
    fakePool({ used: 5000, budget: 10000 });
    const result = await checkMonthlyBudget('user-1');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(5000);
    expect(result.budget).toBe(10000);
  });

  it('allows at exactly the budget boundary (used < budget, not <=)', async () => {
    fakePool({ used: 10000, budget: 10000 });
    const result = await checkMonthlyBudget('user-1');
    expect(result.allowed).toBe(false); // used < budget → 10000 < 10000 is false
  });

  it('fail-opens when the user row is missing', async () => {
    fakePool({ used: 999999, noUser: true });
    const result = await checkMonthlyBudget('dev-user-000');
    expect(result.allowed).toBe(true);
  });

  it('fail-opens on DB error (getPool throws)', async () => {
    setPoolForTesting(null); // no pool — getPool() throws
    const result = await checkMonthlyBudget('user-1');
    expect(result.allowed).toBe(true);
  });

  it('fail-opens on query rejection', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection refused'));
    setPoolForTesting({ query } as unknown as Pool);
    const result = await checkMonthlyBudget('user-1');
    expect(result.allowed).toBe(true);
  });
});

describe('checkSessionCap (§22.4, T3.2)', () => {
  function trace(tokens: number[]): TransitionRecord[] {
    return tokens.map((t) => ({
      from: 'created',
      to: 'intent_classified',
      agent: 'test',
      status: 'success' as const,
      durationMs: 0,
      tokensUsed: t,
    }));
  }

  it('reports exceeded when total tokens > cap (default 10000)', () => {
    const result = checkSessionCap(trace([5000, 6000]));
    expect(result.exceeded).toBe(true);
    expect(result.used).toBe(11000);
    expect(result.cap).toBe(10000);
  });

  it('reports not exceeded when total tokens <= cap', () => {
    const result = checkSessionCap(trace([3000, 4000]));
    expect(result.exceeded).toBe(false);
    expect(result.used).toBe(7000);
  });

  it('handles an empty trace', () => {
    const result = checkSessionCap([]);
    expect(result.exceeded).toBe(false);
    expect(result.used).toBe(0);
  });
});
