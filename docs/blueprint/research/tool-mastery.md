# Tool knowledge and AI-ecosystem freshness

Research lens: how PromptAI learns any tool, keeps that knowledge current, and turns it into coaching and better prompts. Date: 2026-11-10. All repo, license and endpoint facts below were checked today with `gh api`, `curl` or a page fetch. The shared web-search budget ran out early in this session, so I used direct fetches of primary sources instead of search. Claims I could not check that way are marked **unverified**.

## 1. Bottom line

1. **Build a "Tool Atlas", not a bigger crawler.** Slow, reviewable knowledge lives in git as **Tool Cards**: one folder per tool with a SKILL.md-compatible `SKILL.md`, a structured `card.yaml` and `references/`. Fast facts (models, prices, releases, MCP servers) live only in Postgres and refresh automatically. A sync job loads cards into four tables: `tools`, `sources`, `claims`, `edges`. No graph database.
2. **Ask the vendor first, scrape last.** The ladder: vendor Agent Skill → `llms.txt` and `.md` pages → vendor docs MCP → release feeds → Readability-to-Markdown fetch → Crawl4AI. For bot-blocked tools, the last rung is capture started by the user.
3. **Freshness is a diff problem, not a schedule problem.** Hash normalized sections and re-extract claims only from changed ones. Accept a claim only if its quote appears verbatim in the source, then reconcile it as new, same, changed or retired. Low-risk diffs auto-merge; semantic diffs open a PR gated by golden-task evals.
4. **Users are the best sensors (the non-obvious part).** Aggregated, consented signals (tool error messages, unknown modes seen in a tool's UI, "this didn't work" votes) show stale cards that no crawler can see.
5. **Knowledge pays off three ways:** compiler constraints (better prompts), pitfall lint (fewer mistakes), and a capability graph that drives the next skill to learn and a personal "what's new for you".

This fills in two sibling designs: the **Tool Card** (prompt-optimization.md) and the **Librarian** agent (agent-runtime.md).

## 2. What the repo does today, and the verdict

**Measured decay.** `config/platform-registry.json` says `last_verified: 2026-07-07`. I followed every one of its 30 unique docs URLs today:

- 19 redirect. For example, docs.anthropic.com now goes to platform.claude.com or code.claude.com, docs.cursor.com goes to cursor.com/docs, and platform.openai.com goes to developers.openai.com.
- 5 fail: two 404s (GitHub Copilot Chat, xAI prompt engineering) and three 403s (every Midjourney page).
- Modes are stale: OpenAI's are "GPT-4o / o3 / o4-mini" and Gemini's are "2.5 Flash/Pro". Meanwhile `config/model-capabilities.json` lists GPT-5.6.
- The cached `openrouter-models.json` has 345 models; the live API returns 467.

Four months of drift is enough to make roughly two-thirds of the links indirect or broken.

**Structural problems in the code:**

- `DocIngest.ingestChunks` only inserts or touches `last_checked_at`; it never retires chunks whose source changed, so old and new advice coexist.
- Its duplicate check reads **every** `content_hash`, unscoped by platform, so identical text on a second platform is silently skipped.
- `crawl-pkb.ts` fetches at most 5 pages per platform weekly; its robots parser ignores `Allow` and specific user agents.
- Two separate regex HTML strippers exist (`DocIngest.extractText`, `DocFetchService.htmlToText`).
- `GroundingService` asks for a supporting quote but never checks it exists in the page.
- `tos_reviewed` is `false` for all 13 platforms, and the `ivfflat` index was built on a near-empty table (HNSW avoids this).

| Today | Verdict | Change |
|---|---|---|
| `platform-registry.json` | **Keep as seed, split** | Knowledge (syntax, quirks, modes, limits) becomes Tool Cards. `url_patterns` and DOM selectors move to the extension's site-adapter config, which has a different owner and cadence. Models move out of "modes" into the model catalog. |
| `PlatformProfileAgent` | **Keep idea, repurpose** | Becomes the `draft_card` skill. It maps over sections, emits typed claims with verbatim quotes, and outputs a card diff for review. |
| `GroundingService` live fetch inside the forge | **Move off the hot path** | At request time, read only the Atlas. On a miss, use the family card (§6.4) and queue a Librarian job. Fetching in the hot path adds latency and lets untrusted page text flow straight into prompts. |
| `DocIngest`, `DocFetchService`, `crawl-pkb.ts`, `ModelRefreshAgent` (492 lines), `OpenRouterModelFetcher` | **Merge** | One fetch module (keep the SSRF guard, which is good) plus the Librarian pipeline (§7). |
| `knowledge_chunks` (untyped text) | **Change** | Typed `claims` with provenance and validity windows. Raw `passages` stay for retrieval. |
| `pkb-seed.json` (89 curated chunks) | **Keep content** | Migrate into cards as claims; they already carry source URLs. |
| `model-capabilities.json` (hand-typed, benchmark strings like "~82%") | **Drop as source of truth** | Adopt models.dev plus live OpenRouter. Keep a thin overlay for task fit, filled by the learning loop. Do not show unsourced benchmark numbers. |
| Weekly `crawl-pkb.yml` cron | **Change** | Use tiered schedules driven by change signals (§7). |

## 3. The ecosystem as of November 2026 (checked)

- **llms.txt is common for developer and AI docs, rare for end-user help centres.** Of 27 docs hosts probed, it exists for Claude, Claude Code, Cursor, Figma (developers), Notion, Canva (developers), Perplexity, ElevenLabs, Runway, OpenAI, Gemini, Stripe, Supabase, GitHub, Mistral, xAI, Lovable, v0 and Astryx. It is missing or blocked for Midjourney (403 to bots), Suno, Adobe HelpX, Figma Help Centre, Microsoft Learn's root and Hugging Face docs. The spec also defines `.md` page variants and `rel="describedby"` discovery; Mintlify, GitBook and Docusaurus/VitePress plugins generate it. **Implication:** the tools "everyone" uses (Midjourney, Suno, Premiere, Excel) are the ones without machine-readable docs.
- **Vendors publish Agent Skills.** SKILL.md is an open standard (agentskills/agentskills, Apache-2.0, 27.1k stars) with a `skills-ref validate` tool. Frontmatter: `name` (max 64 characters), `description` (max 1,024), `license`, `compatibility`, `metadata` (string-to-string map only), `allowed-tools`; body under 500 lines. Vendor repos: Black Forest Labs, Microsoft, Supabase, ElevenLabs, Stripe `ai` (MIT); Hugging Face, Google Gemini, Cloudflare (Apache-2.0). OpenAI `skills`, Figma `mcp-server-guide` and `anthropics/skills` show **no license** on GitHub, so check each skill's license before reuse. The `skills` CLI (vercel-labs, MIT) claims support for Claude Code, Codex, Cursor, OpenCode "and 75 more".
- **The official MCP Registry is usable but still "preview".** API frozen at v0.1 on 2025-10-24; `GET /v0.1/servers` supports `search`, `version=latest`, `updated_since` and cursors. Reverse-DNS names require domain authentication, a free **vendor-verified** signal: `com.figma.mcp/mcp`, `com.notion/mcp` and `com.canva.mcp/mcp` exist. Its ecosystem vision expects sub-registries to ETL from it and add curation; that is our role, not a registry of our own.
- **Docs servers for non-AI tools exist.** Microsoft Learn MCP (`https://learn.microsoft.com/api/mcp`) needs no key; I ran `tools/list` against it successfully. Whether it covers end-user Excel help on support.microsoft.com is **unverified**.
- **Model catalogs.** models.dev (`anomalyco/models.dev`, MIT) serves `api.json`: 235 providers and 8,987 models today, with reasoning options, modalities, limits, costs and release dates. OpenRouter returns 467 models. LMArena now redirects to arena.ai behind a Cloudflare challenge (not scriptable). Artificial Analysis has a free API requiring a key and attribution.
- **Papers and repos.** paperswithcode.com now 302-redirects to huggingface.co/papers/trending. HF `api/daily_papers` and the arXiv API both work. **OSS Insight's trending API reports itself "unavailable since 2026-03-01"**, because GitHub event capture fell to about 0.3% of baseline. GitHub search found **2,117** new `mcp-server`-topic repos created since November 1. The current HF trending list includes an "UNCENSORED" fine-tune. Raw trend feeds are noise and need a safety filter.
- **Release cadence.** Claude Code shipped v2.1.321 and v2.1.322 about 7 hours apart; Cursor has an RSS changelog. HTTP validators are unreliable (Cursor sends no ETag or Last-Modified; Notion's and Lovable's Last-Modified equal request time), so only a hash of normalized text is a trustworthy change signal.

## 4. Ingestion: options compared

| Option | Coverage | Cost and ops | License | Verdict |
|---|---|---|---|---|
| **A. Hosted crawl API** (Firecrawl: crawl, Markdown, built-in `changeTracking` with git-diff, statuses new/same/changed/removed) | High, including JS sites | Credits per page; zero ops | Hosted use fine. Self-hosting is **AGPL-3.0**: needs legal review before modifying or offering it as a network service | **Trial** for spot use only |
| **B. Self-hosted crawler** (Crawl4AI with Playwright and adaptive crawling that stops on coverage, consistency and saturation; or Crawlee for TypeScript) | High | A Python or browser container to run | Apache-2.0 | **Adopt Crawl4AI as the fallback rung** |
| **C. Standards-first source ladder** (SKILL.md → llms.txt/.md → docs MCP → release feeds → Readability + Turndown) | Strong for dev and AI tools, weak for consumer apps | Plain HTTP; tiny | MIT, Apache, ISC | **Adopt as backbone** |
| **D. Don't store; delegate at query time** (Context7, DeepWiki-style, vendor docs MCP) | Excellent for code libraries | Free or cheap; no pipeline | Context7's MCP server is MIT, but its backend, parser and crawler are private | **Assess** for coding tools only, via the MCP client. The core cannot depend on a closed backend. |
| **E. User-witnessed knowledge** (the extension or desktop app sees the tool's UI and errors; the user can send a public docs page they are reading) | Unique: covers bot-blocked tools and UI-only features | Small; privacy work | Ours | **Adopt** as the freshness and coverage edge |

Jina Reader (now Elastic; 20 RPM keyless) is fine for occasional fetches, but its ReaderLM-v2 model is CC-BY-NC, so do not self-host it commercially. The commitment is **C + B + E**, with A as a paid escape hatch. Respect robots.txt (`robots-parser`, MIT) and stop on a WAF 403: Midjourney's block is a signal, not a puzzle. Bot-blocked tools rely on curated cards, community PRs and option E.

## 5. Storage: options compared

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Flat vector chunks (today) | Simple | No types, no versions, no retirement, no structure for coaching | Drop as the model |
| Graph DB or GraphRAG framework (Graphiti: temporal edges, needs Neo4j, FalkorDB, Kuzu or Neptune; Cognee; LightRAG; Microsoft GraphRAG) | Rich queries, temporal facts | A second datastore; LLM-built graphs drift; heavy for 1–3 engineers | **Borrow the idea** (bi-temporal facts), skip the product |
| **Git cards + typed claims and edges in Postgres** | Reviewable diffs, community PRs, no code per tool, one database | Need a sync job | **Adopt** |

At hundreds of tools and tens of thousands of claims, recursive CTEs over `edges` answer every graph question we have.

## 6. Tool Atlas design

### 6.1 Layout (adding a tool is a folder, not code)

```
atlas/
  families/image-gen/            # defaults every image tool inherits
  tools/midjourney/
    SKILL.md                     # valid Agent Skill: name, description, license, metadata
    card.yaml                    # structured profile (below)
    references/params.md  pitfalls.md  workflows.md
    evals/golden.yaml            # 3–10 tasks with pass checks
```

SKILL.md `metadata` allows only string values, so structured data goes in `card.yaml`. Each card is also an installable skill, so PromptAI can ship its Atlas through `npx skills add` and its own MCP server: a distribution channel, not just a database.

### 6.2 `card.yaml` (illustrative values taken from today's registry)

```yaml
id: midjourney
family: image-gen
kind: consumer-app            # consumer-app | api | coding-agent | desktop-app | web-app
surfaces: [web, discord]
versions: {current: "7", tracked_by: source:mj-updates}
sources:
  - {id: mj-docs, url: https://docs.midjourney.com/, type: html, authority: official, volatility: medium, fetch: user-capture-only}
capabilities:                  # nodes of the mastery graph
  - {id: basic-prompt, level: 1}
  - {id: params, level: 2, requires: [basic-prompt]}
  - {id: style-raw, level: 2, requires: [params]}
claims:
  - {id: c1, type: syntax, text: "Parameters go last, e.g. --ar 16:9 --style raw", source: mj-docs, valid_from: 2026-07-07, review_by: 2027-01-07, confidence: 0.9}
  - {id: c2, type: pitfall, text: "In-text negation is unreliable; use --no", lint: {pattern: "\\b(without|no) \\w+", unless: "--no"}, source: mj-docs}
fields:                        # consumed by the prompt compiler
  prompt: {max_tokens: 350}
  params: {grammar: "(--(ar|v|style|no|niji) \\S+ ?)*"}
tos: {reviewed: false, scraping: disallowed}
```

### 6.3 Postgres (four tables, loaded from git and fed by fast jobs)

- `tools(id, family_id, kind, status, card_version, card_sha)`
- `sources(id, tool_id, url, type, authority, volatility, fetch_policy, last_hash, last_changed_at, last_ok_at, fail_streak, robots_ok, tos_ok)`
- `claims(id, tool_id, type, text, body jsonb, quote, source_id, version_range, confidence, status[proposed|active|disputed|retired], valid_from, valid_to, observed_at, review_by, helpful, harmful, embedding)`
- `edges(src, rel[requires|alternative_to|integrates_with|supersedes|part_of|in_family], dst)`

`helpful`/`harmful` are the optimization lens's ACE playbook counters, kept on the claim. Fast facts (`models`, `releases`, `mcp_servers`) are plain tables with `fetched_at` and skip PR review.

### 6.4 Three no-code paths for a new tool

1. **Curated:** a PR adds a folder. CI runs `skills-ref validate`, a schema check, link liveness, the robots and ToS gate, and the golden evals.
2. **Assisted:** an admin pastes a docs URL or vendor skill repo. The Librarian runs `draft_card` and opens the PR.
3. **Long tail, per user:** for an unknown tool, the user gets the **family card** at once (for example `spreadsheet` defaults for an Excel clone) plus a private draft card built from its URL, promoted once enough distinct users rely on it and it passes review. That is how "any tool" stays honest.

### 6.5 Trust ladder (sets ranking and the auto-merge threshold)

Vendor-verified (domain-authenticated MCP namespace, vendor skill repo, official docs) 1.0 → official changelog 0.9 → reputable community docs 0.7 → aggregated user evidence 0.6 → model-inferred with a verified quote 0.5 → unquoted model output 0 (rejected).

## 7. Freshness pipeline (the Librarian)

| Signal | Cadence | Cost |
|---|---|---|
| GitHub releases and atom feeds, vendor RSS changelogs | Hourly, for tools tagged high volatility (coding agents, chat apps) | Free |
| `llms.txt`, vendor skill repos (`pushed_at`), MCP registry `updated_since` | Daily | Free |
| models.dev `api.json`, OpenRouter `/models` diff | Daily | Free |
| Section hashes of cited docs pages; link liveness (redirect, 404, 403) | Weekly for medium, monthly for low volatility | Low |
| `review_by` expiry on claims | Daily sweep | Free |
| User evidence: tool error strings, unknown UI modes seen by the extension, "didn't work" votes (aggregated, k ≥ 20 distinct users, no content) | Streaming, batched daily | Free |

**Pipeline** (a durable workflow with idempotency keys):

1. **Detect:** feed item, hash change, catalog diff, user-evidence spike or expiry.
2. **Fetch** through the source's ladder rung (conditional GET only where headers are trustworthy).
3. **Normalize** to Markdown (Readability + Turndown; Docling or MarkItDown for PDFs), split by heading, hash each section.
4. **Extract** claims from changed sections only, with a small model and strict schema; page text is data, never instructions.
5. **Verify:** drop any claim whose quote is not a literal substring of the section.
6. **Reconcile:** embedding match plus a judge labels same, changed, new or retired. Retire only after two consecutive confirmations; one failed fetch never deletes knowledge.
7. **Gate:** auto-merge version bumps, redirects, catalog rows and wording-only changes. Changes to syntax, params, pitfalls or capabilities open a PR with quotes and a golden-eval report (promptfoo, MIT).
8. **Publish** a card version, re-embed changed claims, and **notify** only users of the affected capability (§9).

**Never-stuck guards:** per-run page, token and dollar budgets; a weekly cap on open PRs; a per-source circuit breaker after 3 failures; path-prefix allowlists (no open-ended crawling); a dead-letter queue; every proposal replayable from stored snapshots.

**Community.** An in-app "this is outdated" button marks a claim `disputed`, lowering its rank at once and opening a triage item. Contributor PRs carry trust that grows with merged changes.

## 8. AI-ecosystem radar (keeping the product itself current)

A weekly **Radar** job, not an autonomous adder. Inputs: models.dev and OpenRouter diffs; new MCP servers in domain-verified namespaces of Atlas tools; changed vendor skills; HF daily papers and arXiv cs.CL/cs.AI matched to topics (prompting, agents, ASR, personalization, evaluation); GitHub repos created in the last 14 days above a star threshold with an OSI license. The Librarian summarizes them into a triage queue; one person spends about 30 minutes a week accepting card stubs, catalog overlays or research notes. Trend feeds are never auto-ingested: 2,117 new MCP repos in nine days and uncensored fine-tunes on HF trending make that unsafe.

## 9. From knowledge to better prompts and coaching

- **Compiler constraints.** `fields`, `grammar`, limits and `unsupported` are hard rules for the prompt compiler and verifier (prompt-optimization lens): output cannot use a parameter the tool rejects.
- **Pitfalls become lint.** Claims with a `lint` block run as deterministic checks on the user's draft: "You wrote 'without people'. Midjourney ignores in-text negation; use `--no people`." Each fix links its source, which builds trust and teaches.
- **"What you forgot."** Family cards declare the slots that matter (aspect ratio, version and style for image tools; acceptance tests and repo context for coding agents). Missing slots feed the intent lens's Ask Gate.
- **Mastery graph.** Capabilities and `requires` edges form a per-tool skill tree. The learning lens keeps a per-user, per-capability skill estimate; the prediction lens picks the next skill (not mastered, prerequisites met, relevant to recent tasks). Each capability ships a drill built from card examples and golden tasks, so coaching comes from the same source of truth.
- **"What's new for you."** A published change reaches only users of that tool and capability, as one sourced line with a "try it" prompt. Freshness becomes a coaching moment, not a newsletter.
- **Tool chooser.** Card capabilities, the model catalog and learned task fit answer "which tool should I use?" with honest uncertainty.

## 10. What NOT to build

- A general crawler or search engine; a graph database, GraphRAG index or LLM-built ontology.
- Our own MCP or skills registry (consume the official one, publish to existing ones).
- Hand-maintained model or price tables, or scraped leaderboards (arena.ai blocks scripts).
- Live doc fetching in the request path; auto-adding tools from trending feeds.
- Scraping sites that block bots or forbid it in their ToS.
- Per-tool code adapters for knowledge (DOM adapters belong to the extension).

## 11. Build order (1–3 engineers)

1. **Week 1:** link-liveness audit in CI; fix the 19 redirects and 5 failures; split the registry; load it and `pkb-seed.json` into `tools`, `sources`, `claims`.
2. **Week 2:** card format and CI (skills-ref, schema, golden evals); convert the 13 platforms; add 5 families.
3. **Week 3:** one fetch module (rungs 1–4), section hashing, quote verification, reconcile, PR bot; retire `crawl-pkb.ts`.
4. **Week 4:** models.dev and OpenRouter sync; drop the hand-written JSON.
5. **Weeks 5–6:** pitfall lint, capability graph, "what's new for you"; add 15 tools (revival.md's list plus Excel, Figma, Notion, Canva, Premiere).
6. **Later:** user-evidence signals (needs consent UX), Radar, Crawl4AI container, community PRs.

## Sources

- https://llmstxt.org/
- https://agentskills.io/specification
- https://agentskills.io/clients
- https://github.com/agentskills/agentskills
- https://github.com/vercel-labs/skills
- https://github.com/anthropics/skills
- https://github.com/openai/skills
- https://github.com/black-forest-labs/skills
- https://github.com/huggingface/skills
- https://github.com/google-gemini/gemini-skills
- https://github.com/microsoft/skills
- https://github.com/elevenlabs/skills
- https://github.com/figma/mcp-server-guide
- https://github.com/modelcontextprotocol/registry
- https://github.com/modelcontextprotocol/registry/blob/main/docs/design/ecosystem-vision.md
- https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx
- https://registry.modelcontextprotocol.io/v0.1/servers
- https://github.com/MicrosoftDocs/mcp
- https://learn.microsoft.com/api/mcp
- https://github.com/firecrawl/firecrawl
- https://docs.firecrawl.dev/features/change-tracking
- https://github.com/unclecode/crawl4ai
- https://docs.crawl4ai.com/core/adaptive-crawling/
- https://github.com/apify/crawlee
- https://jina.ai/reader/
- https://github.com/jina-ai/reader
- https://github.com/mozilla/readability
- https://github.com/mixmark-io/turndown
- https://github.com/docling-project/docling
- https://github.com/microsoft/markitdown
- https://github.com/samclarke/robots-parser
- https://github.com/dgtlmoon/changedetection.io
- https://github.com/upstash/context7
- https://github.com/getzep/graphiti
- https://arxiv.org/abs/2501.13956
- https://github.com/topoteretes/cognee
- https://github.com/HKUDS/LightRAG
- https://github.com/microsoft/graphrag
- https://github.com/pgvector/pgvector
- https://models.dev/api.json
- https://github.com/anomalyco/models.dev
- https://openrouter.ai/api/v1/models
- https://arena.ai/leaderboard
- https://artificialanalysis.ai/api-reference
- https://huggingface.co/api/daily_papers
- https://huggingface.co/papers/trending
- https://export.arxiv.org/api/query
- https://api.ossinsight.io/v1/trends/repos/
- https://github.com/anthropics/claude-code/releases
- https://cursor.com/changelog/rss.xml
- https://github.com/promptfoo/promptfoo
