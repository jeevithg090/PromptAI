import type { Context, Next } from 'hono';
import { logger } from '../utils/logger';

/** Request instrumentation — spec §32.9. Path/method/status/duration; never bodies (§19.1). */
export async function requestLogger(c: Context, next: Next) {
  const started = Date.now();
  await next();
  logger.info({
    type: 'request:complete',
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - started,
  });
}
