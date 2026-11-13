# PromptAI blueprint

**Status: approved by the owner on 2026-11-11, with every Appendix B default (B1–B24).** Phase 0 is next. No code has been built for it yet. The only repo change from this work so far is the Groq routing fix in commit `38c86ea`, which is not yet deployed.

| File | What it holds |
|---|---|
| [BLUEPRINT.md](BLUEPRINT.md) | The architecture, revised with the wave 2 evidence. §19 is the roadmap; Appendix B lists the owner's decisions (B1–B24) |
| [EVIDENCE.md](EVIDENCE.md) | Wave 2: 17 prototypes, 10 research reports and two checker passes, each graded A/B/C; the dictation and on-device tables; the 10 decisions the evidence settles; what is still unproven |
| [VERIFICATION.md](VERIFICATION.md) | The lead's spot checks and corrections for both waves |
| [research/](research/) | The 30 research reports the blueprint cites as `research/…` |

The blueprint and evidence also cite `spikes/…` and `current/…`. Those live in `/Users/gangadhara/Documents/PromptAI/blueprint-work/`, outside the repo, for two reasons:
- **Size.** They hold 47 GB of prototypes, models and test audio.
- **Licensing.** The macOS TTS clips must stay out of public repos under Apple's voice licence.

## Progress (2026-11-13)

- **Fix-now list (§18):** done and merged into `main` (PR #12). It isn't deployed: the repo has no GitHub Actions secrets (`DATABASE_URL`, AWS keys).
- **S6 (idempotency):** done in `apps/server/test/s6-idempotency.test.ts`.
  - 10,000 distinct interleavings; every event stored exactly once.
  - Concurrent reconnect: 2 × 1,000 events, 0 drops, 0 duplicates.
  - The negative control reproduces the old loss (250 of 2,000 events).
- **Thin slice (week 4):** built ahead of schedule on branch `phase-0/rebuild`, on Electron (B1 changed 2026-11-13).
  - `packages/contract`, `packages/core` (the forge pipeline, Brief IR, card renderer, cleanup and grounding), `catalog/`, `apps/server`, `apps/native-macos` (`pf-native`), `apps/app` (Astryx panel) and `apps/desktop` (Electron).
  - All type checks and 315 tests pass.
  - An Electron end-to-end test runs dictation → real server and core → Insert, with only `pf-native` faked.
- **Not yet verified by a person:** a physical ⌃⌥Space hold, the microphone prompt, and ⌘V into a real app (steps in `apps/native-macos`).
- **Waiting on the owner:** S2 hardware checks, S3 (vendor keys), S4 (gateway key), S5 (labelled ideas and a second rater), S7 (participants), S1's Safari/iOS pass, and an LLM provider key for `understand` and repair.

## Build plan: how to start

The full plan is in BLUEPRINT §19. To start it once the blueprint is approved:

### Before week 0 (owner)

1. **Approve or amend the blueprint and Appendix B.** Done 2026-11-11: every default approved. These were the decisions that blocked Phase 0:
   - B1 (desktop shell)
   - B5 (STT vendor criteria)
   - B18 (named desktop owner)
   - B23 (enable Apple Intelligence on the test Mac)
   - B24 (toolchain; changed with B1)
   - B1 was changed to Electron on 2026-11-13
   - Adding Astryx as a dependency (`@astryxdesign/core`, a theme, `@stylexjs/stylex`), which `CLAUDE.md` says needs confirmation first.
2. **Deploy `38c86ea` and run the live smoke test.** Put `GROQ_API_KEY` in `backend/.env`, then `cd backend && npm run smoke`. Until then the production routes still call retired Groq models.
3. **Licence read.** Counsel reads the Nemotron 3.5 (openmdw-1.1), S1-mini (naming term) and Apple-voice terms.

### Phase 0 (weeks 0–2): the fix-now list (§18) plus seven spikes

| Spike | Settles | Passes when | Needs |
|---|---|---|---|
| S1 Astryx on every webview | the one-bundle bet | popovers anchor, 0 serious axe issues, touch targets ≥44 px, template checks | Astryx dependency approved; Safari 26, iOS 18, macOS 14/15/26 WKWebView, WebView2 |
| S2 hotkey → STT → paste | the Electron shell's capabilities (B1) | ≥98% of 200 insertions correct per app; ≤700 ms p50; Carbon key-up with physical keys; `phys_footprint`; notarized build within a day | Xcode Command Line Tools, Developer ID, the Accessibility grant, the desktop owner |
| S3 STT bake-off | the vendor (B5) | passes every privacy criterion; lowest en-IN and Hinglish WER; ranked on effective $ per hour | vendor trial keys; 50 en-IN/Hinglish and 100 Indic consented clips |
| S4 compose models | `routes.yaml` and per-tier caps | the owner's pick, with TTFT and cost per tier | gateway key |
| S5 `understand` | IntentFrame calibration and slot grounding | macro-F1 ≥0.9; calibration rises with each confidence level; holds on paraphrased slots with a second rater | 150 labelled ideas, a second rater |
| S6 REST idempotency | the no-sync design | 10k interleavings converge; concurrent reconnect (two devices, 1,000 operations each) drops 0 writes | — |
| S7 concierge test | the Draft sheet | people catch or flip assumptions more than with polish-only dictation | 5–8 people from three segments |

**Phase 0 is done when:** an hourly production smoke draft passes for 7 days, the BYOK test passes, and every spike above has a pass/fail verdict.

After Phase 0 the plan continues with the week-4 thin slice (one Mac: hotkey → STT → forge → paste) and then Phase 1, the MVP on macOS and the PWA (§19).
