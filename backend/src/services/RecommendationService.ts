import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';
import {
  capabilityMatrixSchema,
  type CapabilityMatrix,
  type ModelCapability,
  type ReasoningEffort,
  type ReasoningEffortSuggestion,
  type Recommendation,
  type RecommendationRequest,
  type TaskRecommendation,
  type TaskRecommendationRequest,
} from '../types/Recommendation';
import type { Platform, PlatformMode } from '../types/Platform';

let cached: CapabilityMatrix | null = null;
let platformRegistry: { platforms: Platform[] } = { platforms: [] };
let pkbChunks: any[] = [];

export function loadCapabilityMatrix(): CapabilityMatrix {
  if (cached) return cached;
  cached = capabilityMatrixSchema.parse(JSON.parse(fs.readFileSync(matrixPath(), 'utf-8')));
  return cached;
}

export function loadPlatformRegistry(): { platforms: Platform[] } {
  if (platformRegistry.platforms.length > 0) return platformRegistry;
  const registryPath = path.resolve(__dirname, '..', '..', '..', 'config', 'platform-registry.json');
  platformRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  return platformRegistry;
}

export function loadPKBChunks(): any[] {
  if (pkbChunks.length > 0) return pkbChunks;
  const pkbPath = path.resolve(__dirname, '..', '..', '..', 'config', 'pkb-seed.json');
  const content = fs.readFileSync(pkbPath, 'utf-8');
  pkbChunks = JSON.parse(content).chunks || [];
  return pkbChunks;
}

export function matrixPath(): string {
  return config.MODEL_CAPABILITIES_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'model-capabilities.json');
}

function tierToScore(tier: number): number {
  return (5 - tier) / 4;
}

function strengthMatchScore(model: ModelCapability, desired?: string[]): number {
  if (!desired || desired.length === 0) return 0.5;
  const have = new Set(model.strengths.map((s) => s.toLowerCase()));
  const hits = desired.filter((d) => have.has(d.toLowerCase())).length;
  return hits / desired.length;
}

function qualityProxy(model: ModelCapability, desired?: string[]): number {
  const priceProxy = (model.cost_tier - 1) / 4;
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

  const q = req.prioritizeQuality ?? 0.34;
  const c = req.prioritizeCost ?? 0.33;
  const l = req.prioritizeLatency ?? 0.33;
  const sum = q + c + l || 1;
  const wQuality = q / sum;
  const wCost = c / sum;
  const wLatency = l / sum;

  const candidates = matrix.models.filter((m) => {
    if (!m.modalities.includes(req.modality)) return false;
    if (req.minContextWindow && m.context_window > 0 && m.context_window < req.minContextWindow) return false;
    return true;
  });

  const scored: Recommendation[] = candidates.map((model) => {
    const quality = qualityProxy(model, req.desiredStrengths);
    const cheapness = tierToScore(model.cost_tier);
    const speed = tierToScore(model.latency_tier);
    const score = Math.round((wQuality * quality + wCost * cheapness + wLatency * speed) * 100);
    return { model, score, tradeoff: tradeoffLine(model), match_reason: '' };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export interface ModeRecommendation {
  mode: PlatformMode;
  score: number;
  reason: string;
}

const TASK_TYPE_SIGNALS: Record<string, string[]> = {
  text_to_image: ['image', 'photo', 'illustration', 'art', 'picture', 'photorealistic', 'anime', 'logo'],
  text_to_video: ['video', 'animation', 'motion'],
  chat_persona: ['chat', 'persona', 'conversation', 'general'],
  reasoning_code: ['code', 'reasoning', 'math', 'debugging', 'planning', 'multi-step logic', 'complex reasoning'],
  extraction_classification: ['extraction', 'classification', 'high volume', 'fast answers', 'short form'],
  long_form_writing: ['long form writing', 'writing', 'analysis', 'research', 'reports', 'long documents'],
};

export function recommendMode(platform: Platform, taskType: string, idea: string): ModeRecommendation[] {
  const signals = new Set(TASK_TYPE_SIGNALS[taskType] ?? []);
  const ideaLower = idea.toLowerCase();

  const scored = platform.modes.map((mode) => {
    let score = 0;
    const hits: string[] = [];
    const misses: string[] = [];
    for (const tag of mode.best_for) {
      const t = tag.toLowerCase();
      if (ideaLower.includes(t)) {
        score += 3;
        hits.push(tag);
      } else if (signals.has(t)) {
        score += 1;
        hits.push(tag);
      }
    }
    for (const tag of mode.avoid_for) {
      if (ideaLower.includes(tag.toLowerCase())) {
        score -= 4;
        misses.push(tag);
      }
    }
    const reason =
      misses.length > 0
        ? `${mode.name} is a poor fit here — its docs advise against it for ${misses.join(', ')}.`
        : hits.length > 0
          ? `${mode.name} — matches this task on ${hits.slice(0, 3).join(', ')}. ${mode.notes}`
          : `${mode.name} — no strong signal either way. ${mode.notes}`;
    return { mode, score, reason };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// ---- Smart Task-Aware Model Selector ----

const TASK_KEYWORDS: Record<string, { profile: string; keywords: string[]; modality?: string }> = {
  classification: { profile: 'classification', keywords: ['classify', 'categorize', 'label', 'tag', 'routing', 'intent', 'sort', 'organize'] },
  extraction: { profile: 'extraction', keywords: ['extract', 'parse', 'entity', 'scrape', 'pull', 'gather', 'collect data'] },
  chat: { profile: 'simple_chat', keywords: ['chat', 'conversation', 'customer support', 'talk', 'assistant', 'faq'] },
  reasoning: { profile: 'reasoning', keywords: ['reason', 'think', 'logic', 'puzzle', 'analyze', 'complex', 'difficult', 'hard problem', 'multi-step'] },
  coding: { profile: 'coding', keywords: ['code', 'program', 'function', 'debug', 'implement', 'write code', 'script', 'algorithm', 'build', 'develop', 'game', 'create', 'web app', 'application'] },
  agentic_coding: { profile: 'agentic_coding', keywords: ['agent', 'autonomous', 'multi-file', 'refactor', 'software engineering', 'codebase', 'architecture'] },
  writing: { profile: 'writing', keywords: ['write', 'article', 'blog', 'essay', 'story', 'content', 'copy', 'creative', 'marketing'] },
  long_context: { profile: 'long_context', keywords: ['long document', 'summarize', 'book', 'research paper', 'legal', 'contract', 'analysis'] },
  multimodal: { profile: 'multimodal', keywords: ['image', 'photo', 'picture', 'visual', 'chart', 'diagram', 'screenshot', 'video', 'audio'] },
  image_gen: { profile: 'image_generation', keywords: ['generate image', 'create image', 'draw', 'illustrate', 'design', 'art', 'image generation', 'image creation', 'generate picture'], modality: 'image' },
  video_gen: { profile: 'video_generation', keywords: ['generate video', 'create video', 'edit video', 'animate', 'video generation', 'make a video', 'film', 'clip', 'motion graphics'], modality: 'video' },
  research: { profile: 'research', keywords: ['research', 'investigate', 'study', 'browse', 'search', 'deep dive', 'report'] },
  cheap_production: { profile: 'cost_sensitive_production', keywords: ['cheap', 'budget', 'cost-effective', 'high volume', 'production', 'scale', 'inexpensive'] },
};

function detectTaskType(task: string): { profile: string; confidence: number } {
  const lower = task.toLowerCase();
  const words = new Set(lower.split(/\s+/));
  let best = { profile: 'simple_chat', confidence: 0 };

  for (const [_, mapping] of Object.entries(TASK_KEYWORDS)) {
    let score = 0;
    for (const kw of mapping.keywords) {
      const kwWords = kw.split(/\s+/);
      if (kwWords.length > 1) {
        if (kwWords.every((w) => words.has(w))) {
          score += kw.length > 6 ? 4 : 2;
        }
      } else if (words.has(kw) || (kw.length >= 4 && lower.includes(kw))) {
        score += kw.length > 6 ? 3 : 1;
      }
    }
    if (score > best.confidence) {
      best = { profile: mapping.profile, confidence: score };
    }
  }

  return best;
}

/** Map a model_id to its platform mode for platform-specific guidance. */
function getPlatformModeForModel(model: ModelCapability): PlatformMode & { platform_id?: string } | null {
  const registry = loadPlatformRegistry();
  for (const platform of registry.platforms) {
    if (platform.model_family !== model.provider && platform.model_family !== model.platform_id) continue;
    for (const mode of platform.modes || []) {
      const aliases = mode.aliases || [];
      if (mode.mode_id === model.model_id || aliases.includes(model.model_id) || aliases.some(a => model.model_id.includes(a))) {
        return { ...mode, platform_id: platform.platform_id };
      }
    }
    // Fallback: match by display_name containing mode name
    for (const mode of platform.modes || []) {
      if (model.display_name.toLowerCase().includes(mode.name.toLowerCase())) {
        return { ...mode, platform_id: platform.platform_id };
      }
    }
  }
  return null;
}

/** Get PKB chunks relevant to a platform/model for prompt engineering guidance. */
function getPKBGuidance(model: ModelCapability, mode: PlatformMode & { platform_id?: string } | null): string[] {
  const chunks = loadPKBChunks();
  const platformId = mode?.platform_id || model.platform_id || model.provider;
  const family = model.provider;
  const results: string[] = [];

  for (const chunk of chunks) {
    if (chunk.kind === 'pkb' && chunk.platform_id === platformId) {
      results.push(`[${chunk.category}] ${chunk.content}`);
    } else if (chunk.kind === 'mpkb' && chunk.model_family === family) {
      results.push(`[General ${chunk.category}] ${chunk.content}`);
    }
  }

  return results.slice(0, 5);
}

function profileQualitySensitivity(profile: string): { quality: number; cost: number; latency: number } {
  const matrix = loadCapabilityMatrix();
  const taskProfile = matrix.task_profiles?.[profile];
  if (!taskProfile) return { quality: 0.34, cost: 0.33, latency: 0.33 };

  const sensToWeight = (s: string): number => {
    switch (s) {
      case 'very_high': return 0.7;
      case 'high': return 0.5;
      case 'medium': return 0.3;
      case 'low': return 0.1;
      default: return 0.33;
    }
  };

  return {
    quality: sensToWeight(taskProfile.quality_sensitivity ?? 'medium'),
    cost: sensToWeight(taskProfile.cost_sensitivity ?? 'medium'),
    latency: sensToWeight(taskProfile.latency_sensitivity ?? 'medium'),
  };
}

function taskAwareStrengthScore(model: ModelCapability, task: string): { score: number; matched: string[]; strongMatch: boolean } {
  const lower = task.toLowerCase();
  const modelStrengths = new Set(model.strengths.map((s) => s.toLowerCase()));
  const matched: string[] = [];
  let score = 0;

  const taskWords = lower.split(/\s+/).filter((w) => w.length > 3);
  for (const word of taskWords) {
    if (modelStrengths.has(word)) {
      score += 2;
      matched.push(word);
    }
    for (const strength of modelStrengths) {
      if (strength.includes(word) && word.length > 4) {
        score += 1;
        matched.push(strength);
        break;
      }
    }
  }

  const modelFamily: Record<string, number> = {
    'gpt-5.6-sol': 5, 'claude-opus-4-8': 5, 'gemini-3.1-pro': 4, 'o3': 5,
    'gpt-5.6-terra': 4, 'claude-sonnet-5': 4,
    'gpt-5.6-luna': 2, 'claude-haiku-4-5': 3, 'o4-mini': 3,
    'gemini-3.5-flash': 3, 'gemini-2.5-flash': 2, 'gemini-3.1-flash-lite': 1,
    'llama-4-scout': 2, 'llama-4-maverick': 3, 'llama-3.3-70b-versatile': 3,
    'mistral-large-3': 3, 'codestral': 3,
  };

  const tier = modelFamily[model.model_id] || 2;
  const strongMatch = score >= 3 || tier >= 4;

  return { score, matched: [...new Set(matched)], strongMatch };
}

export function recommendForTask(req: TaskRecommendationRequest): TaskRecommendation {
  const matrix = loadCapabilityMatrix();

  // Explicit task_type takes priority over auto-detection
  let profile: string;
  let confidence: number;
  if (req.task_type) {
    profile = req.task_type;
    confidence = 100;
  } else {
    const detected = detectTaskType(req.task);
    profile = detected.profile;
    confidence = detected.confidence;
  }
  const taskProfile = matrix.task_profiles?.[profile];

  const sensitivities = profileQualitySensitivity(profile);
  const wQuality = req.prioritizeQuality ?? sensitivities.quality;
  const wCost = req.prioritizeCost ?? sensitivities.cost;
  const wLatency = req.prioritizeLatency ?? sensitivities.latency;
  const weightSum = wQuality + wCost + wLatency || 1;

  const modality = req.modality ?? 'text';

  const candidates = matrix.models.filter((m) => {
    if (!m.modalities.includes(modality)) return false;
    return true;
  });

  const scored: Recommendation[] = candidates.map((model) => {
    const strengthResult = taskAwareStrengthScore(model, req.task);
    const idealStrengths = taskProfile?.ideal_strengths ?? [];
    const strengthProfileMatch = strengthMatchScore(model, idealStrengths);

    const modelFamily: Record<string, number> = {
      'gpt-5.6-sol': 1, 'claude-opus-4-8': 1, 'gemini-3.1-pro': 1.5, 'o3': 1,
      'gpt-5.6-terra': 2, 'claude-sonnet-5': 2, 'mistral-large-3': 2,
      'gpt-5.6-luna': 3, 'claude-haiku-4-5': 2.5, 'o4-mini': 2.5,
      'gemini-3.5-flash': 3, 'gemini-2.5-pro': 2, 'gemini-2.5-flash': 4,
      'gemini-3.1-flash-lite': 5, 'llama-4-scout': 4, 'llama-4-maverick': 3,
      'llama-3.3-70b-versatile': 3, 'llama-3.1-8b-instant': 5,
      'qwen3-32b': 4, 'codestral': 2.5, 'pixtral-large': 2.5,
      'gpt-oss-120b': 3, 'gpt-5-mini': 4,
    };

    const qualityScore = (5 - (modelFamily[model.model_id] || 3)) / 4;
    const cheapness = tierToScore(model.cost_tier);
    const speed = tierToScore(model.latency_tier);

    const qualityWeight = wQuality / weightSum;
    const costWeight = wCost / weightSum;
    const latencyWeight = wLatency / weightSum;

    const score = Math.round(
      (qualityWeight * qualityScore +
       costWeight * cheapness +
       latencyWeight * speed +
       0.2 * strengthProfileMatch +
       0.8 * Math.min(strengthResult.score / 10, 1)) *
      100
    );

    const matchParts: string[] = [];
    if (strengthResult.matched.length > 0) {
      matchParts.push(`matches task keywords: ${strengthResult.matched.slice(0, 4).join(', ')}`);
    }
    if (strengthProfileMatch > 0.5) {
      matchParts.push('aligned with task profile');
    }
    const matchReason = matchParts.length > 0 ? matchParts.join('; ') : 'general-purpose model';

    return { model, score, tradeoff: tradeoffLine(model), match_reason: matchReason };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);

  const hasStrongCustomModels = sorted.some((r) => r.score > 80 && r.model.strengths.includes('agentic'));
  const top3 = sorted.slice(0, hasStrongCustomModels ? 4 : 3);

  const best = top3[0]!;

  const explanation = buildExplanation(profile, taskProfile, best, top3, req.task);

  const reasoningEffort = suggestReasoningEffort(best.model, profile, req.task);

  // Enrich with platform mode and PKB guidance
  const platformMode = getPlatformModeForModel(best.model);
  const pkbGuidance = getPKBGuidance(best.model, platformMode);

  return {
    task_type: profile,
    task_description: req.task,
    recommendations: top3,
    best_model: best,
    reasoning_effort: reasoningEffort,
    platform_mode: platformMode ? {
      mode_id: platformMode.mode_id,
      name: platformMode.name,
      aliases: platformMode.aliases || [],
      best_for: platformMode.best_for,
      avoid_for: platformMode.avoid_for,
      notes: platformMode.notes,
      docs_url: platformMode.docs_url,
    } : null,
    pkb_guidance: pkbGuidance,
    explanation: buildExplanation(profile, taskProfile, best, top3, req.task) + reasoningEffort.description_suffix,
  };
}

// ---- Reasoning Effort Advisor — dynamically uses per-model reasoning_efforts data from capability matrix ----

const TASK_EFFORT_MAP: Record<string, string> = {
  classification: 'low',
  extraction: 'low',
  simple_chat: 'low',
  cost_sensitive_production: 'low',
  coding: 'high',
  reasoning: 'high',
  long_context: 'medium',
  writing: 'medium',
  multimodal: 'medium',
  research: 'xhigh',
  agentic_coding: 'xhigh',
};

const HIGH_EFFORT_TASKS = new Set(['reasoning', 'coding', 'agentic_coding', 'research']);
const LOW_EFFORT_TASKS = new Set(['classification', 'extraction', 'simple_chat', 'cost_sensitive_production']);

/**
 * Given a model and task, suggests the optimal reasoning effort level
 * based on what the model actually supports (from its reasoning_efforts field).
 * Never suggests levels the model doesn't support — clamped to supported_levels.
 */
export function suggestReasoningEffort(
  model: ModelCapability,
  taskProfile: string,
  taskDescription: string
): ReasoningEffortSuggestion {
  const efforts = model.reasoning_efforts;
  const lower = taskDescription.toLowerCase();

  const baseSuggestion = (() => {
    if (TASK_EFFORT_MAP[taskProfile]) return TASK_EFFORT_MAP[taskProfile]!;
    if (lower.includes('simple') || lower.includes('quick') || lower.includes('fast') || lower.includes('cheap')) return 'low';
    if (lower.includes('complex') || lower.includes('hard') || lower.includes('deep') || lower.includes('difficult')) return 'high';
    if (lower.includes('research') || lower.includes('agentic') || lower.includes('autonomous')) return 'xhigh';
    if (lower.includes('creative') || lower.includes('write') || lower.includes('analyze')) return 'medium';
    return 'medium';
  })();

  if (!efforts) {
    return {
      model_id: model.model_id,
      display_name: model.display_name,
      suggested_effort: null,
      supported_levels: null,
      default_effort: null,
      parameter: null,
pro_mode_suggested: false,
      notes: 'This model does not expose configurable reasoning effort levels.',
      description_suffix: '',
  };
}

  const levels = efforts.supported_levels;
  const supportsNamedLevels = levels && levels.length > 0 && levels[0] !== 'budget';
  const supportsBudget = levels && levels.includes('budget');

  let clamped: string | null;
  let proMode = false;

  if (supportsNamedLevels) {
    const levelSet = new Set(levels!.map((l: string) => l.toLowerCase()));
    clamped = levelSet.has(baseSuggestion) ? baseSuggestion : efforts.default ?? baseSuggestion;

    if (efforts.pro_mode && HIGH_EFFORT_TASKS.has(taskProfile)) {
      proMode = true;
    }
  } else if (supportsBudget) {
    clamped = 'budget';
  } else {
    clamped = null;
  }

  const descriptionParts: string[] = [];
  if (clamped) {
    descriptionParts.push(`Recommended reasoning effort: "${clamped}"`);
    if (efforts.parameter) {
      descriptionParts.push(`(parameter: ${efforts.parameter})`);
    }
    if (proMode) {
      descriptionParts.push(`+ pro mode (${efforts.pro_mode_parameter || 'reasoning.mode'}: "pro")`);
    }
  }
  if (efforts.notes) {
    descriptionParts.push(`— ${efforts.notes}`);
  }

  const descriptionSuffix = clamped ? ` Suggested config: ${descriptionParts.join(' ')}` : '';

  return {
    model_id: model.model_id,
    display_name: model.display_name,
    suggested_effort: clamped,
    supported_levels: levels ?? null,
    default_effort: efforts.default ?? null,
    parameter: efforts.parameter ?? null,
    pro_mode_suggested: proMode,
    notes: efforts.notes ?? null,
    description_suffix: descriptionSuffix,
  };
}

function buildExplanation(
  profile: string,
  taskProfile: any,
  best: Recommendation,
  top3: Recommendation[],
  task: string
): string {
  const parts: string[] = [];

  const profileDesc = taskProfile?.description ?? profile.replace(/_/g, ' ');
  parts.push(`Task identified as "${profileDesc}"`);

  parts.push(`Best model: ${best.model.display_name} (score: ${best.score}/100)`);
  parts.push(`Why: ${best.match_reason || 'strongest overall fit for this task type'}`);
  parts.push(`${best.model.display_name}: ${best.tradeoff}`);

  if (top3.length > 1) {
    const second = top3[1]!;
    if (profile === 'classification' || profile === 'extraction' || profile === 'cost_sensitive_production') {
      parts.push(`Budget pick: ${second.model.display_name} (${second.score}/100) — ${second.tradeoff}`);
    } else if (profile === 'reasoning' || profile === 'coding' || profile === 'agentic_coding') {
      parts.push(`Runner-up: ${second.model.display_name} (${second.score}/100) — ${second.tradeoff}`);
    } else {
      parts.push(`Alternative: ${second.model.display_name} (${second.score}/100) — ${second.tradeoff}`);
    }
  }

  parts.push(`Recommendation confidence: ${best.score >= 80 ? 'high' : best.score >= 60 ? 'medium' : 'low'}`);
  parts.push(`Task profile: ${profile} | Quality weight: balanced | Cost sensitivity: ${taskProfile?.cost_sensitivity ?? 'medium'} | Latency sensitivity: ${taskProfile?.latency_sensitivity ?? 'medium'}`);

  return parts.join('. ');
}

export function clearCapabilityCache(): void {
  cached = null;
}
