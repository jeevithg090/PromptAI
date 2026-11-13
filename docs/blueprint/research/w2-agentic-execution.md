# Act versus hand off: agentic execution (wave 2)

Lens: when should PromptAI do the task instead of handing a prompt to another tool? Written 2026-11-10 against the final `BLUEPRINT.md`, from primary pages fetched today, `gh api`, and the spike `blueprint-work/spikes/w2-act-or-handoff/` (timings are medians of two runs on an M5 shared with about 30 agents; no LLM calls).

## Bottom line

- **The blueprint's "not an executor" stance is right for MVP but too absolute later.** The evidence supports a narrow middle: **act only through typed channels (MCP, App Intents, AppFunctions, official APIs), only up to a reversible state, with a preview of the exact payload.** Google ships this pattern itself: its Gmail MCP server has `create_draft` and no send tool.
- **Never build our own pixel or DOM agent.** The best GUI agents now beat the OSWorld human baseline (85–86% self-reported vs 72.36%). That still leaves about 1 failed task in 7, at 36–100× the token cost of a typed call in the spike. OpenAI says prompt injection is "unlikely to ever be fully 'solved'". For GUI-only work PromptAI **delegates** an Agent Brief to the user's own agent (Claude in Chrome, ChatGPT, Codex, Cursor), whose approval UI governs.
- **The decision rule is a pure function.** **Hand off** by default: AI-tool targets, GUI-only targets, anything irreversible, or an unsettled intent. **Act with approval** for typed state changes and anything that reaches other people. **Act autonomously** only for typed reads, and for private reversible drafts once the user has earned trust on that recipe and opted in.
- **The hooks to add now cost about a week** (estimate): an `Action` type, a `handoff` block on Tool Cards, `decideExecution()` in core, undo fields on receipts, provenance on Brief slots, and an Agent Brief rendering. Without them, execution later means re-plumbing the Brief, receipts and learning loop.

## 1. Starting point

`BLUEPRINT.md` says PromptAI is not "an executor" or "an auto-submitter" (§1), Insert "never submits" (§3), an MCP client comes "only with CaMeL-lite" in Phase 3 (§11, §19), and the request path has no tools or egress (§13). `contrarian.md` concludes "Route to executors; do not become one." This report keeps those choices and adds 2026 evidence, a measured cost per observation, a codeable rule, and hooks.

## 2. State of execution, November 2026

| Area | Fact | Source / confidence |
|---|---|---|
| GUI capability | OSWorld-Verified top entries: Qwen3.8-Max 86.1%, Claude Mythos Preview 85.4%, Mythos 5 and Fable 5 85.0%, Opus 4.8 83.4%. Human baseline 72.36%. | Steel leaderboard, updated 2026-10-11. **Self-reported** |
| Web tasks | Online-Mind2Web tops of 90–97% use custom or unstated judges. The one row with both judges shows the gap: Yutori Navigator scores 78.7% by humans and 64.7% by WebJudge. | Steel leaderboard. **Self-reported, not comparable** |
| Consistency | τ-bench introduced pass^k because agents are inconsistent: gpt-4o pass^8 was below 25% in retail. | arXiv 2406.12045 |
| Silent failure | Anthropic: Claude "sometimes acts as if its actions succeeded without explicitly checking their results". OpenAI says to check the actual outcome, not the model's final answer. | Vendor docs |
| Injection, vendor-measured | Claude in Chrome went GA on 2026-08-26 on every paid plan. Attack success was 17.6% (Opus 4.5) and 3.8% (Opus 5) before added safeguards. With probes plus a safety classifier it was 0% for Sonnet 5, Opus 5 and Mythos 5, and 0.3% for Fable 5. Auto-approval of actions the classifier judges safe is **on by default**; a manual mode exists. | claude.com, primary, re-checked today |
| Injection, adaptive | "The Attacker Moves Second" bypassed 12 published defenses, most at above 90% success. | arXiv 2510.09023 |
| Design rule | Meta's **Agents Rule of Two**: in one session, an agent should hold at most two of (A) untrusted input, (B) access to private data or systems, (C) the ability to change state or communicate externally. | ai.meta.com |
| Vendor APIs | All three labs return actions for *your* code to execute. Gemini returns `safety_decision: require_confirmation`, with default policies for payments, communication, account creation and legal terms. OpenAI says to "confirm at the point of risk". Anthropic recommends a VM, a domain allowlist and human confirmation. | Vendor docs, primary |
| Typed channels | Google Workspace MCP servers are a **Developer Preview**. Gmail has `create_draft` and **no send** ("review and send it from Gmail"). Calendar has `create/update/delete_event`, Chat has `send_message`, Docs has `update_doc`. Cursor prompt deeplinks "never trigger automatic execution" (10,000-character maximum). Android AppFunctions is an experimental preview. | developers.google.com (re-checked today), cursor.com, developer.android.com |
| Protocol | MCP 2026-07-28: there "SHOULD always be a human in the loop with the ability to deny tool invocations", and clients "MUST consider tool annotations to be untrusted unless they come from trusted servers". | modelcontextprotocol.io, primary |
| Hosts | Execution now lives in the hosts. Claude in Chrome is GA. Gemini computer use covers browser, mobile and desktop. OpenAI launched **ChatGPT Work**, a long-running agent mode across connected apps, on 2026-07-09. | ChatGPT Work: SiliconANGLE, Bloomberg Government; OpenAI's own post **not fetched** |

Capability is rising fast; the risk has not changed shape. Labs with red teams still ship confirmation at the point of risk.

## 3. Spike: what one observation costs

`src/measure.mjs` loaded 7 public pages at 1280×720 in headless Chromium (Playwright 1.65.0). For each page it measured a screenshot and Playwright's AI-mode accessibility snapshot, the format Playwright MCP feeds models. It then replayed a recorded 5-action "fill a draft and save it" script 30 times on a local fixture. Tokens use o200k_base as a **proxy** for Claude's tokenizer. Screenshot tokens use Anthropic's formula, ⌈w/28⌉×⌈h/28⌉.

| Measure | Result (run 1 / run 2) |
|---|---|
| Screenshot, any page | **1,196 tokens** (set by viewport); capture 34–230 ms |
| AI accessibility snapshot | 553 (simple form) to 56,817 / 86,487 (Wikipedia); **median 20,074 / 22,414**, or **17–19× a screenshot** |
| Deterministic replay, 5 actions | median **76 / 104 ms**, p90 120 / 261 ms |
| One local observe step (screenshot + snapshot) | 37 / 36 ms |

`src/cost-model.mjs` converts these into cost per task on Claude Sonnet 5.5 ($2 per MTok input, $10 output), with the documented toolset overheads (about 4,520 tokens for computer use, 6,610 for the browser toolset). Its assumptions are labelled in code: 1,500 context tokens, 120 output tokens per step, keep the last 3 screenshots or the last snapshot.

| Path | 20-step task |
|---|---|
| Vision computer use | 211k input tokens, **$0.45** ($0.22 best-case cached) |
| Browser accessibility-snapshot loop | 586–633k tokens, **$1.20–1.29** (upper estimate; real tools prune) |
| Typed MCP call, model fills the arguments | 4.3k tokens, **$0.0125** |
| Typed MCP call mapped deterministically from the Brief | **$0**, plus one API round trip |

Three findings:

1. **"DOM is cheaper than vision" is not reliably true.** On content-heavy pages a snapshot costs 6–72× a screenshot; only small forms were cheaper.
2. **The model is the bottleneck.** Replay takes about 0.1 s and an observation 36 ms; at an assumed (not measured) 2–5 s per model turn, 20 steps take 40–100 s.
3. **PromptAI already holds a structured Brief.** With a typed tool, execution can be a deterministic mapping with no model in the loop: 36–100× cheaper than a GUI loop and close to deterministic, which is what autonomy needs.

## 4. Options

| | A. Hand off only (blueprint MVP) | B. Own GUI agent (Browser Use / Stagehand / Playwright MCP + a CUA model) | C. Typed execution via target MCP / APIs | **D. Draft-to-tool + delegate (non-obvious)** |
|---|---|---|---|---|
| What it does | Writes the brief; insert, copy or prefill; never submits | Clicks and types in a browser or VM for the user | Calls target tools with preview and approve | Acts only up to the target's **native draft state** through typed channels; for everything else, compiles an **Agent Brief** for the user's host agent |
| User value | Medium | Highest in theory | High for connected apps | High: finished drafts in Gmail, Docs and Notion, plus better-specified agent runs |
| Reliability | n/a (the user acts) | About 1 in 7 tasks fail, some silently | Near-deterministic | Near-deterministic; the host owns GUI reliability |
| Safety | The lethal trifecta cannot form | Trifecta by construction; needs a VM, classifiers and red teaming | Rule of Two manageable with taint plus approval | As C, and drafts are private and reversible; the user's own click in the tool is the final approval |
| Cost per task | ≈$0 | $0.2–3+ (spike) | ≈$0–0.01 | ≈$0–0.01 |
| Build for 1–3 engineers | Done | Large, plus permanent safety upkeep | Medium: OAuth, MCP client, effect classes per tool | Medium: C limited to draft tools, plus one rendering |
| Fit with blueprint | Exact | Contradicts §1 and §13 | Needs CaMeL-lite (Phase 3) | Keeps "never submits": PromptAI never sends or publishes |

**Recommendation: D, phased.** Ship A in Phase 1 with the hooks in §7. In Phase 3, when CaMeL-lite and the MCP client arrive, add C restricted to read and draft tools. Approval-gated writes and messages to other people come after that. **B is avoid**: it is the labs' business, it fails silently, and it is the one path where a 1–3 person team cannot keep up with the safety work. D's non-obvious insight is that **the target app's draft is the best approval UI**. It is native and familiar, syncs to the user's phone, already has undo, and means PromptAI never holds "send" rights at all.

## 5. The decision rule

`decide()` in `spikes/w2-act-or-handoff/src/decide.ts` is a pure function over facts PromptAI already holds at hand-off time. Its 30-case table passes (`bun src/decide.test.ts`: 10 hand off, 2 delegate, 14 approve, 4 autonomous); the table is a spec, not evidence. Rules are checked in order:

1. **Irreversible effect** (payment, purchase, hard delete, legal acceptance, credentials, account or security settings) → **hand off**. The user does it in the tool, as Gemini's default policies and every vendor's guidance agree.
2. **Intent confidence below 0.8** (from the Ask Gate) → **hand off**, or ask. Never act on a guess.
3. **Prefill channel** (ChatGPT, Claude, Midjourney, a Cursor deeplink, the insertion ladder) → **hand off**. For AI tools the prompt *is* the deliverable.
4. **Host-agent channel** (Claude in Chrome, ChatGPT Work, Codex, Cursor agent) → **delegate** an Agent Brief, prefilled and never auto-submitted. The host's approvals govern.
5. **GUI-only channel** → **hand off**, or delegate if the user has a host agent. PromptAI never runs its own pixel agent.
6. **Typed read** → **act autonomously**, unless the context is tainted *and* the data is private (Rule of Two A+B), in which case **approve**.
7. **Typed state change with no verified undo** → **act with approval**.
8. **Typed communication** (send, post, invite, share, publish; any card with `audience: human_recipient` or `shared_doc`) → **act with approval every time**, showing the exact payload. Earned trust never makes this autonomous.
9. **Any argument derived from tainted content** (inbound email, a web page, someone else's document) → **act with approval** (Rule of Two A+C), with the tainted spans highlighted.
10. **Private reversible draft** (Gmail draft, Docs suggestion, private Notion page, draft PR) → **act autonomously** only after **≥5 approvals without edits and 0 undos** for that user × recipe × target, plus an explicit opt-in. The first undo revokes autonomy. Reversible writes to non-sensitive data follow the same rule; sensitive writes stay with approval.
11. Anything else → **act with approval**.

In short: **write the prompt** when PromptAI's output is the user's input to another tool or agent, or the action cannot be undone. **Act with approval** when a typed channel can show the effect exactly, or it reaches other people. **Act autonomously** only for reads and private drafts, untainted, after the user has kept this recipe's drafts as-is.

The thresholds (0.8, 5, 0) are starting values in the signed policy bundle, tuned on receipts, and **never** bandit arms: safety gates are not explored.

## 6. Trust model: preview, approve, undo

- **Preview** shows the exact operation and arguments, not a summary: "Gmail · create_draft · to: 3 people · subject … · body", each argument inked by provenance (user words, memory, inferred, tainted source) as the Draft sheet already does. Approval is per action at the point of risk, never blanket session consent.
- **Approve** is one tap in the Draft sheet; in MCP hosts, an `input_required` form retried with the signed `requestState`. For communication the button names the effect ("Send to 3 people"). Approvals expire, and expiry cancels: assume-and-show must **not** apply to side effects.
- **Undo** has three kinds, stored on the receipt with an undo-until time: delete the native draft, run the inverse (`delete_event` for `create_event`), or restore a version. No undo path means approval (rule 7). An undo revokes earned autonomy and is a negative label, as in `prediction.md`.
- **Least privilege.** OAuth scopes per Tool Card channel; never a send scope when a draft scope will do; tokens in `PlatformPort.secrets` where possible.
- **Our own effect classes.** The catalog classifies each remote tool's effect. MCP `readOnlyHint` and `destructiveHint` are inputs, never authority, since the spec calls annotations untrusted.
- **Controls:** "Pause actions", per-target disconnect, an action log in Library, rate limits, and the G-P canary on action payloads.

## 7. Architecture hooks to add now (Phase 1, no execution shipped)

1. **`Action` type in `packages/core`**: `{id, toolCardId, channel, op, args, effect, undo:{kind, until}, provenance per arg, idempotencyKey, expiresAt}`. The MVP Insert is just `Action{channel:'prefill', effect:'draft'}`, so every hand-off already flows through one object.
2. **A `handoff:` block on Tool Cards**, next to `tos.insert_allowed` and `audience`. It lists channels in preference order: `prefill` (deeplink template, maximum length), `typed` (MCP server URL, tool names, **our** effect class per tool, the draft-equivalent of each sending tool) and `host_agent` (which agent, its Agent Brief dialect). Data can be empty at launch; the schema should exist.
3. **`decideExecution()` in core**, returning only `handoff` in Phase 1, with thresholds from the signed policy bundle. Log each call as a decision row (the blueprint already records decisions), so Phase 3 starts with data.
4. **Generalise `PlatformPort.insert()`** into a `Handoff` port: `insert | prefill | copyOpen | (later) typedCall | delegate`. Add `drafted | delegated | failed` to the existing `inserted | pasted | copied | declined` results.
5. **Receipt fields** next to "Did it work?": `actionId`, `outcome`, `undoKind`, `undoUntil`, `undone`, `approvedWithEdits`. These feed the earned-trust counter.
6. **Provenance on Brief slots** (user, memory, inferred, or external with source). The Draft sheet already inks these differently; a typed field is cheap now, and CaMeL-lite needs it.
7. **An Agent Brief rendering**: goal, acceptance criteria, allowed scope, stop-and-ask points and forbidden actions. As a Tool Card template for Claude in Chrome, ChatGPT Work, Codex and Cursor, it already earns its keep in Phase 1.
8. **Server boundary.** No tools or egress on the request path (§13). A future executor is a separate pg-boss job under `ROLE=worker` with its own credentials, never inside `forge()`.

**Not now:** an MCP client, OAuth to third-party tools, browser automation, VM sandboxes, or autonomy settings in the UI.

**Phasing.** Phase 1: hooks and Agent Briefs. Phase 3, with CaMeL-lite and the MCP client: Gmail `create_draft`, Docs `update_doc` (whether it can write in suggestion mode is **unverified**), private Notion pages and Calendar holds, all with approval; then earned autonomy for drafts. Later: communication with approval, AppFunctions and App Intents on mobile, and Workspace servers once they leave preview.

## 8. Risks

- **Preview services churn.** Google Workspace MCP and Android AppFunctions are previews. Tool Card `verified_at` and the nightly `routes-check` job must cover action channels too.
- **Approval fatigue** makes approvals rubber stamps. Keep them rare and specific, and let the target's native draft carry most of them.
- **Taint gaps** (memory derived from an inbound email) could let a tainted argument reach an autonomous draft. Make memory provenance sticky; treat unknown provenance as tainted.
- **Host agents change their approval rules.** Claude in Chrome auto-approves by default, and a delegated Agent Brief inherits that, so PromptAI must say "your agent will act" plainly.
- **Scope creep toward B.** Hold the line with an ADR: no in-house GUI agent without a dedicated security owner.
- **Measurement limits.** Tokenizer proxy, assumed step counts and pruning, no model latency measured, shared machine; leaderboard figures are self-reported.

## 9. Open-source options

| Project | License | Activity (gh api, 2026-11-10) | Role | Verdict |
|---|---|---|---|---|
| modelcontextprotocol/typescript-sdk | Apache-2.0 (new code; MIT for unrelicensed older code; GitHub reports NOASSERTION) | 13.7k★, pushed today | Phase 3 MCP client for typed channels | adopt (Phase 3) |
| microsoft/playwright-mcp | Apache-2.0 | 39.5k★, today | Internal evals and QA of hand-off flows; "not a security boundary" | trial (dev only) |
| browserbase/stagehand | MIT | 26.0k★, today | Code-plus-AI browser steps, if B is ever reopened | assess |
| browser-use/browser-use | MIT | 120.6k★, today | GUI agent framework | avoid (as product core) |
| Skyvern-AI/skyvern | AGPL-3.0 | 23.4k★, today | Workflow browser agent | avoid (AGPL, B path) |
| ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | 55.1k★, today | Debugging the extension | assess (dev) |
| vercel-labs/agent-browser | Apache-2.0 | 49.1k★, today | Agent-oriented browser CLI | assess (dev) |
| trycua/cua | MIT | 32.1k★, today | VM sandboxes for computer-use agents | avoid |
| bytedance/UI-TARS-desktop | Apache-2.0 | **archived** | Desktop GUI agent | avoid |

## Sources

- https://claude.com/blog/claude-in-chrome-generally-available
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- https://platform.claude.com/docs/en/about-claude/pricing
- https://developers.openai.com/api/docs/guides/tools-computer-use
- https://aistudio.google.com/docs/computer-use
- https://developers.google.com/workspace/guides/configure-mcp-servers
- https://cursor.com/docs/reference/deeplinks
- https://developer.android.com/ai/appfunctions
- https://android-developers.googleblog.com/2026/05/android-ai-intelligence-system.html
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- https://developers.notion.com/docs/mcp
- https://leaderboard.steel.dev/leaderboards/osworld.md
- https://leaderboard.steel.dev/leaderboards/online-mind2web.md
- https://arxiv.org/abs/2406.12045 (τ-bench, pass^k)
- https://arxiv.org/abs/2510.09023 (The Attacker Moves Second)
- https://ai.meta.com/blog/practical-ai-agent-security/ (Agents Rule of Two)
- https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/
- https://techcrunch.com/2025/12/22/openai-says-ai-browsers-may-always-be-vulnerable-to-prompt-injection-attacks/
- https://siliconangle.com/?p=787802 (ChatGPT Work launch, 2026-07-09; secondary)
- https://news.bgov.com/artificial-intelligence/openai-unveils-chatgpt-work-agent-to-field-tasks-for-hours (secondary)
- https://github.com/microsoft/playwright-mcp
- https://docs.stagehand.dev/
- Spike: /Users/gangadhara/Documents/PromptAI/blueprint-work/spikes/w2-act-or-handoff/ (README, `src/`, `results/`)
