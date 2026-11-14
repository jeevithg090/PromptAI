import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { errorHandler } from './middleware/errorHandler.js';
import { adminAuth } from './middleware/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { featuresRouter } from './routes/features.js';
import { registryRouter } from './routes/registry.js';
import { killRouter } from './routes/kill.js';
import { libraryRouter } from './routes/library.js';
import { traceRouter } from './routes/trace.js';
import { healthRouter } from './routes/health.js';

export const app = new Hono();

app.onError(errorHandler);

// Security hardening — same bar as the consumer backend (T3.8 / F0.5).
// secureHeaders() sets X-Content-Type-Options, X-Frame-Options, etc.; the
// body-size cap rejects oversized payloads (DoS) with 413.
app.use('*', secureHeaders());
app.use('*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'payload too large' }, 413) }));

// Public liveness probe — the only route outside adminAuth.
app.route('/', healthRouter);

// Every other admin route runs with the service-role key, so it must be authenticated.
app.use('/admin/*', async (c, next) => {
  if (c.req.path === '/admin/health') return next();
  return adminAuth(c, next);
});

app.route('/', dashboardRouter);
app.route('/', featuresRouter);
app.route('/', registryRouter);
app.route('/', killRouter);
app.route('/', libraryRouter);
app.route('/', traceRouter);
