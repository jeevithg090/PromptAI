import fs from 'node:fs';
import path from 'node:path';
import { Agent, AgentInput, AgentOutput } from '../types/Agent';
import { fetchDocs } from '../services/DocFetchService';
import { loadCapabilityMatrix, matrixPath } from '../services/RecommendationService';
import type { ReasoningEffort } from '../types/Recommendation';
import { logger } from '../utils/logger';

const PROVIDER_DOCS: Array<{ provider: string; urls: string[]; reasoning_urls?: string[] }> = [
  {
    provider: 'openai',
    urls: [
      'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
      'https://developers.openai.com/api/docs/models/o4-mini',
      'https://developers.openai.com/api/docs/pricing',
    ],
    reasoning_urls: [
      'https://developers.openai.com/api/docs/guides/reasoning',
      'https://developers.openai.com/api/docs/guides/latest-model',
    ],
  },
  {
    provider: 'anthropic',
    urls: [
      'https://platform.claude.com/docs/en/about-claude/models/overview',
      'https://platform.claude.com/docs/en/about-claude/pricing',
    ],
    reasoning_urls: [
      'https://platform.claude.com/docs/en/build-with-claude/effort',
      'https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking',
      'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8',
      'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5',
    ],
  },
  {
    provider: 'google',
    urls: [
      'https://ai.google.dev/gemini-api/docs/models',
    ],
    reasoning_urls: [
      'https://ai.google.dev/gemini-api/docs/thinking',
    ],
  },
  {
    provider: 'groq',
    urls: [
      'https://console.groq.com/docs/models',
    ],
  },
];

function parseReasoningEfforts(text: string, provider: string): Record<string, ReasoningEffort> {
  const result: Record<string, ReasoningEffort> = {};

  if (provider === 'openai') {
    const effortPattern = /(gpt-5\.6-sol|gpt-5\.6-terra|gpt-5\.6-luna|o4-mini|o3|gpt-5-mini)[\s\S]{0,200}?reasoning\.effort/i;
    const gpt56Scale = /supports\s+(`)?(none)(`)?\s*[,\s]+(`)?(low)(`)?\s*[,\s]+(`)?(medium)(`)?\s*[,\s]+(`)?(high)(`)?\s*[,\s]+(`)?(xhigh)(`)?\s*[,\s]+(`)?(max)/i;
    const oScale = /supports\s+(`)?(low)(`)?\s*[,\s]+(`)?(medium)(`)?\s*[,\s]+(`)?(high)(`)?[,\s]+(`)?(xhigh)?/i;
    const proModePattern = /pro\s*mode/i;

    if (gpt56Scale.test(text)) {
      for (const id of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
        result[id] = {
          supported_levels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
          default: 'medium',
          parameter: 'reasoning.effort',
          pro_mode: proModePattern.test(text),
          pro_mode_parameter: proModePattern.test(text) ? 'reasoning.mode' : undefined,
          can_disable: true,
          notes: 'GPT-5.6 family supports none/low/medium/high/xhigh/max reasoning effort. Pro mode available via reasoning.mode for harder tasks.',
        };
      }
    }

    if (oScale.test(text) || text.includes('o4-mini') || text.includes('o3')) {
      for (const id of ['o4-mini']) {
        if (!result[id]) {
          result[id] = {
            supported_levels: ['low', 'medium', 'high'],
            default: 'medium',
            parameter: 'reasoning.effort',
            can_disable: false,
            notes: 'o-series reasoning model. Low for fast production, medium default, high for complex reasoning. Cannot disable reasoning.',
          };
        }
      }
      for (const id of ['o3']) {
        if (!result[id]) {
          result[id] = {
            supported_levels: ['low', 'medium', 'high', 'xhigh'],
            default: 'high',
            parameter: 'reasoning.effort',
            can_disable: false,
            notes: 'Research-grade reasoning. High/xhigh for complex science/math. Not recommended for latency-sensitive workloads.',
          };
        }
      }
    }
  }

  if (provider === 'anthropic') {
    const claudeEffortPattern = /effort\s*(parameter|level)/i;
    const effortLevels = /(`)?(low)(`)?\s*[,\s]+(`)?(medium)(`)?\s*[,\s]+(`)?(high)(`)?[,\s]+(`)?(xhigh)(`)?[,\s]+(`)?(max)/i;
    const defaultHigh = /default.*?effort.*?high/i;
    const adaptiveThinkingPattern = /adaptive\s*thinking/i;
    const thinkingDisabledPattern = /thinking.*?disabled/i;

    if (claudeEffortPattern.test(text) || effortLevels.test(text)) {
      if (text.includes('Opus') || text.includes('opus')) {
        result['claude-opus-4-8'] = {
          supported_levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          default: defaultHigh.test(text) ? 'high' : 'medium',
          parameter: 'effort',
          adaptive_thinking: adaptiveThinkingPattern.test(text),
          adaptive_thinking_parameter: adaptiveThinkingPattern.test(text) ? 'thinking: {type: "adaptive"}' : undefined,
          can_disable: thinkingDisabledPattern.test(text),
          notes: 'Claude Opus 4.8 uses effort parameter (low/medium/high/xhigh/max). Default: high. Adaptive thinking OFF by default, enable with thinking: {type: "adaptive"}. Use xhigh for coding/agentic.',
        };
      }
      if (text.includes('Sonnet') || text.includes('sonnet')) {
        const sonnetEffort: ReasoningEffort = {
          supported_levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          default: defaultHigh.test(text) ? 'high' : 'medium',
          parameter: 'effort',
          adaptive_thinking: adaptiveThinkingPattern.test(text),
          adaptive_thinking_parameter: 'on by default',
          can_disable: true,
          disable_parameter: 'thinking: {type: "disabled"}',
          notes: 'Sonnet 5 defaults to high. Adaptive thinking ON by default. Pass thinking: {type: "disabled"} to turn off. Uses more tokens with thinking (~30% more).',
        };
        result['claude-sonnet-5'] = sonnetEffort;
      }
      if (text.includes('Haiku') || text.includes('haiku')) {
        result['claude-haiku-4-5'] = {
          supported_levels: ['low', 'medium', 'high'],
          default: 'medium',
          parameter: 'extended thinking',
          adaptive_thinking: false,
          can_disable: false,
          notes: 'Haiku 4.5 supports extended thinking (not adaptive). No explicit effort knob — thinking always on at fixed level. Use as-is.',
        };
      }
    }
  }

  if (provider === 'google') {
    const thinkingLevelPattern = /thinkingLevel/i;
    const thinkingBudgetPattern = /thinkingBudget/i;
    const levelTable = /(MINIMAL|LOW|MEDIUM|HIGH)/g;

    if (text.includes('3.1 Pro') || text.includes('gemini-3.1-pro') || text.includes('gemini-3.5-flash') || text.includes('gemini-3.1-flash-lite')) {
      const levels = text.match(levelTable) ? [...new Set(text.match(levelTable)!)] : null;

      if (text.includes('3.1 Pro') || text.includes('gemini-3.1-pro')) {
        result['gemini-3.1-pro'] = {
          supported_levels: levels?.filter(l => l !== 'MINIMAL') ?? ['LOW', 'MEDIUM', 'HIGH'],
          default: 'HIGH',
          parameter: 'thinkingLevel',
          thinking_always_on: true,
          dynamic_thinking: true,
          notes: 'Gemini 3.1 Pro uses thinkingLevel (LOW/MEDIUM/HIGH). Default: HIGH. HIGH activates Deep Think Mini. Thinking always on. MEDIUM for daily default.',
        };
      }
      if (text.includes('3.5 Flash') || text.includes('gemini-3.5-flash')) {
        result['gemini-3.5-flash'] = {
          supported_levels: levels ?? ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
          default: 'MEDIUM',
          parameter: 'thinkingLevel',
          thinking_always_on: true,
          dynamic_thinking: true,
          notes: 'Gemini 3.5 Flash supports MINIMAL/LOW/MEDIUM/HIGH. Default: MEDIUM. MINIMAL for near-zero thinking. Thinking always on.',
        };
      }
      if (text.includes('Flash-Lite') || text.includes('flash-lite') || text.includes('3.1-flash-lite')) {
        result['gemini-3.1-flash-lite'] = {
          supported_levels: levels ?? ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
          default: 'MINIMAL',
          parameter: 'thinkingLevel',
          thinking_always_on: true,
          dynamic_thinking: true,
          notes: 'Flash-Lite supports all 4 levels. Default: MINIMAL. Thinking always on. Best with MINIMAL/LOW for high-throughput.',
        };
      }
    }

    if (text.includes('2.5 Pro') || text.includes('2.5 Flash')) {
      const budgetMatch = text.match(/(\d+,\d+|\d+)/g);
      if (text.includes('2.5 Pro') || text.includes('gemini-2.5-pro')) {
        result['gemini-2.5-pro'] = {
          supported_levels: ['budget'],
          default: '8192',
          parameter: 'thinkingBudget',
          budget_min: 128,
          budget_max: 32768,
          thinking_always_on: true,
          can_disable: false,
          dynamic_budget_parameter: -1,
          notes: 'Uses thinkingBudget (token count). Default: 8192. Range: 128-32768. Dynamic: -1 (max 8192). Cannot be disabled.',
        };
      }
      if (text.includes('2.5 Flash') || text.includes('gemini-2.5-flash')) {
        if (text.includes('Lite') || text.includes('lite')) {
          result['gemini-2.5-flash-lite'] = {
            supported_levels: ['budget'],
            default: '0',
            parameter: 'thinkingBudget',
            budget_min: 512,
            budget_max: 24576,
            disabled_by_default: true,
            can_disable: true,
            disable_value: 0,
            dynamic_budget_parameter: -1,
            notes: 'Thinking DISABLED by default (budget=0). Enable by setting 512-24576. Dynamic: -1.',
          };
        } else {
          result['gemini-2.5-flash'] = {
            supported_levels: ['budget'],
            default: '8192',
            parameter: 'thinkingBudget',
            budget_min: 1,
            budget_max: 24576,
            can_disable: true,
            disable_value: 0,
            dynamic_budget_parameter: -1,
            notes: 'Uses thinkingBudget. Default: 8192. Range: 1-24576. Disable: 0. Dynamic: -1 (max 8192).',
          };
        }
      }
    }
  }

  return result;
}

function parseModelSpecs(text: string, provider: string): Array<{
  model_id: string;
  display_name: string;
  strengths: string[];
  context_window?: number;
  cost_tier?: number;
  latency_tier?: number;
  notes?: string;
}> {
  const specs: Array<any> = [];
  if (provider === 'openai') {
    if (text.includes('gpt-5.6-sol') || text.includes('GPT-5.6 Sol')) {
      const contextMatch = text.match(/(\d{4,7}),?000?\s*(?:context|token)/i);
      specs.push({
        model_id: 'gpt-5.6-sol',
        display_name: 'GPT-5.6 Sol',
        strengths: ['reasoning', 'code', 'writing', 'multimodal', 'agentic'],
        context_window: contextMatch ? parseInt(contextMatch[1]!) * 1000 : 1050000,
        cost_tier: 5,
        latency_tier: 3,
        notes: 'Frontier model. $5/$30 per 1M tokens. 1M context.',
      });
    }
  }
  if (provider === 'anthropic') {
    if (text.includes('Opus 4.8') || text.includes('claude-opus-4-8')) {
      specs.push({
        model_id: 'claude-opus-4-8',
        display_name: 'Claude Opus 4.8',
        strengths: ['reasoning', 'code', 'long-context', 'agentic', 'computer-use'],
        context_window: 1000000,
        cost_tier: 4,
        latency_tier: 3,
        notes: '$5/$25 per 1M tokens. 1M context. Hybrid reasoning.',
      });
    }
    if (text.includes('Sonnet 5') || text.includes('claude-sonnet-5')) {
      specs.push({
        model_id: 'claude-sonnet-5',
        display_name: 'Claude Sonnet 5',
        strengths: ['reasoning', 'code', 'writing', 'balanced'],
        context_window: 1000000,
        cost_tier: 3,
        latency_tier: 2,
        notes: '$3/$15 per 1M tokens. 1M context. Strong balanced model.',
      });
    }
    if (text.includes('Haiku 4.5') || text.includes('claude-haiku-4-5')) {
      specs.push({
        model_id: 'claude-haiku-4-5',
        display_name: 'Claude Haiku 4.5',
        strengths: ['code', 'fast', 'cheap', 'high-throughput', 'agentic'],
        context_window: 200000,
        cost_tier: 1,
        latency_tier: 1,
        notes: '$1/$5 per 1M tokens. 73.3% SWE-bench. Fastest Claude.',
      });
    }
  }
  if (provider === 'google') {
    if (text.includes('3.1 Pro') || text.includes('gemini-3.1-pro')) {
      specs.push({
        model_id: 'gemini-3.1-pro',
        display_name: 'Gemini 3.1 Pro',
        strengths: ['reasoning', 'code', 'multimodal', 'long-context', 'agentic'],
        context_window: 1000000,
        cost_tier: 3,
        latency_tier: 2,
        notes: 'Google most advanced. 1M context. Deep Think mode.',
      });
    }
    if (text.includes('3.5 Flash') || text.includes('gemini-3.5-flash')) {
      specs.push({
        model_id: 'gemini-3.5-flash',
        display_name: 'Gemini 3.5 Flash',
        strengths: ['multimodal', 'fast', 'cheap', 'high-throughput', 'coding'],
        context_window: 1000000,
        cost_tier: 2,
        latency_tier: 1,
        notes: 'Best price-performance Flash. Agentic and coding tasks.',
      });
    }
  }
  if (provider === 'groq') {
    if (text.includes('Llama 4 Scout') || text.includes('llama-4-scout')) {
      specs.push({
        model_id: 'llama-4-scout',
        display_name: 'Llama 4 Scout',
        strengths: ['multimodal', 'fast', 'cheap', 'high-throughput', 'open-weight'],
        context_window: 128000,
        cost_tier: 1,
        latency_tier: 1,
        notes: '109B MoE. 460+ tok/s. $0.11/$0.34 per 1M.',
      });
    }
    if (text.includes('Llama 4 Maverick') || text.includes('llama-4-maverick')) {
      specs.push({
        model_id: 'llama-4-maverick',
        display_name: 'Llama 4 Maverick',
        strengths: ['reasoning', 'code', 'multimodal', 'general', 'open-weight'],
        context_window: 128000,
        cost_tier: 1,
        latency_tier: 1,
        notes: '400B MoE. $0.50/$0.77 per 1M. Strong open-weight generalist.',
      });
    }
  }
  return specs;
}

function extractPricing(text: string): Record<string, { input: number; output: number }> {
  const prices: Record<string, { input: number; output: number }> = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const modelMatch = line.match(/(gpt-5\.6-sol|gpt-5\.6-terra|gpt-5\.6-luna|claude-opus-4-8|claude-sonnet-5|claude-haiku-4-5|gemini-3\.1-pro|gemini-3\.5-flash|llama-4-scout|llama-4-maverick)/);
    if (!modelMatch) continue;
    const inp = line.match(/\$(\d+\.?\d*)\s*\/\s*M\s*(?:input|token)/i);
    const out = line.match(/\$(\d+\.?\d*)\s*\/\s*M\s*(?:output|token)/i);
    if (inp && out) {
      prices[modelMatch[1]!] = { input: parseFloat(inp[1]!), output: parseFloat(out[1]!) };
    }
  }
  return prices;
}

export class ModelRefreshAgent implements Agent {
  name = 'ModelRefreshAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const freshModels: Map<string, any> = new Map();
    const freshReasoningEfforts: Map<string, ReasoningEffort> = new Map();
    const freshPricing: Map<string, { input: number; output: number }> = new Map();
    let errors: string[] = [];

    for (const { provider, urls, reasoning_urls } of PROVIDER_DOCS) {
      for (const url of urls) {
        try {
          logger.info({ type: 'model_refresh:fetching', provider, url });
          const pages = await fetchDocs(url);
          const combined = pages.map((p) => p.text).join('\n');
          const specs = parseModelSpecs(combined, provider);
          for (const spec of specs) {
            freshModels.set(spec.model_id, spec);
          }
          const pricing = extractPricing(combined);
          for (const [k, v] of Object.entries(pricing)) {
            freshPricing.set(k, v);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ type: 'model_refresh:fetch_error', provider, url, error: msg });
          errors.push(`${provider}/${url}: ${msg}`);
        }
      }

      if (reasoning_urls) {
        for (const url of reasoning_urls) {
          try {
            logger.info({ type: 'model_refresh:fetching_reasoning', provider, url });
            const pages = await fetchDocs(url);
            const combined = pages.map((p) => p.text).join('\n');
            const efforts = parseReasoningEfforts(combined, provider);
            for (const [modelId, effort] of Object.entries(efforts)) {
              freshReasoningEfforts.set(modelId, effort);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn({ type: 'model_refresh:reasoning_fetch_error', provider, url, error: msg });
            errors.push(`reasoning/${provider}/${url}: ${msg}`);
          }
        }
      }
    }

    const matrix = loadCapabilityMatrix();
    let updatedCount = 0;
    let addedCount = 0;
    let reasoningUpdatedCount = 0;

    for (const [modelId, fresh] of freshModels) {
      const existing = matrix.models.find((m) => m.model_id === modelId);
      if (existing) {
        existing.strengths = [...new Set([...existing.strengths, ...fresh.strengths])];
        if (fresh.context_window) existing.context_window = fresh.context_window;
        if (fresh.cost_tier) existing.cost_tier = fresh.cost_tier;
        if (fresh.latency_tier) existing.latency_tier = fresh.latency_tier;
        if (fresh.notes) existing.notes = fresh.notes;
        updatedCount++;
      } else {
        matrix.models.push({
          model_id: fresh.model_id,
          display_name: fresh.display_name,
          provider: fresh.provider || matrix.models[0]?.provider || 'unknown',
          modalities: ['text', 'code'],
          context_window: fresh.context_window || 128000,
          cost_tier: fresh.cost_tier || 3,
          latency_tier: fresh.latency_tier || 3,
          strengths: fresh.strengths,
          notes: fresh.notes,
        });
        addedCount++;
      }
    }

    for (const [modelId, effort] of freshReasoningEfforts) {
      const existing = matrix.models.find((m) => m.model_id === modelId);
      if (existing) {
        existing.reasoning_efforts = effort;
        reasoningUpdatedCount++;
      }
    }

    matrix.last_verified = new Date().toISOString().slice(0, 10);
    matrix.schema_version = `2.1.0-refreshed-${Date.now()}`;

    const configPath = path.resolve(__dirname, '..', '..', '..', 'config', 'model-capabilities.json');
    fs.writeFileSync(configPath, JSON.stringify(matrix, null, 2), 'utf-8');

    if (freshPricing.size > 0) {
      const pricingPath = path.resolve(__dirname, '..', '..', '..', 'config', 'model-pricing.json');
      try {
        const existingPricing = JSON.parse(fs.readFileSync(pricingPath, 'utf-8'));
        for (const [modelId, price] of freshPricing) {
          const existing = existingPricing.models?.find((m: any) => m.model_id === modelId);
          if (existing) {
            existing.input_per_1m = price.input;
            existing.output_per_1m = price.output;
          } else {
            if (!existingPricing.models) existingPricing.models = [];
            existingPricing.models.push({
              model_id: modelId,
              input_per_1m: price.input,
              output_per_1m: price.output,
            });
          }
        }
        existingPricing.last_verified = matrix.last_verified;
        fs.writeFileSync(pricingPath, JSON.stringify(existingPricing, null, 2), 'utf-8');
      } catch {
        logger.warn({ type: 'model_refresh:pricing_skipped', reason: 'could not read pricing file' });
      }
    }

    return {
      status: 'success',
      data: {
        models_refreshed: matrix.models.length,
        updated: updatedCount,
        added: addedCount,
        reasoning_efforts_updated: reasoningUpdatedCount,
        errors: errors.length > 0 ? errors : undefined,
        last_verified: matrix.last_verified,
        sources_checked: PROVIDER_DOCS.length,
        reasoning_sources_checked: PROVIDER_DOCS.filter((p) => p.reasoning_urls).length,
      },
    };
  }
}
