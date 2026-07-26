# Release-Readiness Verification Sweep — 2026-07-11 (F0.2)

Every surface re-proven with its own definition of green on this machine. Red rows were fixed in-task and re-run green.

## Check matrix

| Surface | Check | Result | Notes / fix |
|---|---|---|---|
| backend | `npm run typecheck` | ✅ clean | — |
| backend | `npm test` | ✅ **44 suites / 328 tests** | Includes F0.1 fixes + 2 new regression tests |
| backend | migration idempotency (static) | ✅ | All 26 `create table` use `if not exists`; 18 migration files; live twice-run deferred to F0.3 (needs live `DATABASE_URL`) |
| web | `npx tsc --noEmit` | ✅ clean | — |
| web | `npm run build` | ✅ **12 static pages** | Next 16, `output:'export'` → static `out/` (dropped `next-on-pages`; Next 16 incompatible — see memory). Deploy script is `npm run deploy` (wrangler pages), not `pages:build`. |
| extension | `npx tsc --noEmit` | ✅ clean | — |
| extension | `npx vitest run` | ✅ 7 tests | — |
| extension | `npm run build` | ✅ | `dist/` (manifest + background.js + content.js + icons) |
| firefox-extension | `npm run build` | ✅ (after `npm install`) | node_modules were missing |
| firefox-extension | `npm run typecheck` | ✅ (**FIXED**) | Was RED: 3 errors. Fixes: added `@types/firefox-webext-browser` + `types` in tsconfig (the `browser` global); rewrote the placeholder overlay to render JSX instead of returning an `HTMLElement` to `root.render`; relaxed `handleApiRequest` param from `ExtensionMessage & {type:'API_REQUEST'}` to `ExtensionMessage` (string field doesn't narrow to the literal). |
| admin | `npx tsc --noEmit` | ✅ clean | — |
| admin | `npm test` | ✅ 3 auth tests | Unauthed + non-Bearer + invalid-token all rejected |
| macos | `swift build` | ✅ clean | No Swift 6 concurrency breakage on this build (the F0.2 concern didn't materialize) |
| macos-sdk | `swift build` | ✅ clean | — |
| CI | 4 workflow YAMLs parse | ✅ | ci.yml, crawl-pkb.yml, deploy-prod.yml, rollback-prod.yml |
| CI | dependabot present | ✅ | `.github/dependabot.yml` |

## Reds found & fixed this pass

1. **firefox-extension typecheck (3 errors)** — fixed as above. Build was always green (Vite doesn't typecheck); the errors were latent. Now `npm run typecheck` exits 0.
2. **firefox-extension missing node_modules** — `npm install` run.

## Follow-ups filed (not blocking F0.2)

- **firefox-extension has no CI job** — `ci.yml` only gates `backend/`. Adding web/extension/firefox/admin jobs is a CI-hardening follow-up (owner: F0.4 / infra).
- **extension icons** are known to be placeholder-sized; real icons are a design follow-up (unrelated to build).
- **admin has no CI job** either — same follow-up as above.
- **Live migration idempotency + deployed-Lambda currency** — deferred to F0.3 (needs live credentials + a deploy).
- **macos** menu-bar app builds but its global hotkey is unimplemented — that's F1.4's Swift half.

## Verdict

All local surfaces green. Nothing blocks proceeding to F0.3 (live E2E) or F1 feature work.
