import { config } from '../config/env';
import { logger } from '../utils/logger';

/** True when the Supabase admin API (service-role key) can be called. */
export function authAdminConfigured(): boolean {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Delete the Supabase auth user, so a deleted account cannot sign back in.
 * A 404 counts as done (a retried deletion). Without admin config (local dev,
 * tests) it is skipped; DELETE /me refuses up front in production instead.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  if (!authAdminConfigured()) {
    logger.warn({ type: 'account:auth_user_delete_skipped', reason: 'Supabase admin API not configured' });
    return;
  }
  const key = config.SUPABASE_SERVICE_ROLE_KEY as string;
  const res = await fetch(`${config.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Supabase auth user delete failed: ${res.status}`);
  }
}
