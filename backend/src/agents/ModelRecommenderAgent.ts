import fs from 'node:fs';
import path from 'node:path';
import { Agent, AgentInput, AgentOutput } from '../types/Agent';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import type { OpenRouterModel } from './OpenRouterModelFetcher';

const OR_MODELS_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'openrouter-models.json');

interface TaskProfile {
  name: string;
  description: string;
  keywords: string[];
  preferred_strengths: string[];
  price_sensitivity: 'low' | 'medium' | 'high';
  reasoning_level: 'none' | 'low' | 'medium' | 'high';
}

const TASK_PROFILES: TaskProfile[] = [
  {
    name: 'coding',
    description: 'Writing code, debugging, software engineering',
    keywords: ['code', 'program', 'software', 'build', 'develop', 'debug', 'implement', 'application', 'game', 'script', 'function', 'api', 'web'],
    preferred_strengths: ['tool_choice', 'tools', 'structured_outputs'],
    price_sensitivity: 'medium',
    reasoning_level: 'high',
  },
  {
    name: 'reasoning',
    description: 'Complex multi-step reasoning, math, logic, analysis',
    keywords: ['reason', 'analyze', 'logic', 'math', 'complex', 'hard', 'puzzle', 'solve', 'think', 'deep'],
    preferred_strengths: ['reasoning_effort'],
    price_sensitivity: 'low',
    reasoning_level: 'high',
  },
  {
    name: 'chat',
    description: 'General conversation, Q&A, customer support',
    keywords: ['chat', 'talk', 'conversation', 'assist', 'question', 'answer', 'general', 'help'],
    preferred_strengths: [],
    price_sensitivity: 'high',
    reasoning_level: 'low',
  },
  {
    name: 'classification',
    description: 'Text classification, extraction, tagging, routing',
    keywords: ['classify', 'extract', 'tag', 'route', 'sort', 'categorize', 'label', 'parse'],
    preferred_strengths: ['structured_outputs'],
    price_sensitivity: 'high',
    reasoning_level: 'low',
  },
  {
    name: 'writing',
    description: 'Creative writing, content creation, long-form',
    keywords: ['write', 'content', 'article', 'blog', 'story', 'essay', 'creative', 'marketing'],
    preferred_strengths: [],
    price_sensitivity: 'medium',
    reasoning_level: 'medium',
  },
  {
    name: 'multimodal',
    description: 'Working with images, audio, video in addition to text',
    keywords: ['image', 'photo', 'picture', 'video', 'audio', 'multimodal', 'visual', 'describe', 'caption'],
    preferred_strengths: [],
    price_sensitivity: 'medium',
    reasoning_level: 'medium',
  },
];

function detectProfile(task: string): TaskProfile {
  const lower = task.toLowerCase();
  let best = TASK_PROFILES[0]!;
  let bestScore = 0;
  for (const p of TASK_PROFILES) {
    let score = 0;
    for (const kw of p.keywords) {
      if (lower.includes(kw)) score += kw.length > 4 ? 3 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function loadOpenRouterModels(): OpenRouterModel[] {
  try {
    if (fs.existsSync(OR_MODELS_PATH)) {
      return JSON.parse(fs.readFileSync(OR_MODELS_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

export class ModelRecommenderAgent implements Agent {
  name = 'ModelRecommenderAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const params = input.params;
    const task = params.task as string || '';
    const providerFilter = (params.provider_filter as string || '').toLowerCase();
    if (!task) {
      return { status: 'failure', error: 'task is required' };
    }

    const profile = detectProfile(task);
    let allModels = loadOpenRouterModels();

    // Apply provider filter if specified
    if (providerFilter) {
      allModels = allModels.filter((m) => {
        const id = (m.id || '').toLowerCase();
        const name = (m.name || '').toLowerCase();
        return id.startsWith(providerFilter + '/') || name.startsWith(providerFilter + ' ');
      });
    }

    // Filter: keep only models relevant to the task
    const candidates = allModels.filter((m) => {
      const params = m.supported_parameters || [];
      const modalIn = m.architecture?.input_modalities || [];
      const modalOut = m.architecture?.output_modalities || [];
      const lowerDesc = (m.description || '').toLowerCase();
      const lowerName = (m.name || '').toLowerCase();

      // Skip image-only models for text tasks
      if (profile.name !== 'multimodal' && !modalOut.includes('text')) return false;
      if (profile.name === 'multimodal' && !modalIn.includes('image') && !modalIn.includes('audio') && !modalIn.includes('video')) return false;

      // Favor models with reasoning support for reasoning-heavy tasks
      if (profile.reasoning_level === 'high' && !params.includes('reasoning_effort') && !m.reasoning) {
        // Still include but with lower priority
      }

      // Boost models with tool/structured output support for coding
      if (profile.name === 'coding') {
        const hasTools = params.includes('tool_choice') || params.includes('tools');
        const hasStructured = params.includes('structured_outputs') || params.includes('response_format');
        if (!hasTools && !hasStructured && !lowerDesc.includes('code') && !lowerName.includes('code') && !lowerName.includes('coder')) {
          return false;
        }
      }

      return true;
    });

    // Sort by relevance: reasoning support, context length, price
    const scored = candidates.map((m) => {
      let price = parseFloat(m.pricing?.prompt || '0');
      if (price < 0) price = 0.001; // routers report -1; treat as mid-range
      const hasReasoning = !!m.reasoning || m.supported_parameters?.includes('reasoning_effort');
      const hasTools = m.supported_parameters?.includes('tool_choice') || m.supported_parameters?.includes('tools');
      const hasStructured = m.supported_parameters?.includes('structured_outputs');
      const contextScore = Math.min(m.context_length / 1000000, 1);
      const reasonScore = hasReasoning ? 1 : 0;
      const toolScore = hasTools || hasStructured ? 1 : 0;

      let priceScore: number;
      if (profile.price_sensitivity === 'high') priceScore = price === 0 ? 1 : Math.max(0, 1 - price * 50);
      else if (profile.price_sensitivity === 'low') priceScore = price === 0 ? 0.5 : Math.min(1, price * 200);
      else priceScore = price === 0 ? 1 : Math.max(0, 1 - price * 20);

      const score = (
        contextScore * 0.15 +
        reasonScore * 0.35 +
        toolScore * 0.15 +
        priceScore * 0.25 +
        0.1
      );

      return { model: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topCandidates = scored.slice(0, 12);

    // Now use Cerebras for LLM reasoning (OpenAI-compatible chat/completions)
    const reasoningModel = 'gpt-oss-120b';
    const apiKey = config.CEREBRAS_API_KEY;
    const baseUrl = config.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';

    if (!apiKey) {
      // Fallback: return scored top models without LLM
      const top3 = topCandidates.slice(0, 3).map((s) => s.model.id);
      return {
        status: 'success',
        data: {
          task_type: profile.name,
          recommendations: topCandidates.slice(0, 5).map((s) => ({
            model_id: s.model.id,
            name: s.model.name,
            score: Math.round(s.score * 100),
            price_per_1m_input: s.model.pricing?.prompt || '0',
            context_length: s.model.context_length,
            reasoning_support: !!s.model.reasoning || s.model.supported_parameters?.includes('reasoning_effort'),
          })),
          best_model: top3[0] || null,
          explanation: `Top picks for "${task}" based on ${allModels.length} OpenRouter models. Used profile: ${profile.name}.`,
          note: 'CEREBRAS_API_KEY not configured — using rule-based scoring instead of LLM reasoning.',
        },
      };
    }

    // Build prompt for Cerebras
    const candidateLines = topCandidates.map((s, i) =>
      `Model ${i + 1}: ${s.model.id}
  Name: ${s.model.name || s.model.id}
  Description: ${(s.model.description || '').slice(0, 300)}
  Context: ${(s.model.context_length || 0).toLocaleString()} tokens
  Input price per 1M tokens: $${parseFloat(s.model.pricing?.prompt || '0').toFixed(6)}
  Reasoning: ${s.model.reasoning ? `efforts=${s.model.reasoning.supported_efforts?.join(', ') || 'N/A'}, default=${s.model.reasoning.default_effort || 'N/A'}` : 'not supported'}
  Supports: ${(s.model.supported_parameters || []).slice(0, 6).join(', ')}
  Score: ${Math.round(s.score * 100)}/100`
    ).join('\n\n');

    const prompt = `You are a model recommendation expert. Given a user task and candidate models from OpenRouter, recommend the single best model.

USER TASK: "${task}"

TASK PROFILE: ${profile.name} — ${profile.description}

TOP CANDIDATE MODELS (out of ${allModels.length} total on OpenRouter):
${candidateLines}

Consider:
1. Which model best matches the task profile
2. Reasoning effort support if the task needs complex reasoning
3. Tool/structured output support for coding tasks
4. Context window size
5. Price vs value
6. Modality support (text/image/code/audio)

Return ONLY a JSON object with this exact structure:
{
  "best_model": "openai/gpt-5.6-sol",
  "reasoning": "Concise 1-2 sentence explanation of why this model is the best choice",
  "suggested_reasoning_effort": "high" or null if N/A,
  "runner_up": "second best model id",
  "confidence": 95
}

Return valid JSON only, no markdown, no code fences.`;

    try {
      const res = await fetch(
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: reasoningModel,
            messages: [
              { role: 'system', content: 'You only respond with valid, parseable JSON. No preamble, no explanation, no markdown.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 1024,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Gemini API returned ${res.status}: ${await res.text().catch(() => '')}`);
      }

      const data = await res.json() as Record<string, any>;
      const text = data?.choices?.[0]?.message?.content || '';
      const cleanJson = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      let llmResult: Record<string, any>;
      try {
        llmResult = JSON.parse(cleanJson);
      } catch {
        const jsonMatch = cleanJson.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          llmResult = JSON.parse(jsonMatch[1]);
        } else {
          llmResult = { best_model: null, reasoning: '', confidence: 0 };
        }
      }

      return {
        status: 'success',
        data: {
          task_type: profile.name,
          total_models_considered: allModels.length,
          candidates_filtered_to: topCandidates.length,
          llm_reasoning: llmResult.reasoning || '',
          best_model: llmResult.best_model || (topCandidates[0]?.model.id || ''),
          runner_up: llmResult.runner_up || (topCandidates[1]?.model.id || ''),
          suggested_reasoning_effort: llmResult.suggested_reasoning_effort || null,
          confidence: llmResult.confidence || 0,
          explanation: llmResult.reasoning || '',
          top_candidates: topCandidates.slice(0, 5).map((s) => ({
            model_id: s.model.id,
            name: s.model.name,
            score: Math.round(s.score * 100),
            context: s.model.context_length,
            price: s.model.pricing?.prompt || '0',
            reasoning_efforts: s.model.reasoning?.supported_efforts || null,
          })),
          recommended_config: llmResult.suggested_reasoning_effort
            ? { reasoning_effort: llmResult.suggested_reasoning_effort }
            : null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ type: 'model_recommender:llm_failed', error: msg });

      // Fallback: return rule-based results
      return {
        status: 'partial',
        data: {
          task_type: profile.name,
          recommendations: topCandidates.slice(0, 5).map((s) => ({
            model_id: s.model.id,
            name: s.model.name,
            score: Math.round(s.score * 100),
            context: s.model.context_length,
            price: s.model.pricing?.prompt || '0',
            reasoning_support: !!s.model.reasoning || s.model.supported_parameters?.includes('reasoning_effort'),
          })),
          best_model: topCandidates[0]?.model.id || '',
          explanation: `LLM reasoning failed: ${msg}. Falling back to rule-based scoring.`,
        },
      };
    }
  }
}
