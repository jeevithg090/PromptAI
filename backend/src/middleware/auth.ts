import type { Context, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { audit } from '../services/AuditService';
import type { AppEnv } from '../types/Http';

/**
 * JWT verification middleware — spec §23.4 (custom plumbing #1).
 * Verifies Supabase-issued JWTs from the Authorization header.
 * Prefers asymmetric verification against the project's JWKS endpoint
 * (cached after first fetch); falls back to the legacy HS256 shared secret.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks && config.SUPABASE_JWKS_URL) {
    jwks = createRemoteJWKSet(new URL(config.SUPABASE_JWKS_URL));
  }
  return jwks;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  // Local development escape hatch only — refused in production (config/env.ts).
  if (config.DEV_AUTH_BYPASS) {
    c.set('userId', 'dev-user-000');
    c.set('email', null);
    return next();
  }

  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    void audit({ actor: 'anonymous', action: 'auth:rejected', status: 'failure', detail: { reason: 'missing bearer token' } });
    return c.json({ error: 'missing bearer token' }, 401);
  }
  const token = header.slice('Bearer '.length);

  try {
    if (config.SUPABASE_JWKS_URL) {
      // Pin the algorithm (§27, T3.8) — Supabase signs with ES256; pinning
      // blocks algorithm-confusion / `alg:none` downgrade attacks.
      const { payload } = await jwtVerify(token, getJwks()!, { algorithms: ['ES256'] });
      c.set('userId', String(payload.sub));
      c.set('email', typeof payload.email === 'string' ? payload.email : null);
    } else if (config.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(config.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      c.set('userId', String(payload.sub));
      c.set('email', typeof payload.email === 'string' ? payload.email : null);
    } else {
      logger.error({ type: 'auth:not_configured' });
      void audit({ actor: 'anonymous', action: 'auth:rejected', status: 'failure', detail: { reason: 'auth not configured on this deployment' } });
      return c.json({ error: 'auth not configured on this deployment' }, 503);
    }
  } catch {
    void audit({ actor: 'anonymous', action: 'auth:rejected', status: 'failure', detail: { reason: 'invalid or expired token' } });
    return c.json({ error: 'invalid or expired token' }, 401);
  }

  return next();
}
