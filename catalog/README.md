# catalog

Tool Cards: data that tells `@promptai/core` how to write a brief for one tool (blueprint §6, "Composition"). A card holds no code. Templates are sandboxed Liquid, parameter rules are declarative, and vendor request schemas are JSON Schema. Adding a tool means adding a card, not editing `packages/core`.

```
tools/<id>/card.yaml    one card per target tool (8 today, from spikes/prompt-representation)
families/generic.yaml   the fallback when no tool resolves
```

## Card format

The schema is `CardSchema` in `packages/core/src/compose/card.ts`, and `parseCard(yamlText)` validates a card. The spike's fields are unchanged except that a json field's vendor schema now sits inline (`schema:`), because core reads no files. `forge()` adds these:

| Field | Purpose |
|---|---|
| `family` | Brief IR task family, e.g. `image.generate` |
| `aliases` | Other names people say, plus host-app names and bundle ids. `resolveTool` matches these and `display_name` (without its "(...)" part). The bare `id` matches only a host app, so "move the cursor" doesn't pick Cursor. |
| `insert` | The text field returned as the brief. Defaults to the first required text field. |
| `syntax` | Tool syntax (`flags` = `--x`, `sections` = `[X]`) to neutralize in user free text before rendering. |
| `slots` | The checklist. Each slot has an `id`, `label`, `impact` 1–3, a Brief IR path (`to`), a `default`, up to 6 `options` and an optional `pattern`. A slot the user didn't state becomes an assumption chip. An unstated impact-3 slot with no default becomes a pick chip, and a card may have at most 2 of those. Every slot below impact 3 needs a default. |

The card lint rejects range loops, `include`/`render`/`layout` tags, and templates that read `brief.params` or `brief.tool_params` directly (use `p.*`).

## Changing a card

Bump `version` and `verified_at` when the tool changes, and cite the change in `sources`. Then run:

```bash
pnpm --filter @promptai/core test     # schema, goldens, fuzz, security, forge
UPDATE_GOLDEN=1 pnpm --filter @promptai/core exec vitest run test/compose.golden.test.ts   # after an intended output change; review the diff
```

The `limit_source` values marked "unverified" come from secondary sources, as the spike recorded them.
