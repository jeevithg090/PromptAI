import 'dotenv/config';
import { ModelRefreshAgent } from '../agents/ModelRefreshAgent';
import { clearCapabilityCache } from '../services/RecommendationService';
import { logger } from '../utils/logger';

/**
 * Refresh script for the Model Capability Matrix — spec §15.1 T5.x.
 *
 * Fetches the latest model listings, specs, and pricing from provider docs
 * pages (OpenAI, Anthropic, Google, Groq, etc.) and updates the
 * config/model-capabilities.json and config/model-pricing.json files.
 *
 * Designed to be run as a cron job every 2 days (e.g. cron: '0 0 /2 * *').
 * Or on-demand via:
 *  npm run refresh:models
 */
async function main(): Promise<void> {
  logger.info({ type: 'model_refresh:start', timestamp: new Date().toISOString() });

  const agent = new ModelRefreshAgent();
  const result = await agent.execute({ context: {} as any, params: {} });

  // Clear the in-memory cache so subsequent reads pick up the new data.
  clearCapabilityCache();

  if (result.status === 'success') {
    logger.info({
      type: 'model_refresh:complete',
      models_refreshed: result.data?.models_refreshed,
      updated: result.data?.updated,
      added: result.data?.added,
      sources_checked: result.data?.sources_checked,
      last_verified: result.data?.last_verified,
    });

    if (result.data?.errors) {
      logger.warn({
        type: 'model_refresh:partial_errors',
        errors: result.data.errors,
      });
    }

    process.exitCode = 0;
  } else {
    logger.error({
      type: 'model_refresh:failed',
      error: result.error,
    });
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error({
    type: 'model_refresh:unhandled_error',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exitCode = 1;
});
