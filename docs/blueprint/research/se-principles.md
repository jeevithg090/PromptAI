# Software-engineering foundation for PromptAI

Lens: the engineering base that keeps PromptAI adaptable rather than hardcoded. Facts were checked on 2026-11-10. This session's web-search budget ran out (it is shared across agents), so the evidence comes from fetching primary docs directly and from `gh api` checks of every recommended repository.

## Bottom line

Build PromptAI as a **hexagonal modular monolith with a portable core**: one pnpm + Turborepo monorepo, one deployable server image, thin client shells, and a pure-TypeScript `core` that runs the same way in the browser, the Tauri and Capacitor webviews, the extension, the MCP server and the server. Anything that changes often (tools, models, playbooks, flags, routing) is **schema-validated data on its own release train**. It is not code. Boundaries are enforced by **dependency-cruiser** in CI rather than by a README sentence. The product's real test suite is **evals** (promptfoo), run as a gate like unit tests.

## 1. What the current repo gets right and wrong

| Item (evidence) | Verdict |
|---|---|
| "Config over code": `ModelRouter.ts` validates `model-routing.json` with Zod | **Keep and generalise** into the catalog (section 3) |
| Privacy by construction (`*_ciphertext`, content never logged); safety fails closed | **Keep**, and make both CI-tested |
| Numbered forward-only migrations, run before deploy (expand/contract) | **Keep**, and add a migration lint |
| Staging → manual promotion of an immutable version → alias rollback | **Keep the pattern** whatever the host |
| README: "handlers → services → agents/guardrails → utils/types. Never backwards." | **Unenforced and already broken.** 11 agent files import `../services/*`, and `ContentSafetyClassifier.ts` imports `AuditService`. Unchecked rules decay. |
| `handlers/routes.ts`: 2,623 lines, about 92 routes | **Change** to feature modules on `@hono/zod-openapi` |
| `web/src/lib/api-types.ts`: 299 hand-mirrored lines | **Drop**; generate from OpenAPI |
| `FeatureFlags.ts`: boolean and **fail-open**, so every flag turns on when the DB is down | **Change**: a kill switch must not open during an outage (section 7) |
| `ci.yml`: backend only. Deploy rebuilds instead of reusing the artifact. Long-lived AWS keys, tag-pinned actions, hardcoded health URL. | **Change**: affected-aware, build once, OIDC, SHA pins |
| `desktop.yml`: `push_tags:` is not a real event, so **tag releases never fire**. `npm ci \|\| npm install` hides lockfile drift. No signing or notarization. Node 20 vs 22. | **Replace** (section 10) |
| `extension/` + `firefox-extension/` forks | **Drop the fork**; use one WXT codebase |
| `macos/` (245 lines) + `macos-sdk/` (61 lines) | **Freeze**; superseded by Tauri + generated Swift clients |
| About 648 KB of root planning Markdown (`task.md`, `prompt-task.md`…) | **Archive** to `docs/archive/`; it misleads agents. Use ADRs instead. |
| Jest + ts-jest; Vitest only in the extension | **Vitest everywhere.** TS 7.0 has no programmatic API until 7.1, and ts-jest needs one. |
| CLAUDE.md (Karpathy + Astryx rules) | **Keep the content**, restructured around AGENTS.md |

## 2. Architecture style: options compared

| Option | Team fit (1–3) | Adaptability | Cross-surface reuse | Verdict |
|---|---|---|---|---|
| **A. Services** | Poor: every boundary is a hop, a deploy and an on-call surface | High in theory | None | Reject (Fowler, *MonolithFirst*) |
| **B. Today's layered lambdalith** | Good | Low: unenforced layers, a god routes file | Server only; clients re-type everything | Evolve away |
| **C. Hexagonal modular monolith + portable core** | Good: one image, thin shells | High: ports + data plugins | High: one `core` everywhere | **Recommended** |
| **D. Actor-per-user** (non-obvious; e.g. Durable Objects) | Medium | High for personalisation | Server only | Assess later: vendor lock-in, poor fit with Postgres/PowerSync |
| **E. Durable-execution-centric** (Temporal / Restate / Inngest) | Medium: Temporal needs a cluster; Restate is BSL 1.1, Inngest SSPL | High | Server only | Library form only: **DBOS** (MIT) for long jobs |

**Why C.** Shopify's Packwerk retrospective is the warning. Static checks held the base layer, but "running code, more than any metric" proved real modularity, and privacy checks drifted into API debates. So PromptAI checks **dependencies** mechanically and proves modularity with **port conformance tests**. A portable core also matches the platform-stack lens: one TS core, one Astryx UI, and Tauri, Capacitor and WXT shells.

- `core` owns the domain (intent, prompt compiler, personalisation, prediction) and declares the **ports**: `LlmPort`, `SttPort`, `RetrievalPort`, `MemoryPort`, `FlagPort`, `TelemetryPort`, `ClockPort`, `PlatformPort`.
- `core` does no I/O: no `fetch`, no `Date.now()`, no `process.env`, no DOM. Time, randomness and network come in through ports, so the core is deterministic, replayable and testable without mocks.
- **Composition roots** exist only in `apps/*`. They wire adapters by hand, with no DI container.

## 3. Plugin and extension model: "manifest + optional adapter"

Every axis the owner wants to scale (new AI tools, models, surfaces, domains) is a **plugin kind**. Each plugin is a schema-validated manifest. Code is added only when behaviour cannot be expressed as data.

| Kind | Manifest (data) | Code, only if needed | Replaces today's |
|---|---|---|---|
| `tool` (any AI or non-AI tool a user wants to master) | id, modalities, syntax rules, quirks, token ceilings, URL patterns and DOM selectors, docs sources, eval cases | Serializer override; insertion adapter | `platform-registry.json` entries |
| `model` | provider, model id, context, pricing, capabilities, `verified_at` | `LlmPort` adapter per **provider**, not per model | `model-capabilities.json`, `model-pricing.json` |
| `route` | step → ranked model list + fallbacks + budgets | none | `model-routing.json` |
| `playbook` (domain coaching, templates, workflows) | steps, variables, rubric, lesson content | none | `library-seeds.json`, `strategy-profiles.json` |
| `step` (agent step) | prompt template, I/O schemas, route, budgets | Deterministic function, if any | Most of the 13 agent classes |
| `surface` | capability flags (`hotkey`, `insert`, `dictation.local`) | `PlatformPort` adapter | Ad-hoc `if (platform)` checks |
| `integration` | MCP server descriptor, scopes | none. MCP is the external plugin protocol. | Bespoke connectors |

Rules:
1. `defineManifest(kind, schema)` lives in `contracts`. Every manifest has a `schema_version`. Loaders reject unknown fields and fall back to the **last known good** bundle.
2. **Git is the authoring store and Postgres the serving store.** `catalog/` is reviewed and eval-gated, then published to the global tables the data-sync lens syncs to clients. User-generated tools use the same schema with `status: draft` and are promoted by PR.
3. **No third-party code plugins in v1.** They would need sandboxing, signing and review. Third parties extend PromptAI through manifests and MCP.

## 4. Config as data: schema language

- **Zod 4 (adopt)**: MIT, 44.3k★, v4.6.7. It is already in the repo, gives runtime validation, and exports through `z.toJSONSchema()` (draft 2020-12 by default; `openapi-3.0` target). `z.fromJSONSchema()` is experimental, so keep the flow one-way.
- **TypeSpec (assess)**: MIT, 5.9k★. Strong for API-first multi-language work, but it adds a second language. Revisit only for a public multi-language API.
- **Pkl or CUE (reject)**: the non-obvious option, typed config languages. New toolchain, weak TS runtime story.

The flow: Zod in `contracts` → JSON Schema (editor autocomplete on `catalog/*.json`, the admin UI, Swift/Kotlin) and **OpenAPI** via `@hono/zod-openapi` → generated TS client (`@hey-api/openapi-ts`, MIT) and Swift client (`swift-openapi-generator`, Apache-2.0). CI regenerates everything and fails on any diff.

## 5. Monorepo tooling and layout

**Adopt:**
- **pnpm workspaces + catalogs** (MIT, 37k★): pin each shared dependency once; `catalogMode: strict` rejects off-catalog versions.
- **Turborepo** (MIT, 31.3k★, v2.11.10): task graph, caching and `--affected`. Its `boundaries` feature is experimental.
- **mise** (MIT): pins Node, pnpm and Rust for humans and agents alike.

**Alternatives:**
- **Nx** (MIT, v24): the best built-in boundary lint, but heavier, and Conformance needs the Enterprise plan.
- **moon** (MIT, 4.2k★): non-obvious, polyglot and Rust-aware. Assess.

```
promptai/
├─ AGENTS.md  CLAUDE.md  README.md  .mcp.json  mise.toml  turbo.json  pnpm-workspace.yaml
├─ .claude/{skills/,rules/,settings.json}
├─ apps/                      # composition roots only; nothing imports apps/*
│  ├─ server/                 # Hono: HTTP + DBOS worker roles, one container image
│  ├─ web/                    # Vite/Next PWA shell around packages/app
│  ├─ desktop/                # Tauri 2 (src-tauri/: hotkey, audio, insertion, updater)
│  ├─ mobile/                 # Capacitor (ios/, android/)
│  ├─ extension/              # WXT: Chrome/Edge/Firefox(/Safari)
│  ├─ mcp/                    # MCP server: forge/enhance/score tools
│  └─ admin/                  # separate deploy, no decryption capability
├─ packages/
│  ├─ contracts/              # Zod: API, events, errors, manifests → OpenAPI + JSON Schema
│  ├─ core/                   # pure domain + ports (src/features/<x>/index.ts = public API)
│  ├─ runtime/                # step loop, budgets, retries/breakers, tracing hooks
│  ├─ adapters/<port>-<impl>/ # llm-groq, llm-openrouter, stt-whisper, store-postgres, flags-openfeature…
│  ├─ platform/               # PlatformPort + caps + web|tauri|capacitor|extension adapters
│  ├─ client/                 # generated API client + offline queue
│  ├─ ui/                     # Astryx re-exports (version pinned once), theme, composites
│  ├─ app/                    # shared screens used by web/desktop/mobile
│  └─ testkit/                # port conformance suites, fakes, fixtures, old-client snapshots
├─ native/                    # Swift/Kotlin extension targets (keyboard, share, widgets)
├─ catalog/{tools,models,routes,playbooks,steps,flags}/  # DATA + generated schemas
├─ evals/{suites,golden,audio,baselines}/                # promptfoo configs + datasets
├─ db/migrations/
├─ tooling/{depcruise.cjs,tsconfig.base.json,biome.json,scripts/}
└─ docs/{adr,architecture,runbooks,archive}/
```

Internal packages use `workspace:*` and are never published. Astryx is **beta** (v0.7.12), so pin it exactly and re-export it only from `packages/ui`.

## 6. Boundary rules (enforced by dependency-cruiser)

dependency-cruiser (MIT, 7.4k★, v18.7.2, Nov 2026) checks files and packages. It supports regex group matching (`$1`), cycle detection, `npm-dev`/`npm-no-pkg` dependency types, **license rules**, and a known-violations baseline. That makes it one tool for layering, cycles, undeclared dependencies and copyleft leaks. Turborepo `boundaries` can be added once it leaves experimental status. Knip (ISC, 12.6k★) removes dead files, exports and dependencies.

1. `contracts` is a leaf: it imports only `zod`.
2. `core` imports only `contracts`. No Node built-ins, DOM, network or env.
3. `runtime` → `core`, `contracts`.
4. `adapters/X` → `core` (ports), `contracts`, `runtime`. Never another adapter, never `apps/`.
5. `ui` → Astryx, React, `contracts` types. No domain logic, no client.
6. `app` and `platform` → `ui`, `client`, `core`, `contracts`. Never server adapters or secrets.
7. `apps/X` may import any package. Nothing imports `apps/`, and apps never import each other.
8. Feature modules import each other only through `features/<x>/index.ts`.
9. No cycles. No devDependencies in production source. No undeclared dependencies.
10. No AGPL, SSPL, BUSL or GPL licences in anything shipped to users.
11. Generated code (`client/generated`, `catalog/*.schema.json`) is never hand-edited. A hook blocks edits and CI checks for a diff after regeneration.

```js
// tooling/depcruise.cjs (excerpt; regexes illustrative)
forbidden: [
  { name: 'no-circular', from: {}, to: { circular: true } },
  { name: 'contracts-leaf', from: { path: '^packages/contracts/' }, to: { path: '^packages/(?!contracts/)' } },
  { name: 'core-pure', from: { path: '^packages/core/' }, to: { path: '^(apps|packages/(?!core/|contracts/))' } },
  { name: 'core-no-node', from: { path: '^packages/core/' }, to: { dependencyTypes: ['core'] } },
  { name: 'adapters-isolated', from: { path: '^packages/adapters/([^/]+)/' },
    to: { path: '^packages/adapters/', pathNot: '^packages/adapters/$1/' } },
  { name: 'nobody-imports-apps', from: { path: '^packages/' }, to: { path: '^apps/' } },
  { name: 'apps-independent', from: { path: '^apps/([^/]+)/' }, to: { path: '^apps/', pathNot: '^apps/$1/' } },
  { name: 'feature-public-api', from: { path: '/features/([^/]+)/' },
    to: { path: '/features/', pathNot: '/features/($1/|[^/]+/index\\.ts$)' } },
  { name: 'no-dev-deps-in-prod', from: { path: '/src/', pathNot: '\\.test\\.' }, to: { dependencyTypes: ['npm-dev'] } },
  { name: 'no-undeclared', from: {}, to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] } },
  { name: 'no-copyleft-shipped', from: { path: '^(apps|packages)/' }, to: { license: 'AGPL|SSPL|BUSL|^GPL' } },
]
```

## 7. Feature flags

Put the **OpenFeature** API (CNCF incubating; Apache-2.0) behind `FlagPort`. Declare each flag in `catalog/flags/` with a type, a **safe default**, an owner and an expiry date; CI fails on expired flags. Start with an in-memory provider fed by the catalog bundle (verify the provider API), and serve flags to every client over OFREP so all surfaces share one source. When you need statistically analysed experiments, swap in GrowthBook (MIT core, separately licensed enterprise directories) with no call-site changes. Unleash's server is AGPL-3.0. Don't build a flag service.

## 8. Testing pyramid for an AI product

| Layer | Tool | What it proves |
|---|---|---|
| Static | TS 7 `tsc -b` (strict is now the default), Biome (Apache-2.0, v2.6.6), dependency-cruiser, Knip, catalog schema validation | Types, layering, dead code, valid data |
| Unit | Vitest (MIT, v5.1) + fast-check (MIT) property tests | Pure-core invariants, e.g. the serializer never exceeds a tool's token ceiling and round-trips nodes |
| **Port conformance** | `packages/testkit` defines one suite per port and runs it against the fake and every real adapter (recorded with MSW, live nightly) | Swapping Groq for OpenRouter, or Whisper for on-device ASR, is safe |
| Integration | PGlite (Apache-2.0; WASM Postgres with pgvector) in-process; Testcontainers for parity runs | SQL, RLS and migrations without a DB server in CI |
| **Contract** | Schemathesis (MIT) fuzzes the OpenAPI spec; **old-client tests** replay the last two released clients against the new server | Users who haven't updated keep working (no Pact needed) |
| **Evals** | promptfoo (MIT, 27k★; now part of OpenAI, "remains open source and MIT licensed"). Cached smoke suite on PRs touching catalog, prompts or routes; full + red-team suite nightly vs baseline; dictation WER on a fixed corpus | Quality didn't regress: the product's real test suite |
| E2E | Playwright (Apache-2.0), 10–20 critical journeys on web and extension; Maestro (Apache-2.0) for mobile smoke | Journeys work end to end |

Avoid Evalite: it was archived on 2026-11-09, and its README says it is no longer maintained. Set eval thresholds relative to a measured baseline, never to invented absolute numbers.

## 9. Error handling and resilience

- **Typed errors.** Expected failures return a small in-house `Result<T, E>` (about 30 lines); exceptions are reserved for bugs. Error codes are a closed union in `contracts` (`user_input`, `quota`, `provider_unavailable`, `provider_bad_output`, `safety_blocked`, `timeout`, `budget_exhausted`, `bug`), and clients localise messages by code. Skip Effect (MIT), which would mean a paradigm rewrite.
- **Model calls** go through `runtime`. Each call gets a per-step timeout and token budget, retries with jitter on transient errors only, a **per-provider circuit breaker** (cockatiel, MIT), the declared fallback chain, and Zod validation of output with one repair attempt. If all of that fails, it returns a degraded answer.
- **The no-loop guarantee is structural.** Every run has hard step, token, time and question budgets (data in `catalog/steps`). The runtime detects repeated identical actions and always returns the best answer so far.
- **Durability.** DBOS (MIT, v5.5) handles crawls, nightly evals, learning batches and long runs. It needs only Postgres, but it assumes long-running processes, so move from Lambda to one container image with `ROLE=http|worker`. Put idempotency keys on every mutating endpoint.
- **Observability.** OpenTelemetry JS (Apache-2.0) behind `TelemetryPort`. The GenAI conventions moved to their own repo; their status is unverified here. Sentry SDK (MIT) for crashes. Keep Pino with redaction.

## 10. CI/CD, versioning and release trains

**One `ci.yml`**: `pnpm install --frozen-lockfile`, then `turbo run lint typecheck test build --affected`. Pin every action by SHA. Lint workflows with **zizmor** (MIT) and actionlint (MIT). Keep gitleaks. Default `permissions: contents: read`. Replace AWS keys with **GitHub OIDC** (`id-token: write`, `role-to-assume`, trust scoped by the `sub` claim to the repo and environment).

| Artifact | Pipeline | Train |
|---|---|---|
| Server | One image per SHA → staging → smoke + Schemathesis → promote the **same digest**; rollback = previous digest | Continuous, behind flags |
| Web | PR preview (Cloudflare Pages), Lighthouse CI, size-limit | Continuous |
| **Catalog bundle** | Validate → evals → sign → publish → flip the `current` pointer | Daily. **The adaptability lever: new tools, models and playbooks ship without an app release.** |
| Desktop (Tauri 2.12.x; v3 is alpha) | `tauri-action` matrix. Developer ID + notarization via an App Store Connect API key. Windows via **Azure Artifact Signing** `signCommand`. Updater signing is mandatory ("cannot be disabled"). A dynamic update endpoint gives % rollouts. | Beta weekly, stable every two weeks |
| Mobile (Capacitor) | Fastlane (MIT) `match`/`gym`/`pilot`/`supply`; tauri-action mobile is experimental. Optional web-layer OTA via Capgo (MPL-2.0) within store rules. | Every two weeks, staged |
| Extension | WXT per-browser builds + store submission | Weekly |
| Published SDK/CLI/MCP | Changesets (MIT) | As needed |

Versioning: CalVer for apps, semver for published packages, `schema_version` per manifest. The API is additive-only under `/v1`. Clients send `X-Client-Version`, and the server enforces a minimum supported version.

## 11. Performance budgets (targets unless sourced)

| Budget | Target | Enforced by |
|---|---|---|
| Web INP | ≤ 200 ms at p75 (Google's "good" threshold) | web-vitals RUM → telemetry |
| Web LCP / CLS | ≤ 2.5 s / ≤ 0.1 (Google's thresholds; not re-checked this session) | Lighthouse CI assertions |
| Composer route JS | ≤ 170 KB gzip (our target) | size-limit (MIT) in PR gate |
| Keystroke → paint in composer | < 50 ms (our target) | Playwright trace bench |
| Dictation | First partial < 500 ms; final < 1.5 s after end of speech (our targets, feasibility unverified) | Eval harness timings |
| Desktop | Hotkey → panel visible < 150 ms; cold start < 1 s; idle RAM < 150 MB (our targets) | macOS-runner bench, tracked as a trend because runners are noisy |
| Server | p95 time to first token for a draft < 1.5 s; cost per request ≤ the route manifest budget | OTel metrics + alerts |

## 12. Docs as code and AI coding agents in the repo

- **Docs.** ADRs (MADR) in `docs/adr/`: each blueprint decision becomes one. Keep a Mermaid C4 diagram. CI publishes the generated references (OpenAPI via Scalar, catalog JSON Schemas) and an `llms.txt` for PromptAI's docs.
- **AGENTS.md is canonical.** The Agentic AI Foundation (Linux Foundation) stewards it, and Codex, Cursor, Copilot, Gemini CLI and others read it. Use nested per-package files; the nearest one wins. Claude Code reads only CLAUDE.md when both files exist, so root `CLAUDE.md` = `@AGENTS.md` + Claude-only notes. Move the Astryx rules to `packages/ui/AGENTS.md` or `.claude/rules/ui.md`.
- **Skills** (`.claude/skills/<name>/SKILL.md`, Agent Skills standard, loaded only when invoked): `add-tool`, `add-model-provider`, `add-feature-module`, `write-eval`, `db-migration`, `release-desktop`, `astryx-ui`. `.opencode/skill/model-recommender.md` is API documentation, so move it to `docs/`.
- **One verify command.** `pnpm verify` runs the PR gate locally, so agents can "loop until verified". PreToolUse hooks block edits to generated files and applied migrations. Configure the Astryx MCP server in `.mcp.json`. Run `/doctor prompt-audit` quarterly.

## 13. Quality-gate checklist

**PR gate** (affected packages only; target under 10 minutes)
- [ ] Frozen-lockfile install; no `|| npm install`
- [ ] Biome clean; `tsc -b` clean (TS 7; alias the TS 6 API package for tools that need it until 7.1)
- [ ] dependency-cruiser: zero new violations, and the baseline only shrinks; Knip clean
- [ ] Every `catalog/**` file validates; regenerated JSON Schema, OpenAPI and clients show no diff
- [ ] Unit, property, port-conformance and PGlite integration tests pass
- [ ] Smoke evals pass vs the `main` baseline when prompts, catalog or routes changed
- [ ] size-limit pass; Lighthouse CI pass on the preview
- [ ] gitleaks, `pnpm audit` (high+), zizmor + actionlint on workflow changes, licence rule
- [ ] Migration lint: numbered, forward-only, expand/contract
- [ ] New flags have an owner, an expiry and a safe default; no expired flags remain
- [ ] ADR or AGENTS.md updated when contracts or architecture change

**Main gate**
- [ ] Build once; immutable artifacts (image digest, web bundle, catalog bundle)
- [ ] Staging deploy → health check, Playwright journeys, Schemathesis, old-client (N-2) replay

**Release gate**
- [ ] Nightly full evals, red-team suite and dictation WER show no regression
- [ ] macOS signed and notarized; Windows signed; updater signature verified; mobile staged rollout configured
- [ ] SBOM generated; no copyleft licences in shipped bundles
- [ ] Rollback rehearsed (promote the previous digest or catalog version)
- [ ] Performance budgets checked on reference devices

## 14. What NOT to build

- Microservices, Kubernetes or Kafka. Postgres, an outbox and DBOS are enough.
- A third-party JS plugin runtime. Use manifests and MCP.
- Home-grown flag services, eval frameworks, DI containers or build systems.
- GraphQL, Bazel or Nx Conformance.
- An Effect-TS rewrite.
- Native UI codebases for v1 screens.
- Semver for internal packages.
- Permanent Tailwind + Astryx coexistence. Migrate screen by screen.

## Sources

- https://martinfowler.com/bliki/MonolithFirst.html
- https://shopify.engineering/a-packwerk-retrospective
- https://turborepo.dev/docs/reference/boundaries
- https://nx.dev/docs/features/enforce-module-boundaries
- https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- https://github.com/webpro-nl/knip
- https://pnpm.io/catalogs
- https://github.com/jdx/mise
- https://zod.dev/json-schema
- https://standardschema.dev/
- https://github.com/microsoft/typespec
- https://hono.dev/examples/zod-openapi
- https://github.com/hey-api/openapi-ts
- https://github.com/apple/swift-openapi-generator
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://github.com/biomejs/biome
- https://openfeature.dev/docs/reference/intro
- https://github.com/growthbook/growthbook
- https://github.com/Unleash/unleash
- https://github.com/vitest-dev/vitest
- https://github.com/dubzzz/fast-check
- https://github.com/electric-sql/pglite
- https://github.com/schemathesis/schemathesis
- https://github.com/promptfoo/promptfoo
- https://www.promptfoo.dev/docs/integrations/github-action/
- https://github.com/mattpocock/evalite
- https://github.com/microsoft/playwright
- https://github.com/mobile-dev-inc/maestro
- https://github.com/connor4312/cockatiel
- https://github.com/Effect-TS/effect
- https://docs.dbos.dev/architecture
- https://github.com/restatedev/restate
- https://github.com/inngest/inngest
- https://github.com/open-telemetry/opentelemetry-js
- https://opentelemetry.io/docs/specs/semconv/gen-ai/
- https://github.com/getsentry/sentry-javascript
- https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
- https://github.com/zizmorcore/zizmor
- https://github.com/rhysd/actionlint
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/distribute/sign/macos/
- https://v2.tauri.app/distribute/sign/windows/
- https://v2.tauri.app/blog/tauri-20/
- https://github.com/tauri-apps/tauri-action
- https://github.com/fastlane/fastlane
- https://github.com/Cap-go/capacitor-updater
- https://docs.expo.dev/eas-update/introduction/
- https://github.com/wxt-dev/wxt
- https://github.com/changesets/changesets
- https://github.com/ai/size-limit
- https://github.com/GoogleChrome/lighthouse-ci
- https://web.dev/articles/inp
- https://github.com/adr/madr
- https://github.com/scalar/scalar
- https://agents.md/
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://github.com/meta/astryx
