import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase email/password auth for the desktop app. The anon key is public by
// design (safe in the client). Session token is persisted via the safeStorage-
// encrypted store in the main process (window.pf), not localStorage.
const url = (import.meta.env.PF_SUPABASE_URL as string) ?? '';
const anon = (import.meta.env.PF_SUPABASE_ANON_KEY as string) ?? '';

export const supabase: SupabaseClient | null = url && anon
  ? createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: true } })
  : null;
