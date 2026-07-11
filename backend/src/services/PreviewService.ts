import { generate } from './providers';
import { getPool } from '../utils/db';
import { logger } from '../utils/logger';

/**
 * Live textual preview — spec §12.1, §12.3, T6.1.
 * Single small-tier LLM call, degraded gracefully on any error
 * (returns {preview: null}, never throws).
 */
export async function generatePreview(
  params: { platform_id: string; task_type: string; known: Record<string, string> },
  userId: string,
  sessionId: string
): Promise<{ preview: string | null; tokensUsed: number }> {
  const systemPrompt =
    'In 1–2 plain sentences, describe the likely output of a <task_type> prompt with these elements. No preamble, no advice.';
  const userMessage = Object.entries(params.known)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const safeMessage = `Platform: ${params.platform_id}\nTask: ${params.task_type}\nElements:\n${userMessage}`;

  let result;
  try {
    result = await generate('preview', 'small', {
      systemPrompt,
      messages: [{ role: 'user', content: safeMessage }],
      maxTokens: 300,
      temperature: 0.4,
      responseFormat: 'text',
    });
  } catch {
    return { preview: null, tokensUsed: 0 };
  }

  if (result.finishReason === 'error') {
    return { preview: null, tokensUsed: 0 };
  }

  const preview = result.content.trim() || null;

  try {
    const pool = getPool();
    await pool.query(
      `insert into usage_events (user_id, session_id, pipeline_step, tokens_used) values ($1, $2, $3, $4)`,
      [userId, sessionId, 'PreviewService', result.tokensUsed.output]
    );
  } catch (error) {
    logger.warn({
      type: 'preview:usage_meter_skipped',
      sessionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return { preview, tokensUsed: result.tokensUsed.output };
}

export async function generateVisualPreview(
  assembled: string
): Promise<{ imageBase64: string | null; mime: string; disclaimer: string } | { error: string }> {
  return { error: 'visual preview not yet implemented in PreviewService' };
}
