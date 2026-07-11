import type { ErrorHandler } from 'hono';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  logger.error({ err }, 'Unhandled error');
  return c.json(
    { error: 'Internal server error', message: err.message },
    500,
  );
};
