# catalog

Tool Cards: data that tells `@promptai/core` how to write a brief for one tool (blueprint §6, "Composition"). A card holds no code. Templates are sandboxed Liquid, parameter rules are declarative, and vendor request schemas are JSON Schema. Adding a tool means adding a card, not editing `packages/core`.

```
tools/<id>/card.yaml      one card per target tool: the 10 launch tools plus flux3, gemini-omni-video, github-issue, suno
tools/<id>/evals.yaml     golden cases for the card (W4's runner reads them)
families/<name>.yaml      family cards for tools with no card of their own: chat, code, image, writing.email, writing.doc, search, plus generic
families/<name>.evals.yaml
sources/<id>/<page>.txt   cached vendor text: only the paragraphs a claim quotes, verbatim
locales/<bcp47>/pack.yaml locale packs: fillers, replacements, number words, the voice-command grammar
```

`routes.yaml` belongs to the model gateway (W5) and is not here.

## Card format

The schema is `CardSchema` in `packages/core/src/compose/card.ts`, and `parseCard(yamlText)` validates a card. Beyond the spike's fields:

| Field | Purpose |
|---|---|
| `family` | Brief IR task family, e.g. `image.generate` |
| `audience` | Who reads the inserted text: `private_ai`, `human_recipient` (Gmail) or `shared_doc` (Docs, Notion). For the last two, only style and preference memories reach `understand`, and no memory is written into the text (blueprint §10, destination rule). |
| `verified_at`, `review_by` | When the claims were checked, and when to check them again. |
| `claims` | Facts the card relies on: `id`, `text`, a `quote` that must be a literal substring of the cached copy of `source` (one of the card's `sources`), optional `valid_from`, `valid_to`, `review_by`. |
| `tos.insert_allowed` | Whether pasting into the tool is allowed. When false, forge adds an `insert_not_allowed` issue. Core never submits either way. |
| `aliases` | Other names people say, plus host-app names and bundle ids. `resolveTool` matches these and `display_name` (without its "(...)" part). The bare `id` matches only a host app, so "move the cursor" doesn't pick Cursor. |
| `match_display_name` | `false` when the display name is an everyday word ("Email", "Notion"): then only aliases match the words. Every family card sets it. |
| `insert` | The text field returned as the brief. Defaults to the first required text field. |
| `fields[].label` | A labelled field is insertable and appears in the response's `fields`. If any field has a label, the insert field needs one. |
| `syntax` | Tool syntax (`flags` = `--x`, `sections` = `[X]`) to neutralize in user free text before rendering. |
| `slots` | The checklist. Each slot has an `id`, `label`, `impact` 1–3, a Brief IR path (`to`), a `default`, up to 6 `options` and an optional `pattern`. A slot the user didn't state becomes an assumption chip. It becomes a pick chip when its impact is 3, its confidence is low and no count or memory backs it: at most 2 per draft (forge enforces it; the lint allows at most 2 impact-3 slots without a default). Every slot below impact 3 needs a default. |
| `requires[]` | Content the target must have, with an `id` and `label`, so it is a checklist item in `coverage.items` too. |

The card lint rejects range loops, `include`/`render`/`layout` tags, and templates that read `brief.params` or `brief.tool_params` directly (use `p.*`).

## The Agent Brief dialect

For agent targets (Claude Code, Cursor's agent, and the `code` family for agents without a card), the brief is an Agent Brief: **Goal**, allowed **Scope** (named files), **Constraints**, forbidden actions (**Do not**), **Done when** (a pass/fail check), **Stop and ask before**, and, for Claude Code and the family, a request for evidence (the commands run and their output). It is prefilled and never submitted; the agent's own approvals decide what runs.

## Sources

Each `sources/<id>/<page>.txt` starts with `source: <url>` (plus `fetched_from:` when a Markdown or API copy was fetched), `fetched:` and `---`, then the quoted paragraphs verbatim. Pages were fetched with curl after checking robots.txt; Midjourney's help pages sit behind a bot wall, so they come from the help center's article API. A test fails when a quote is not a literal substring of its cached page, or a cached page is not cited.

## evals.yaml

```yaml
- name: string
  input: <ForgeRequest>
  expect: { toolId?: string, briefIncludes?: [string], briefExcludes?: [string], noUnsourced?: boolean, maxIssues?: { block: 0 } }
```

Launch tools have 3–5 cases each. `packages/core/test/catalog.test.ts` runs every case through forge without an LLM, so a case that fails on the deterministic path fails the build.

## Locale packs

`parseLocalePack(yamlText)` validates a pack; `cleanTranscript(text, locale, pack)` applies its fillers, replacements, number words (only before a scale word: "paanch lakh" becomes 5,00,000) and digit grouping; `matchVoiceCommand(text, pack)` reads its command grammar. Phrases use words, `[a|b]` for an optional group, and `{x}` (refine only) for the words the instruction keeps. Anything unmatched returns null, and the caller treats it as a Refine instruction.

## Changing a card

Bump `version` and `verified_at` when the tool changes, cite the change in `sources`, cache the quoted paragraph, and add or update its claim. Then run:

```bash
pnpm --filter @promptai/core test     # schema, claims, evals, goldens, fuzz, security, forge
UPDATE_GOLDEN=1 pnpm --filter @promptai/core exec vitest run test/compose.golden.test.ts   # after an intended output change; review the diff
```

The `limit_source` values marked "unverified" come from secondary sources, as the spike recorded them.
