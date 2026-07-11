import { getPlanConfig, platformAllowed, checkGate, type Entitlements } from '../../src/services/PlanService';

describe('PlanService (§28.2, T7.7)', () => {
  describe('getPlanConfig', () => {
    it('returns the free plan config with budget 50000, platforms core, byok false, projects 1', () => {
      const plan = getPlanConfig('free');
      expect(plan.monthly_token_budget).toBe(50000);
      expect(plan.platforms).toBe('core');
      expect(plan.byok).toBe(false);
      expect(plan.projects).toBe(1);
    });

    it('returns the pro plan config with correct values', () => {
      const plan = getPlanConfig('pro');
      expect(plan.monthly_token_budget).toBe(2000000);
      expect(plan.platforms).toBe('all');
      expect(plan.byok).toBe(true);
      expect(plan.projects).toBe(-1);
      expect(plan.visual_preview).toBe(true);
      expect(plan.memory_entries).toBe(-1);
    });

    it('falls back to free plan for nonexistent plan id', () => {
      const plan = getPlanConfig('nonexistent');
      expect(plan.monthly_token_budget).toBe(50000);
      expect(plan.platforms).toBe('core');
    });
  });

  describe('platformAllowed', () => {
    const freePlan = getPlanConfig('free');
    const proPlan = getPlanConfig('pro');

    it('allows midjourney on the free plan (core platform)', () => {
      expect(platformAllowed('midjourney', freePlan)).toBe(true);
    });

    it('blocks a non-core platform on the free plan', () => {
      expect(platformAllowed('some_new_platform', freePlan)).toBe(false);
    });

    it('allows any platform on the pro plan', () => {
      expect(platformAllowed('some_new_platform', proPlan)).toBe(true);
    });
  });

  describe('checkGate', () => {
    const entitlementsWithoutByok: Entitlements = {
      planId: 'free',
      plan: getPlanConfig('free'),
      monthlyTokenBudget: 50000,
      byok: false,
      projectsAllowed: false,
      visualPreview: false,
      platformAllowed: () => false,
    };

    const entitlementsWithByok: Entitlements = {
      planId: 'pro',
      plan: getPlanConfig('pro'),
      monthlyTokenBudget: 2000000,
      byok: true,
      projectsAllowed: true,
      visualPreview: true,
      platformAllowed: () => true,
    };

    it('blocks byok when entitlements lack it', () => {
      const result = checkGate(entitlementsWithoutByok, 'byok');
      expect(result.allowed).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('allows byok when entitlements have it', () => {
      const result = checkGate(entitlementsWithByok, 'byok');
      expect(result.allowed).toBe(true);
    });
  });
});
