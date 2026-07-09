import { IntentClassificationAgent } from '../agents/IntentClassificationAgent';
import { getPlatform } from '../services/PlatformService';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Live smoke test for T2.5 — one real model call through the full
 * ModelRouter → OpenCodeZenAdapter path. Requires OPENCODE_API_KEY.
 * Run: npm run smoke:intent
 */
async function smoke(): Promise<void> {
  if (!config.OPENCODE_API_KEY) {
    logger.error({ type: 'smoke:missing_key', message: 'Set OPENCODE_API_KEY in .env (from opencode.ai/auth) and re-run.' });
    process.exitCode = 1;
    return;
  }

  const platform = getPlatform('google_gemini');
  if (!platform) throw new Error('registry missing google_gemini');

  const agent = new IntentClassificationAgent();
  const result = await agent.execute({
    context: {
      userId: 'smoke-test',
      sessionId: `smoke-${Date.now()}`,
      platform,
      userIdea: 'create an image of a horse running through shallow water at golden hour',
    },
    params: {},
  });

  // Smoke output goes to stdout deliberately — it's a dev tool, not app logging.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'success' || result.data?.task_type !== 'text_to_image') {
    process.exitCode = 1;
  }
}

smoke().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
