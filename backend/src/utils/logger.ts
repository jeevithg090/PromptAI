import pino from 'pino';
import { config } from '../config/env';

/**
 * Structured logger — spec §32.5.
 * stdout in prod (Lambda → CloudWatch); pretty-printed in local dev.
 *
 * HARD RULE (§19.1): user prompt content, clarification text, memory
 * statements, and BYOK key material are NEVER passed to this logger.
 * Log ids, counts, timings, categories, and status — not content.
 */
export const logger = pino(
  config.NODE_ENV === 'development'
    ? { level: config.LOG_LEVEL, transport: { target: 'pino-pretty' } }
    : { level: config.LOG_LEVEL }
);

export interface LogEvent {
  type: string;
  userId?: string;
  sessionId?: string;
  action?: string;
  status?: 'success' | 'failure' | 'blocked';
  durationMs?: number;
  tokensUsed?: number;
  details?: Record<string, unknown>;
}

export function logEvent(event: LogEvent): void {
  logger.info(event);
}
