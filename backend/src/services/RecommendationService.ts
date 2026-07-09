import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';
import {
  capabilityMatrixSchema,
  type CapabilityMatrix,
  type ModelCapability,
  type Recommendation,
  type RecommendationRequest,
} from '../types/Recommendation';

/**
 * Model & Platform Recommendation Engine — spec §15.
 * Ranks candidate models for a task against the user's priorities and shows
 * the trade-off, never a single bare winner (§15.2). Deterministic scoring
 * over the perishable Model Capability Matrix (§15.1); all data is config,
 * so refreshing capabilities is a data edit, not a code change.
 */
let cached: CapabilityMatrix | null = null;

function matrixPath(): string {
  // backend/src/services → repo root is three levels up (same depth from dist/).
  return config.MODEL_CAPABILITIES_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'model-capabilities.json');
}

export function loadCapabilityMatrix(): CapabilityMatrix {
  if (cached) return cached;
  cached = capabilityMatrixSchema.parse(JSON.parse(fs.readFileSync(matrixPath(), 'utf-8')));
  return cached;
}

/** Tier is 1 (best) … 5 (worst); normalize to 0 (worst) … 1 (best). */
function tierToScore(tier: number): number {
  return (5 - tier) / 4;
}

function strengthMatchScore(model: ModelCapability, desired?: string[]): number {
  if (!desired || desired.length === 0) return 0.5; // neutral when unspecified
  const have = new Set(model.strengths.map((s) => s.toLowerCase()));
  const hits = desired.filter((d) => have.has(d.toLowerCase())).length;
  return hits / desired.length;
}

/** A crude quality proxy from cost+context+strengths — real quality scores would come from outcome signals (§10.7). */
function qualityProxy(model: ModelCapability, desired?: string[]): number {
  // Pricier + bigger-context models tend to be higher quality; blend with strength match.
  const priceProxy = (model.cost_tier - 1) / 4; // 0 (cheap) … 1 (premium)
  return 0.5 * priceProxy + 0.5 * strengthMatchScore(model, desired);
}

function tradeoffLine(model: ModelCapability): string {
  const cost = ['very cheap', 'cheap', 'moderate', 'pricey', 'premium'][model.cost_tier - 1];
  const speed = ['very fast', 'fast', 'moderate', 'slow', 'very slow'][model.latency_tier - 1];
  const strengths = model.strengths.slice(0, 3).join(', ');
  return `${model.display_name}: ${speed}, ${cost}; strong at ${strengths}.`;
}

export function recommend(req: RecommendationRequest): Recommendation[] {
  const matrix = loadCapabilityMatrix();

  // Normalize priority weights (default balanced).
  const q = req.prioritizeQuality ?? 0.34;
  const c = req.prioritizeCost ?? 0.33;
  const l = req.prioritizeLatency ?? 0.33;
  const sum = q + c + l || 1;
  const wQuality = q / sum;
  const wCost = c / sum;
  const wLatency = l / sum;

  const candidates = matrix.models.filter((m) => {
    if (!m.modalities.includes(req.modality)) return false;
    // Image/video models have context_window 0 — skip the context filter for them.
    if (req.minContextWindow && m.context_window > 0 && m.context_window < req.minContextWindow) return false;
    return true;
  });

  const scored: Recommendation[] = candidates.map((model) => {
    const quality = qualityProxy(model, req.desiredStrengths);
    const cheapness = tierToScore(model.cost_tier);
    const speed = tierToScore(model.latency_tier);
    const score = Math.round((wQuality * quality + wCost * cheapness + wLatency * speed) * 100);
    return { model, score, tradeoff: tradeoffLine(model) };
  });

  return scored.sort((a, b) => b.score - a.score);
}
