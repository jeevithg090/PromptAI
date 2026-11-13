/**
 * Plan definitions and entitlement checks (§28.2, T7.7).
 * Reads plan config from config/plans.json; user's plan from app_users.plan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';
import { getPool } from '../utils/db';
import { logger } from '../utils/logger';

const planSchema = z.object({
  monthly_token_budget: z.number().int(),
  platforms: z.enum(['core', 'all']),
  byok: z.boolean(),
  projects: z.number().int().min(-1),
  visual_preview: z.boolean(),
  memory_entries: z.number().int().min(-1),
  library_submits_per_day: z.number().int(),
  stripe_price_id: z.string().optional(),
});

const plansFileSchema = z.object({
  schema_version: z.string(),
  plans: z.record(z.string(), planSchema),
});

export type Plan = z.infer<typeof planSchema>;

let cachedPlans: z.infer<typeof plansFileSchema> | null = null;

function loadPlans(): z.infer<typeof plansFileSchema> {
  if (cachedPlans) return cachedPlans;
  const filePath = config.PLANS_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'plans.json');
  cachedPlans = plansFileSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  return cachedPlans;
}

export function getPlanConfig(planId: string): Plan {
  const plans = loadPlans();
  return (planId in plans.plans ? plans.plans[planId] : plans.plans.free) as Plan;
}

// Core platforms: the free-tier set — the consumer chat + image platforms the
// browser extension targets (finalplan §B4, the ten supported sites). IDs MUST
// match config/platform-registry.json exactly. The "all" tier (pro) additionally
// unlocks the answer engines + coding assistants (perplexity,
// anthropic_claude_code, cursor, github_copilot) and pro features (A/B compare,
// BYOK, projects, visual preview). NOTE (finalplan): mistral/huggingface/grok/
// deepseek were added to the free set so every extension-target site drafts;
// revert them here to make those platforms paid-only.
const CORE_PLATFORMS = new Set([
  'google_gemini',
  'openai_chatgpt',
  'anthropic_claude',
  'midjourney',
  'stability_stable_diffusion',
  'mistral_le_chat',
  'huggingface_chat',
  'xai_grok',
  'deepseek_chat',
]);

export function platformAllowed(platformId: string, plan: Plan): boolean {
  return plan.platforms === 'all' || CORE_PLATFORMS.has(platformId);
}

export interface Entitlements {
  planId: string;
  plan: Plan;
  monthlyTokenBudget: number;
  byok: boolean;
  projectsAllowed: boolean;
  visualPreview: boolean;
  platformAllowed: (platformId: string) => boolean;
}

/** Build the entitlement view for a plan id + optional admin budget override. */
function entitlementsFor(planId: string, adminBudgetOverride: unknown): Entitlements {
  const plan = getPlanConfig(planId);
  return {
    planId,
    plan,
    monthlyTokenBudget: (typeof adminBudgetOverride === 'number' ? adminBudgetOverride : null) ?? plan.monthly_token_budget,
    byok: plan.byok,
    projectsAllowed: plan.projects === -1 ? true : plan.projects > 0,
    visualPreview: plan.visual_preview,
    platformAllowed: (platformId: string) => platformAllowed(platformId, plan),
  };
}

/**
 * Resolve a user's entitlements. **Fails open to the free plan** on any DB
 * error or missing user row (F0.1): plans are a cost/feature control, not a
 * security boundary — a plans-table outage must not 500 the draft path.
 * Mirrors BudgetService.checkMonthlyBudget's fail-open posture.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  try {
    const pool = getPool();
    const res = await pool.query('select plan, monthly_token_budget from app_users where id = $1', [userId]);
    const row = res.rows[0];
    const planId = row?.plan ?? 'free';
    const adminBudgetOverride = row?.monthly_token_budget; // non-null = admin override (T7.7 precedence doc)
    return entitlementsFor(planId, adminBudgetOverride);
  } catch (err) {
    logger.warn({ type: 'plan:check_skipped', reason: (err as Error).message }, 'entitlement lookup failed — defaulting to free plan');
    return entitlementsFor('free', null);
  }
}

export function checkGate(entitlements: Entitlements, feature: string): { allowed: boolean; message?: string } {
  switch (feature) {
    case 'byok':
      if (!entitlements.byok) return { allowed: false, message: 'BYOK requires a paid plan. Upgrade at /account.' };
      break;
    case 'projects':
      if (!entitlements.projectsAllowed) return { allowed: false, message: 'Projects require a paid plan. Upgrade at /account.' };
      break;
    case 'visual_preview':
      if (!entitlements.visualPreview) return { allowed: false, message: 'Visual preview requires a paid plan.' };
      break;
  }
  return { allowed: true };
}
