/**
 * Accounts (blueprint §12): Supabase Auth with email OTP, Google and Apple.
 * Screens talk to `AuthPort` only. Builds without Supabase keys get the dev
 * fake in development (or when VITE_PROMPTAI_DEV_AUTH=1, for the e2e tests)
 * and no sign-in at all otherwise.
 */
export type OAuthProvider = 'google' | 'apple';
export type AuthMethod = 'email' | OAuthProvider;

export interface AuthSession {
  accessToken: string;
  email: string | null;
}

export interface AuthPort {
  readonly methods: readonly AuthMethod[];
  /** The dev fake shows its fixed code in the sign-in dialog. */
  readonly devCode: string | null;
  session(): AuthSession | null;
  onChange(listener: (session: AuthSession | null) => void): () => void;
  /** Emails a one-time code. */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  /** Leaves the page for the provider and comes back signed in (PKCE). */
  signInWith(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;
}

function listeners() {
  const set = new Set<(s: AuthSession | null) => void>();
  return {
    add(l: (s: AuthSession | null) => void) {
      set.add(l);
      return () => {
        set.delete(l);
      };
    },
    emit(s: AuthSession | null) {
      for (const l of set) l(s);
    },
  };
}

export const DEV_CODE = '123456';
const DEV_KEY = 'promptai.devAuth';

/** Accepts any email with code 123456, and "signs in" with Google or Apple at once. Never talks to a network. */
export function createDevAuth(): AuthPort {
  const ls = listeners();
  let current: AuthSession | null = null;
  try {
    current = JSON.parse(localStorage.getItem(DEV_KEY) ?? 'null') as AuthSession | null;
  } catch {}
  const set = (s: AuthSession | null) => {
    current = s;
    try {
      if (s) localStorage.setItem(DEV_KEY, JSON.stringify(s));
      else localStorage.removeItem(DEV_KEY);
    } catch {}
    ls.emit(s);
  };
  const token = () => `dev-${crypto.randomUUID()}`;
  return {
    methods: ['email', 'google', 'apple'],
    devCode: DEV_CODE,
    session: () => current,
    onChange: ls.add,
    async sendCode() {},
    async verifyCode(email, code) {
      if (code.trim() !== DEV_CODE) throw new Error('That code is not right.');
      set({ accessToken: token(), email });
    },
    async signInWith(provider) {
      set({ accessToken: token(), email: `dev@${provider}.test` });
    },
    async signOut() {
      set(null);
    },
  };
}

/** The real client, loaded on first use so supabase-js stays out of the first-load bundle. */
export function createSupabaseAuth(url: string, anonKey: string): AuthPort {
  const ls = listeners();
  let current: AuthSession | null = null;
  const client = import('@supabase/supabase-js').then(({ createClient }) => {
    const c = createClient(url, anonKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    c.auth.onAuthStateChange((_event, s) => {
      current = s ? { accessToken: s.access_token, email: s.user.email ?? null } : null;
      ls.emit(current);
    });
    return c;
  });
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    methods: ['email', 'google', 'apple'],
    devCode: null,
    session: () => current,
    onChange: ls.add,
    async sendCode(email) {
      fail((await (await client).auth.signInWithOtp({ email, options: { shouldCreateUser: true } })).error);
    },
    async verifyCode(email, token) {
      fail((await (await client).auth.verifyOtp({ email, token, type: 'email' })).error);
    },
    async signInWith(provider) {
      fail((await (await client).auth.signInWithOAuth({ provider, options: { redirectTo: location.href.split('#')[0] } })).error);
    },
    async signOut() {
      fail((await (await client).auth.signOut()).error);
    },
  };
}

export interface AuthConfig {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_PROMPTAI_DEV_AUTH?: string;
  DEV: boolean;
}

export function authFromConfig(env: AuthConfig): AuthPort | null {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return createSupabaseAuth(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  if (env.DEV || env.VITE_PROMPTAI_DEV_AUTH === '1') return createDevAuth();
  return null;
}
