import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DbSchema } from '../config/db.types.js';
import { getEnv } from '../config/env.js';

type TypedClient = SupabaseClient<DbSchema>;

let _db: TypedClient | null = null;

export function getDb(): TypedClient {
  if (!_db) {
    const env = getEnv();
    _db = createClient<DbSchema>(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}
