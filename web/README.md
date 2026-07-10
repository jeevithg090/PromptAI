# PromptForge Web App (Next.js)

The user-facing web surface for PromptForge — landing page, try-it-now demo, draft builder with node editor,
prompt library, and account management.

## Stack

- **Next.js 15 (App Router)** + TypeScript
- **Tailwind CSS** for styling
- **Cloudflare Pages** deployment via `@cloudflare/next-on-pages`
- **Supabase Auth** for user authentication (browser client)

## Getting started

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your Supabase project URL + anon key
npm run dev
```

The dev server runs on `http://localhost:3000`. The backend must be running on `http://localhost:3001` (see `backend/README.md`).

## API Client

The typed API client lives in `src/lib/api.ts` (`ApiClient` class, exported singleton `api`). It reads `NEXT_PUBLIC_API_URL` from the environment and calls all backend endpoints with 30s timeouts.

Backend response DTOs are hand-copied into `src/lib/api-types.ts` — keep them in sync with `backend/src/types/Response.ts`, `Prompt.ts`, etc.

## Pages

| Path | Description | Auth |
|---|---|---|
| `/` | Landing page (static, SEO-friendly) | No |
| `/try` | Try-it-now demo flow (T4.3) | No |
| `/build` | Draft builder — platform select, idea, clarify, result | Yes |
| `/auth/signin` | Sign in | No |
| `/auth/signup` | Sign up | No |
| `/auth/reset` | Password reset | No |
| `/account` | Account settings, usage, connections | Yes |

## Cloudflare Pages deployment

```bash
# Build for Pages
NPM_CONFIG_LEGACY_PEER_DEPS=true npm run pages:build

# Deploy (requires Cloudflare credentials)
npx wrangler pages deploy .vercel/output/static

# Set env vars in Cloudflare Pages dashboard
# NEXT_PUBLIC_API_URL = https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com
```

Create the Pages project first with:
```bash
npx wrangler pages project create promptforge-web
```

## Auth

Authentication uses Supabase Auth directly from the browser. The `@supabase/supabase-js` client is initialized from two public env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). The auth token is passed to the backend API client automatically via the `AuthProvider` component.

## All UI strings

Every user-visible string lives in `src/lib/strings.ts` — no hardcoded literals in components (§29.6 i18n discipline).