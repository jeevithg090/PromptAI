# PromptAI — Claude Code guidance

Two external references apply to **every** task in this repo. Follow both.

1. **Karpathy coding guidelines** — how to work (all code, every task).
2. **Astryx design system** — what to build UI with (any UI work).

---

## 1. Coding behavior — Karpathy guidelines

Source: https://github.com/multica-ai/andrej-karpathy-skills (MIT). Copied verbatim below; re-sync from upstream `CLAUDE.md` if it changes.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## 2. UI — Astryx design system

Source: https://github.com/meta/astryx (MIT) · Docs: https://astryx.atmeta.com · Agent index: https://astryx.atmeta.com/llms.txt

Astryx is Meta's open-source React 19 + StyleX design system (150+ accessible components, themes, dark mode, page templates). It is built to be read by agents through its CLI.

**Before writing or changing any UI** (`web/` is Next.js 16 + React 19 + Tailwind v4; `extension/` is React 19 + Vite), look it up in Astryx first:

```bash
npx @astryxdesign/cli search "<what you need>"   # components, hooks, docs, templates, themes
npx @astryxdesign/cli component <Name>           # props, variants, examples
npx @astryxdesign/cli component --list           # every component
npx @astryxdesign/cli docs <topic>               # reference docs (run `docs` alone to list topics)
npx @astryxdesign/cli template --list            # page/block templates
```

Rules:
- Always use the scoped name `@astryxdesign/cli`. Bare `npx astryx` is an unrelated npm package.
- Astryx is **not installed** in any app yet. Adding it (`@astryxdesign/core`, a `@astryxdesign/theme-*`, `@stylexjs/stylex`, `-D @astryxdesign/cli`) is a dependency change — confirm with the user first.
- Don't migrate existing screens to Astryx unless asked (see Surgical Changes). Astryx accepts `className` overrides, so it coexists with the existing Tailwind styles.
- Remote MCP server (not configured here): `https://astryx.atmeta.com/mcp`.
