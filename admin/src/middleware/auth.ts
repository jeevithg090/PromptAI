import { createMiddleware } from 'hono/factory';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import { getDb } from '../utils/db.js';
import { logger } from '../utils/logger.js';

declare module 'hono' {
  interface ContextVariableMap {
    adminUser: { id: string; email: string };
  }
}

export const adminAuth = createMiddleware<{ Bindings: {} }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);

  const db = getDb();
  let user: { id: string; email: string } | null = null;

  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      logger.warn({ error: error?.message }, 'JWT verification failed');
      return c.json({ error: 'Unauthorized' }, 401);
    }
    user = {
      id: data.user.id,
      email: data.user.email ?? '',
    };
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const env = getEnv();
  const allowedEmails = env.ADMIN_ALLOWED_EMAILS
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const emailOk = allowedEmails.length === 0 || allowedEmails.includes(user.email.toLowerCase());
  const roleOk = await isAdminByRole(db, user.id);

  if (!emailOk && !roleOk) {
    logger.warn({ userId: user.id, email: user.email }, 'Admin access denied');
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('adminUser', user);
  await next();
});

async function isAdminByRole(db: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await db
      .from('admin_roles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      logger.warn({ error: error.message }, 'admin_roles query failed (table may not exist)');
      return false;
    }
    return data !== null;
  } catch {
    return false;
  }
}
