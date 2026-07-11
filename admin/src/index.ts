import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { getEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminAuth } from './middleware/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { featuresRouter } from './routes/features.js';
import { registryRouter } from './routes/registry.js';
import { killRouter } from './routes/kill.js';
import { libraryRouter } from './routes/library.js';
import { traceRouter } from './routes/trace.js';
import { healthRouter } from './routes/health.js';

const app = new Hono();

app.onError(errorHandler);

app.route('/', healthRouter);

app.route('/', dashboardRouter);
app.route('/', featuresRouter);
app.route('/', registryRouter);
app.route('/', killRouter);
app.route('/', libraryRouter);
app.route('/', traceRouter);

if (process.env.NODE_ENV !== 'production') {
  const env = getEnv();
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`Admin API listening on http://localhost:${info.port}`);
  });
}

export const handler = app.fetch;
