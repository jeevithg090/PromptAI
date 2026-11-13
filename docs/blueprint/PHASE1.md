# Phase 1 plan: the MVP, Speak-it-right on macOS and the web

Started 2026-11-13 on branch `phase-0/rebuild`. Scope and checks come from `BLUEPRINT.md` §19 Phase 1. The desktop shell is Electron (B1). The shared wire contract is `packages/contract` v2, which adds:
- in forge: the language context, the IntentFrame, fields, issues, the coverage map and `decisionId`;
- in `me.ts`: guest tokens, the age gate, the consent ledger, profile, memory, library, report and export.

Each workstream owns its folders and builds against the contract. The lead merges them and does the integration steps.

## Workstreams

| # | Owns | Delivers |
|---|---|---|
| W1 core + catalog | `packages/core`, `catalog/` | IntentFrame handling and the pick rule; L1 context counts, frecency and vocabulary ranking (all pure); coverage items for "Why this is better"; multi-field output and issues; locale packs (en, en-IN, Hinglish) with the voice-command grammar; the 10 launch cards, 6 families and the generic card, with sourced claims and goldens; the Agent Brief dialect |
| W2 server platform | `apps/server`, `packages/db` | The 12 tables (Drizzle, PGlite in tests); Supabase JWT auth and guest tokens (ALTCHA, device quota); the age gate; the consent ledger; `/v1/me/*` (profile, consent, memory, library, export, transactional delete); decision rows from `/v1/forge`; usage counters and quotas; `/v1/report`; rate limits |
| W3 app | `apps/app`, `apps/desktop` | The SPA's four places (Capture, Draft sheet, Library, You) and the ⌘K palette; the PWA; first run (DOB → consent → guest brief); privacy controls; Lingui; "Why this is better"; "Report this output"; the frecency tool chip; the receipt with "Did it work?"; voice commands while the sheet is open; the events queue with retry; channel profiles |
| W4 quality gates | root configs, `.github/workflows/rebuild.yml`, `packages/bundle` | G0 (Biome lint, dependency-cruiser boundaries, Knip, CI); G1 (golden eval runner per tool); G-P (privacy canary gate for web and Electron journeys); axe in Playwright; the TUF-lite signed content bundle (build, sign, verify) |
| W5 model gateway | `packages/ai`, `catalog/routes.yaml` | `LlmPort` (understand → IntentFrame, repair) over a routed gateway, with pinned effort and token budgets per function; a terminal refusal; ZDR-only routes; tested with mocked HTTP. It runs live once the owner adds a provider key |

## Lead integration (after merges)
- Wire W5's `LlmPort` into the server's forge when a key is configured. Without one, the deterministic path stays.
- Feed W2's L1 counts, memories and frecency into core's forge deps, and record decision rows.
- Point W3's app at W2's auth, `/v1/me/*` and events.
- Server loads the catalog from W4's signed bundle and refuses an unsigned or expired one.
- Run the full verify: typecheck, all tests, Electron end-to-end, G-P, axe and goldens.

## Needs the owner (not blocking the build)
- A Supabase project (auth and Postgres).
- A model gateway or provider key.
- The STT vendor (S3), for web dictation and desktop cloud fallback. Desktop dictation uses Apple speech now (B20).
- An Apple Developer ID for signing.
- GitHub Actions secrets.
- 10 PWA users by week 6, and the 20–50 user beta.
