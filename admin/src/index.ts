import { serve } from '@hono/node-server';
import { getEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { app } from './app.js';

if (process.env.NODE_ENV !== 'production') {
  const env = getEnv();
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`Admin API listening on http://localhost:${info.port}`);
  });
}

export const handler = app.fetch;
