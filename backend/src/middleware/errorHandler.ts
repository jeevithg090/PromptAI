import type { Context } from 'hono';
import { logger } from '../utils/logger';

/**
 * Global error boundary — spec §32.5 ("errors are data") and §29.7
 * (graceful degradation): users get an honest, generic message; the
 * structured log gets the details. Never leaks stack traces to clients.
 *
 * Error-rate visibility (T3.3): a module-level counter logs
 * `{type:'errors:rate', count, windowStart}` at error level every time
 * the count in a rolling 5-minute window crosses a multiple of 10.
 * Simple in-memory, per-instance.
 */
let errorCount = 0;
let windowStart = Date.now();
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function onError(err: Error, c: Context) {
  const now = Date.now();
  // Roll the window.
  if (now - windowStart > WINDOW_MS) {
    errorCount = 0;
    windowStart = now;
  }
  errorCount += 1;

  // Log error-rate spike every time count crosses a multiple of 10.
  if (errorCount % 10 === 0) {
    logger.error({
      type: 'errors:rate',
      count: errorCount,
      windowStart: new Date(windowStart).toISOString(),
    });
  }

  logger.error({
    type: 'request:error',
    path: c.req.path,
    method: c.req.method,
    error: err.message,
    stack: err.stack,
  });
  return c.json({ error: 'internal error — please try again' }, 500);
}
