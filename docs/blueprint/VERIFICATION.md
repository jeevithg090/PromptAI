# Verification log, wave 1 blueprint

Checked by the lead on 2026-11-10 against the repo, `gh api`, npm, models.dev, the Claude API reference (cached 2026-10-06) and vendor pages fetched the same day.

## Confirmed

| Claim (BLUEPRINT.md) | Check | Result |
|---|---|---|
| `handlers/routes.ts` is 2,623 lines | `wc -l` | 2,623 ✓ |
| BYOK misroutes keys at `routes.ts:863-877` | read lines 855–880 | `createSupervisor` resolves the key, then binds it only to some agents ✓ (location matches; see the wave 1 code map for the misroute detail) |
| `config/model-routing.json` routes to retired Groq models | read the file plus Groq's deprecations page | Every step routes to `llama-3.1-8b-instant` or `llama-3.3-70b-versatile`. Groq shut both down on **2026-08-16** (replacement: `openai/gpt-oss-20b`). models.dev marks both `deprecated` ✓ **The live backend is probably failing today:** `ModelRouter.ts` (29 lines) and `providers/` have no fallback. |
| `004_audit_immutability.sql` pattern exists | `find` | `backend/migrations/004_audit_immutability.sql` ✓ |
| Handy MIT, 38.3k★ | `gh api` | MIT, 38,310★, pushed 2026-11-07 ✓ |
| handy-keys MIT, 36★, last push 2026-08-07 | `gh api` | ✓ |
| uiohook-napi MIT, 244★, last push 2026-03-21 | `gh api` | ✓ |
| Tauri 2.12.5 current, 3.0 in alpha | releases | `tauri-v2.12.5`; `v3.0.0-alpha.6` ✓ |
| Astryx 0.7.12 | `npm view @astryxdesign/core` | 0.7.12 (published 2026-11-10) ✓ |
| Capacitor 8.6, 9.0.0-beta.0 on 2026-10-28 | releases | ✓ |
| PowerSync Apache-2.0 | `gh api` (powersync-service) | Apache-2.0 ✓ (the "since 2026-11-03" date was not re-checked) |
| promptfoo MIT | `gh api` | MIT ✓ |
| Electron `globalShortcut` fires on press only | electronjs.org docs | "called when the registered shortcut is pressed"; no release event ✓ |
| Claude Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10 | models.dev and the Claude API reference | ✓ Haiku 5.5 rises to $0.50/$2.50 beyond 100K-token prompts (not relevant at ~3k tokens) |
| Sonnet 5.5 rejects `thinking: {type:"disabled"}`; use `between_tools` | Claude API reference | ✓ (`between_tools` only at effort `high` or below) |
| Haiku 5.5 adaptive by default, effort default `medium` | Claude API reference | ✓ |
| API version 2026-10-21 rejects `temperature`/`top_p`/`top_k` | Claude API reference | ✓ |
| Soniox real-time $0.12/h | soniox.com/pricing | ✓ (async $0.10/h) |
| AssemblyAI Universal-3.6 Pro Realtime $0.45/h | assemblyai.com/pricing | ✓ |

## Small corrections

- "28 tables": the migrations hold 29 distinct `CREATE TABLE` names. Not material.
- "477 Jest tests" is exact: `npx jest` ran 477 before the routing fix added 2 (479 passing across 60 suites). A grep undercounts because of `.each` cases.
- Haiku 5.5 refusals have **no server-side fallback** (Claude API reference). §6's "provider's own sanctioned fallback" applies only to the Opus/Sonnet routes; a Haiku refusal is terminal.

## Not checked here

Apple's current custom-keyboard microphone rule (marked *unverified* in §5), Fly.io/Railway pricing, Supabase backup windows, and the Supabase OAuth server's CIMD support. They remain marked *unverified* in the blueprint.

---

# Verification log, wave 2 evidence

Checked by the lead on 2026-11-11 against the repo at `HEAD`, the Hugging Face API, the checkers' raw re-run files, Microsoft Learn, Anthropic's Commercial Terms and web search. The two checker agents had already re-run the spikes. This pass checks the claims that change decisions.

## Confirmed

| Claim (EVIDENCE.md) | Check | Result |
|---|---|---|
| S1-mini runs at 171 ms p50 / 254 ms p95 on a quiet M5 | `spikes/_checks/measurement/cleanup/score-main.txt` | Row `s1-mini-8bit-check`: 171 / 254 ms, with accuracy identical to the loaded run (3,112 / 5,460 ms) ✓. The same file shows S1-mini makes **10** meaning errors on the main set against **3** for the regex rules. The guards matter. |
| S1-mini has a custom licence | HF API plus the `LICENSE` file | `license: other`, `s1-mini-license`. The text is Apache-2.0 (a derivative of Qwen3-0.6B) plus one **additional term**: any use or product must keep identifying the model as "S1-mini" by "Superwhisper", in that capitalization ✓. This is an attribution duty, not a use restriction, so B21 is small. |
| Qwen3-Embedding-0.6B is Apache-2.0 | HF API | `apache-2.0`, not gated ✓ |
| Parakeet TDT v3 is CC-BY-4.0 | HF API | `cc-by-4.0` ✓ |
| Nemotron speech-streaming-en carries the NVIDIA Open Model License | HF API | `nvidia-open-model-license` ✓, so §7's licence rule excludes it |
| Nemotron 3.5 ASR streaming is openmdw-1.1 | HF API | `openmdw-1.1` ✓ (terms not read; still needs a licence read) |
| Microsoft removes Phi Silica in January 2027 | [Microsoft Learn](https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica), updated 2026-10-19 | "January 2027 — Aion Instruct rolls out to retail devices and Phi Silica is removed." Insider rollout starts November 2026 ✓ |
| The repo's clarification flow loops | `git show HEAD:web/src/app/build/page.tsx`, `routes.ts` | `build/page.tsx:139` resets `answers` to `{}` on every `clarifying` response, `:98` sends only this round's answers, and `routes.ts:1048-1073` builds the context from client-supplied `clarifications` alone. The mechanism is confirmed ✓. The checker's "page.tsx:136-142" is `build/page.tsx:134-140` at `HEAD`. |
| `MicButton.tsx:53` announces interim text | read the file | Line 53 puts the interim transcript in an `aria-live="polite"` span ✓ (the announcement count of 26 per 28 words was not re-measured) |
| Share links already exist | `ls backend/migrations` | `018_share_links.sql` ✓ |
| "$0.02 cap blocks a frontier draft" | BLUEPRINT lines 180, 279 | The $0.02 is the blueprint's own `forge()` Budget, not repo code ✓ (the $0.0278 Opus draft cost is the economics report's arithmetic, not re-done) |
| App Review rejects auto-insert under 2.4.5 | web search | Developer reports only: [Whisper Notes](https://whispernotes.app/blog/why-whisper-notes-left-mac-app-store) (February 2026) and [WhisperPad via M. Tsai](https://mjtsai.com/blog/2026/06/03/whisperpad-rejected-from-the-mac-app-store/) (April 2026). There is no Apple statement. ✓ as reported enforcement, strength B |

## Corrections

- **Anthropic Commercial Terms D.4** ([terms](https://www.anthropic.com/legal/commercial-terms)) bar accessing the Services "to build a competing product or service, including to train competing AI models". The clause does not mention Outputs. EVIDENCE Part B's "bar training models on Claude outputs" overstates it, though `research/w2-training-pipeline.md` words it correctly and leaves to counsel whether a private cleanup student "competes". The blueprint says "may bar; counsel decides" and keeps the safe default (an Apache-2.0 open-weight teacher).
- **S1-mini licence.** "Custom licence" is accurate, but the only extra duty is naming. The blueprint states that plainly.

## Not checked here

- Carbon `RegisterEventHotKey` press and release with no permission prompt (no physical key was pressed; S2 tests it).
- The iOS keyboard-extension microphone rule (forum report).
- Supabase OAuth CIMD and DCR support.
- EU DSA duties for share links.
- The TanStack supply-chain incident.
- Aion Instruct's capabilities.
- Every latency the checkers did not re-run: Electron runtime, Apple streaming, Next.js hot reload, Expo vs Vite startup.
