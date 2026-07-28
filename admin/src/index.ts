import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
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

// Security hardening — same bar as the consumer backend (T3.8 / F0.5).
// secureHeaders() sets X-Content-Type-Options, X-Frame-Options, etc.; the
// body-size cap rejects oversized payloads (DoS) with 413.
app.use('*', secureHeaders());
app.use('*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'payload too large' }, 413) }));

app.route('/', healthRouter);

// Every /admin/* route requires a valid Supabase JWT AND an allow-listed
// admin identity (email allowlist or admin_roles row). /admin/health is
// intentionally excluded so container/uptime probes still work; the health
// router is mounted above this guard.
app.use('/admin/*', adminAuth);

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
