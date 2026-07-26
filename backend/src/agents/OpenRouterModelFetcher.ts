import fs from 'node:fs';
import path from 'node:path';
import { Agent, AgentInput, AgentOutput } from '../types/Agent';
import { clearCapabilityCache, loadCapabilityMatrix } from '../services/RecommendationService';
import { logger } from '../utils/logger';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/models';
const CACHE_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'openrouter-models.json');

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    input_cache_write?: string;
    web_search?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
  };
  supported_parameters: string[];
  reasoning: {
    mandatory: boolean;
    default_enabled: boolean;
    supported_efforts: string[];
    default_effort: string;
  } | null;
  knowledge_cutoff: string;
}

function readCache(): OpenRouterModel[] {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function writeCache(models: OpenRouterModel[]): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(models, null, 2), 'utf-8');
}

export class OpenRouterModelFetcher implements Agent {
  name = 'OpenRouterModelFetcher';

  async execute(input: AgentInput): Promise<AgentOutput> {
    logger.info({ type: 'openrouter:fetch_start', url: OPENROUTER_API });

    const res = await fetch(OPENROUTER_API, {
      headers: {
        'User-Agent': 'PromptForgeBot/1.0',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return {
        status: 'failure',
        error: `OpenRouter API returned ${res.status}: ${await res.text().catch(() => 'unknown')}`,
      };
    }

    const body = (await res.json()) as { data: any[] };
    const raw = body.data || [];

    const models: OpenRouterModel[] = raw.map((m: any) => ({
      id: m.id,
      name: m.name,
      description: (m.description || '').slice(0, 2000),
      context_length: m.context_length || m.top_provider?.context_length || 0,
      pricing: {
        prompt: m.pricing?.prompt || '0',
        completion: m.pricing?.completion || '0',
        input_cache_read: m.pricing?.input_cache_read,
        input_cache_write: m.pricing?.input_cache_write,
        web_search: m.pricing?.web_search,
      },
      top_provider: {
        context_length: m.top_provider?.context_length || 0,
        max_completion_tokens: m.top_provider?.max_completion_tokens || 0,
        is_moderated: m.top_provider?.is_moderated ?? false,
      },
      architecture: {
        modality: m.architecture?.modality || 'text->text',
        input_modalities: m.architecture?.input_modalities || ['text'],
        output_modalities: m.architecture?.output_modalities || ['text'],
        tokenizer: m.architecture?.tokenizer || '',
      },
      supported_parameters: m.supported_parameters || [],
      reasoning: m.reasoning || null,
      knowledge_cutoff: m.knowledge_cutoff || '',
    }));

    writeCache(models);

    // Update model-capabilities.json with fresh reasoning effort data
    let reasoningUpdated = 0;
    let pricingUpdated = 0;
    let modelsAdded = 0;

    const matrix = loadCapabilityMatrix();

    for (const orm of models) {
      const existing = matrix.models.find((m) => m.model_id === orm.id || m.model_id === orm.id.split('/').pop());
      if (!existing) continue;

      if (orm.reasoning?.supported_efforts) {
        const platformId = orm.id.split('/')[0]!;
        const isPro = orm.id.includes('-pro') || orm.id.includes('pro');

        if (!existing.reasoning_efforts) {
          existing.reasoning_efforts = {
            supported_levels: orm.reasoning.supported_efforts,
            default: orm.reasoning.default_effort || orm.reasoning.supported_efforts[0] || 'medium',
            parameter: orm.reasoning.supported_efforts.length > 1 ? 'reasoning_effort' : undefined,
            can_disable: orm.reasoning.supported_efforts.includes('none'),
            notes: `OpenRouter: ${orm.reasoning.supported_efforts.join('/')}` + (isPro ? ' (pro mode)' : ''),
          };
          reasoningUpdated++;
        }
      }

      // Update context and output limits
      if (orm.context_length > 0 && existing.context_window !== orm.context_length) {
        existing.context_window = orm.context_length;
      }
      if (orm.top_provider.max_completion_tokens > 0) {
        existing.max_output_tokens = orm.top_provider.max_completion_tokens;
      }
    }

    matrix.last_verified = new Date().toISOString().slice(0, 10);
    const matrixPath = path.resolve(__dirname, '..', '..', '..', 'config', 'model-capabilities.json');
    fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2), 'utf-8');
    clearCapabilityCache();

    logger.info({
      type: 'openrouter:fetch_complete',
      total: models.length,
      cached: CACHE_PATH,
      reasoning_updated: reasoningUpdated,
      models_added: modelsAdded,
    });

    return {
      status: 'success',
      data: {
        models_fetched: models.length,
        models_cached: models.length,
        reasoning_efforts_updated: reasoningUpdated,
        pricing_updated: pricingUpdated,
        models_added: modelsAdded,
      },
    };
  }
}
