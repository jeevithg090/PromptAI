/**
 * Supabase browser client — configured from public env vars (§19.1).
 * The anon key is safe in the browser (public-by-design).
 */
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const hasConfig = !!(supabaseUrl && supabaseAnonKey);

export const supabase = hasConfig ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null;

/** True when Supabase env vars are present. Components check this before using supabase. */
export const supabaseConfigured = hasConfig;