# Community and network effects (revival.md SHARE pillar)

Wave 2 research lens, 2026-11-10. `BLUEPRINT-draft.md` lists "an early community hub" under **PromptAI is not**, and already has Tier 2 consent ("share one item"), claim credit, cohort priors (k ≥ 20) and "team recipes later". `contrarian.md` (option E) and `tool-mastery.md` §6–7 cover community PRs and "this is outdated". This report does not repeat them. It adds platform evidence, two prototypes, licensing, privacy and regulation, and the schema hooks to add now. Prototypes are in `blueprint-work/spikes/w2-community-network/` and use synthetic or local data: read them as direction, not proof.

## 1. Verdict

**Get network effects from data and exports, not from a destination hub.** The network effect PromptAI can actually have comes from three things: content-free outcome aggregates (better defaults, cards and predictions for everyone), recipe skeletons shared by link, and exports into hubs that already have audiences (GitHub, skills.sh, Claude plugin marketplaces). A public, ranked PromptAI gallery waits behind explicit gates. A paid marketplace, bounties, battles and people leaderboards are never built.

What changes in the plan:

- **MVP:** no community UI at all. About 10 schema hooks (§7), plus hardening of the share links that already exist.
- **v1:** recipe share links (skeleton only, unlisted, noindex); fork-on-import with lineage; SKILL.md export with licence and attribution; outside pull requests to the Tool Atlas; a moderation queue.
- **v1.x:** team libraries.
- **After PMF, gated:** a curated public Gallery, ranked by trusted outcomes and never by stars.

## 2. Platform evidence

| Platform | Unit shared and how it gets in | Review and abuse record | Ranking and licence | Lesson for PromptAI |
|---|---|---|---|---|
| **GitHub** | Repos and PRs. Prompt and skill libraries are huge: `f/prompts.chat` has 176.8k★, `anthropics/skills` 192k★, `github/awesome-copilot` 41k★ (gh api today) | ICSE 2026: about **6.0M suspected fake stars** across 18,617 repos (2019–2024). Fake stars help for "less than two months" ([He et al.](https://arxiv.org/abs/2412.13459)) | Stars. Per-repo licence; prompts.chat puts prompts under CC0 and code under MIT (its LICENSE) | Stars can be bought. Git PRs with review are the cheapest contribution channel to run |
| **Hugging Face Hub** | Model, dataset and Space repos. PRs push to `refs/pr/N` with no forks ([docs](https://huggingface.co/docs/hub/repositories-pull-requests-discussions)) | ClamAV on every file under 2 GB at each commit ([docs](https://huggingface.co/docs/hub/security-malware)). nullifAI got past picklescan using 7z ([ReversingLabs](https://www.reversinglabs.com/blog/rl-identifies-malware-ml-model-hosted-on-hugging-face)) | Likes and trending. A `license:` YAML field with SPDX-like ids, or `other` plus `license_name` ([docs](https://huggingface.co/docs/hub/repositories-licenses)) | Machine-readable licence on every item. Scan every version, not only the first |
| **PromptBase** | Paid prompts | Manual listing review, reportedly 20% commission (secondary sources; primary page returned 403, *unverified*) | Sales | Paying for prompts depends on secrecy. That conflicts with "covers what you forgot" and with open formats |
| **FlowGPT** | Prompts that became shareable bots | CHI 2026 study of 376 NSFW bots and 307 sessions: the platform "is not designed for" NSFW, yet NSFW is prominent ([arXiv 2601.14324](https://arxiv.org/abs/2601.14324)). A 2026 listing says the front page now leans to character chat and a "jailbreak" category (*unverified*) | Views and likes | An open prompt hub with engagement ranking drifts towards jailbreaks and companionship |
| **Raycast Store** | TS extensions, by PR to `raycast/extensions` (MIT, 7.8k★). Prompts and presets come in by PR to `raycast/ray-so` | Human review; merging "can take several days". MIT licence required; no external analytics; Keychain access rejected ([docs](https://developers.raycast.com/basics/prepare-an-extension-for-store)) | Curated, plus upvotes on prompts | A git-native, curated catalog works for a small team. The prompt explorer is a JSON file in a repo |
| **Obsidian** | 4,000+ plugins and themes, 120M downloads | Until May 2026 only the first submission was reviewed. Since 12 May 2026 **every version** is scanned automatically, with manual review for popular, featured or flagged plugins. Failures leave search within 24 h. Scorecards; capability disclosures planned ([blog](https://obsidian.md/blog/future-of-plugins/)) | Downloads; "Paid / Optional payments" labels, no store | "Review once, trust forever" failed. Show capabilities before install |
| **VS Code Marketplace / Open VSX** | Extensions | 2025: 136 reviewed, 110 removed. Verified publisher needs domain verification plus 6 months in good standing; name-squatting blocks; signatures; unusual-metrics monitoring ([Microsoft, Jun 2025](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)). 2026 GlassWorm: a hijacked publisher account, plus "sleeper" extensions turned malicious by an update (secondary reports) ([THN](https://thehackernews.com/2026/02/eclipse-foundation-mandates-pre-publish.html)) | Installs, ratings | Updates are the attack. Gate every version, and never auto-propagate an update into forks or installs |
| **Civitai** | Models and LoRAs, images, bounties, Buzz currency | April–May 2025: rules driven by payment processors, all real-person likeness removed, card processor lost on 23 May 2025 ([404 Media](https://www.404media.co/civitai-site-used-to-generate-ai-porn-cut-off-by-credit-card-processor)). 2026 Creator Program needs Creator Score ≥40k plus paid membership (community summary, *unverified*) | Reactions. Thumbs proposed in place of stars because 4★ hurt creators ([2024 post](https://civarchive.com/articles/3751/proposed-review-system-change-civitai); adoption *unverified*) | Money plus UGC brings outside policy pressure. Star scales confuse newcomers |
| **Skill registries (2026)** | Agent Skills | ClawHub: Koi audited 2,857 skills and found **341 malicious**, 335 using fake "prerequisite" installs of AMOS; later 824 of 10,700+ ([Koi](https://koi.ai/blog/clawhavoc-341-malicious-clawedbot-skills-found-by-the-bot-they-were-targeting)). After VirusTotal and ClawScan were added, Unit 42 still found 5 unblocked skills (Jun 2026), one padded to about 22 MB to dodge scanners ([Unit 42](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/)). skills.sh: Gen, Socket and Snyk audits of 60k+ skills; flagged skills hidden ([Vercel](https://vercel.com/changelog/automated-security-audits-now-available-for-skills-sh)) | skills.sh ranks by install telemetry | Executable skills are a malware channel. Shared PromptAI items must be **data-only** |

Two more signals. Stack Overflow's monthly questions fell to 2009 levels by May 2025 ([Pragmatic Engineer](https://blog.pragmaticengineer.com/stack-overflow-is-almost-dead)): destination communities empty as answers move into the flow of work. And leaky sharing defaults are the privacy failure that matters: OpenAI withdrew "make this chat discoverable" after about 4,500 chats appeared in Google, and Meta added a warning to its Discover feed ([eWeek](https://www.eweek.com/news/openai-chatgpt-google-search-indexes/), [Fortune](https://www.fortune.com/2025/08/22/xai-grok-chats-public-on-google-search-elon-musk)).

## 3. Options

| | A. Destination hub (revival.md 5.1–5.6) | B. Git-native curated catalog | C. Invisible network and publish-out *(non-obvious)* | D. Team-first spaces |
|---|---|---|---|---|
| What it is | Profiles, stars, forks, trending, bounties, embeds | Outside PRs to `catalog/` (cards, families, recipes), with CI gates and a signed bundle | No public feed. Consented outcomes improve priors, claims and playbooks. Recipes travel as unlisted skeleton links and SKILL.md exports to GitHub and skills.sh. Recurring skeletons are promoted into the catalog | Private org libraries and team defaults |
| Value to the core loop | Low until large; browsing is not the job | High for tool knowledge | High: better defaults with zero browsing | Medium–high for repeaters |
| Network effect | Content and social (weak if gamed) | Content | **Data plus distribution** | Within a team |
| Abuse surface | Highest (UGC, Sybils, NSFW drift) | Low (human-merged PRs) | Low (unlisted, data-only, k-gated aggregates) | Low |
| Regulatory load | Public user-to-user service, so OSA and DSA duties | Low | Hosting share links already brings DSA Art. 16/17 | Low |
| Build cost (1–3 eng.) | 6–10 weeks plus ongoing moderation (*estimate*) | Mostly in the blueprint already | 2–3 weeks on top of v1 recipes (*estimate*) | 2–3 weeks (*estimate*) |
| Blocks the core loop? | Yes (team attention) | No | No | No |

**Commitment: C now, B opened to outside contributors in v1, D in v1.x when a paying team asks, and A only as a gated, curated Gallery.** C reuses the blueprint's parts (consent tiers, claim credit, cohort priors, artifact versions, Agent Skills export, MCP `my_recipes`), so it adds hooks, not a product. B is how Raycast and Obsidian scaled with small teams. A's components (stars, trending, bounties) are what the evidence shows gets gamed.

**The non-obvious mechanism in C: skeleton promotion.** A recipe *skeleton* is `{card_id@version, family, slot names and types, which slots are personal, compile options}` with no values. Each saved recipe logs a skeleton hash, which is content-free. When at least 20 distinct established users independently arrive at the same skeleton, the Librarian proposes a catalog recipe for human review. That brings community-sourced coverage of the long tail ("every field") with no public UGC, no ranking to game, and nothing personal leaving the user. It is the same k ≥ 20 rule the blueprint uses for playbooks and claims.

## 4. Prototype 1: what to rank by, under Sybil attack

`rank_sim.py` (numpy, 12 seeds, medians). The setup:

- 200 recipes with a latent "works" rate q ~ Beta(2,3), 1,500 honest users plus 10 new a day, 75% position-biased choices from a top-10 that includes one exploration slot.
- Honest likes are sparse, and outcomes carry 10% label noise.
- A spam recipe (q = 0.10) arrives on day 20, a good one (q = 0.85) on day 30.
- S Sybils boost the spam on days 20–39, running it daily and reporting "worked", plus 5 decoy runs a day. The attack stops on day 40.

The rankers:

- **likes:** total likes.
- **Wilson:** lower bound of thumbs up versus down.
- **outcome:** smoothed "worked" rate, every event counted.
- **trusted:** outcome weighted by account trust (×0.25 under 7 days old, × min(1, distinct items/10), ≤3 counted events per account and item), scored pessimistically as mean − sd.
- **trusted_k:** only accounts at least 30 days old count, and at least 10 distinct such raters are needed to enter the list; until then an item sits in the exploration pool.

| Ranker | nDCG@10, no attack | Good item reaches top 9 | Spam days in top 9 (of 20): S=20 / 50 / 200 | Spam days in top 9 after the attack stops, S=200 | Patient Sybils (60 d old, pre-warmed), S=200 |
|---|---|---|---|---|---|
| likes | 0.656 | never (12/12 seeds) | 19 / 19 / 19 | **20 of 20** | — |
| Wilson | 0.829 | never (11/12) | 10 / 16 / 19 | 20 | — |
| outcome | **0.995** | 10.5 d | 6 / 14 / 19 | 20 | 19 / then 20 |
| trusted | 0.984 | 13 d (1 never) | 1 / 1 / 2 | 0 | 8 / then 0 |
| trusted_k | 0.980 | 4 d (3 never) | **0 / 0 / 0** | 0 | 9 / then 0 |

What the table shows:

- **Likes and stars do not self-heal.** Twenty accounts, one like each, held the spam in the top 9 indefinitely, and honest success fell from 0.705 to 0.509 even with no attack.
- **Outcome ranking self-corrects only when cheap reports cannot pile up.** With the per-account cap and trust weights, real users' failures pull promoted spam out within days, even after patient attacks.
- **Honest users pay:** trust weights discount 17–22% of honest evidence (new accounts, users with under 10 distinct items).
- **Low-traffic niches cannot be ranked safely.** With 150 users, 5 Sybils kept spam on top for 19 of 20 days under outcome ranking. Under trusted_k with patient Sybils it took 10 accounts for 16 of 20 days. The good item never surfaced within 30 days under trusted or trusted_k (nDCG@10 0.78–0.86).

So per-field public rankings in the long tail are either gameable or frozen. Niche lists must be curated, or personal and cohort-only.

A rejected variant (`results/rank_sim_v1_hold.txt`): hiding an item when young accounts dominate its evidence made niche outcomes slightly *worse* (9 vs 8 days at S=50), because hiding stopped the real failures that correct it. **Quarantine suspicious evidence; do not just hide the item.** Artefact: the Sybils' decoy runs acted as free exploration, slightly raising honest success under trusted.

## 5. Prototype 2: a deterministic pre-publish gate

`share_gate.py` (stdlib only) runs regexes for secrets, contact details, Luhn-checked card numbers, hidden Unicode (zero-width, bidi, tag characters), NFKC-normalised injection phrases, base64-decoded payloads, and `curl | sh`-style install lures. It was tested against 370 clean local texts (library seeds, 190 intent ideas, 60 raw dictations, 72 golden briefs), with one synthetic payload inserted per trial (300 trials per cell, seeds 7–9).

- **Clean texts flagged:** 0 of 370 (rule-of-three 95% upper bound ≈ 0.8%). All 8 injection fixtures from `prompt-representation/golden/injection` were flagged.
- **Canonical payloads:** recall 1.00 in every class. This is close to tautological, because the regexes target those formats.
- **Evasive payloads** (spelled-out email, split key, card "ending 4242", a paraphrased "the earlier guidance no longer applies", a Cyrillic-homoglyph "ignore", "download the helper from my profile"): **secret 0.00, contact 0.00, card 0.00, lure 0.00, injection 0.22–0.25** (base64 only). The NBSP-only "hidden" case is benign and was correctly not flagged.

The gate is a cheap first layer with near-zero friction, but it misses what ClawHavoc-style abusers write. The real defences are structural: shared items are data-only (no `scripts/`, `allowed-tools` or non-allowlisted URLs); Tier 1 moderation fails closed for anything shared, with gpt-oss-safeguard (Apache-2.0 per the [HF API](https://huggingface.co/api/models/openai/gpt-oss-safeguard-20b)) on public items; and a human queue covers anything public. The clean corpus is agent-written. Real briefs contain names, emails and numbers, so expect a much higher, and correct, "personal content" rate. That is why sharing exports a skeleton, not a brief.

## 6. Moderation, licensing and privacy

**Moderation ladder** (each step ships before the surface that needs it):

- **Share links (now):** report button, takedown, a reason code logged as a DSA Art. 17-style statement of reasons, owner identity hidden (already true in `018_share_links.sql`), `noindex`.
- **v1 imports:** data-only schema rejection, the deterministic gate, Tier 1 fail-closed, and **per-version review**. A fork pins the version it copied; updates arrive as a diff the user accepts, never silently (the GlassWorm and Obsidian lesson).
- **Gallery:** Discourse-style trust levels (TL0 caps new users at 1 image, 2 links and 3 new topics: [Discourse](https://blog.discourse.org/2018/06/understanding-discourse-trust-levels/)), typosquat checks on handles and titles, a ≤24 h takedown target, the Tier 2 classifier, and a review UI. Try Coop (ROOST, Apache-2.0) before building one.

**Regulatory (not legal advice; owner and counsel to confirm):**

- UK OSA illegal-content duties have applied to in-scope user-to-user services since 17 March 2025, "regardless of size". A risk assessment is required before any public sharing ([Ofcom](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/codes-of-practice)).
- DSA notice-and-action (Art. 16) and statements of reason (Art. 17) apply to hosting services of any size. The micro/small exemption (Art. 19) covers only the online-platform section. *Verify against the Official Journal.*
- India's IT Rules intermediary duties are *unverified here*.

**Licensing:**

- Public recipes default to **CC BY 4.0** (CC0 optional). Fork lineage satisfies attribution automatically, and attribution is the only reputation currency PromptAI offers. Private items carry no licence.
- Catalog contributions: card text CC BY 4.0, code Apache-2.0, DCO sign-off, vendor quotes short and literal, for verification only.
- Exports set SKILL.md `license` and `metadata.author` / `metadata.promptai_origin`; the [spec](https://agentskills.io/specification) allows both.
- Short prompt text may not be copyrightable: the US Copyright Office's Part 2 report (29 Jan 2025) treats prompts as instructions conveying unprotectible ideas ([IPWatchdog](https://ipwatchdog.com/2025/01/29/part-two-copyright-office-ai-report-says-creative-prompting-doesnt-constitute-authorship/)). The licence is mainly a clear permission and attribution signal.
- Tell users before publishing that CC licences cannot be revoked for copies already made.

**Privacy when learning from community data:**

1. Private content never becomes community data; only per-item publishing (Tier 2) or content-free aggregates count.
2. The share unit is a skeleton: `personal` slots are emptied, with an exact preview before publishing.
3. "Worked for N people" appears only at k ≥ 20 distinct established users, rounded. Creators never see who used a recipe.
4. Links are unlisted and `noindex` by default; indexing is a separate, explicit action.
5. Unpublishing removes PromptAI's copy and stats; forks keep theirs, and the user is told so first.
6. Differential privacy is not needed at this scale; revisit for the vocabulary lexicon.

## 7. Data-model hooks to add in MVP

All of these fit the blueprint's 14 tables. They are additive columns with a default of `private`, so nothing community-facing ships.

| Table | Hook | Why now |
|---|---|---|
| `artifacts` | `visibility` enum (private, link, team, public), default private; `license` (SPDX id, nullable); `indexable` bool, default false | Retrofitting visibility onto rows that already sync is the classic leak |
| `artifacts` | `origin_artifact_id`, `origin_version_id`, `origin_kind` (fork, catalog, import) | Lineage cannot be reconstructed later; it is the attribution and the credit path |
| `artifacts` | `published_version_id` (an immutable snapshot, separate from head); `share_slug` (unguessable, revocable; absorbs `share_links`) | Per-version review; updates never silently replace what others copied |
| `artifacts` / `artifact_versions` | `skeleton_hash` (content-free: card@ver, family, sorted slot names and types); `content_hash` (normalised SHA-256) | Skeleton promotion (§3), dedup and spam clustering |
| recipe schema (Zod) | per-slot `personal: bool`; schema **rejects** `scripts`, `allowed-tools` and non-allowlisted URLs | Data-only sharing, skeleton export |
| `artifacts` | `moderation_state` (none, pending, approved, limited, removed), `moderation_reason_code` | DSA-style reasons; the queue later |
| `profiles` | `handle` (nullable public pseudonym, separate from `pid`), `trust_level` smallint, `created_at` | Account age and trust weights; never expose `pid` |
| `events` | `artifact_id`, `artifact_version_id`, `origin_artifact_id`, `skeleton_hash` on forge, hand-off and outcome events | Outcome credit to shared recipes and catalog items, content-free |
| `cohort_priors` / views | `artifact_stats` view: distinct established users, trusted LCB, forks; k-gated | The "worked for N" badge and trusted_k ranking without new tables |
| `audit_log` | moderation and report actions | Append-only record of takedowns |

Cost: about 2–3 engineer-days in the clean Drizzle baseline (*estimate*). A `reports` table arrives with v1 share links.

## 8. Build order and gates

- **MVP:** hooks; harden existing share links (noindex, report, reason codes); the "this is outdated" claim dispute (blueprint). No feeds, profiles or counts.
- **v1 (with recipes and SKILL.md export):**
  - Skeleton share links with preview and a licence chooser; import as a pinned fork.
  - "Publish to my GitHub" into the user's own repo or gist; listing on skills.sh is the user's choice.
  - Outside contributors to the Tool Atlas with DCO and CI evals.
  - The deterministic gate plus Tier 1 fail-closed, and an admin review page.
  - Skeleton-promotion job (k ≥ 20).
- **v1.x:** team libraries and team defaults (needs only `visibility = team`).
- **Gallery gate G-S** (all must hold):
  - ≥20% week-2 recipe reuse (the blueprint's v1 target).
  - ≥1,000 link-shared recipes with a report rate under 1%.
  - A named moderation owner with a ≤24 h takedown SLA (about 2–4 h a week, *estimate*).
  - OSA risk assessment done; Tier 2 classifier live.

  The Gallery then ships curated collections per field, with trusted_k ranking only where a category has enough traffic (in the sim ~450 uses a day worked and ~45 did not; refit on real logs). It includes fork lineage and handles, but no public like counts, follower counts or people leaderboards.
- **Never:** payments or a marketplace, bounties, battles or golf, Wrapped, NSFW, hosting executable skills.

## Sources

- https://arxiv.org/abs/2412.13459 (ICSE 2026 fake stars); https://github.com/hehao98/StarScout
- https://huggingface.co/docs/hub/repositories-pull-requests-discussions ; https://huggingface.co/docs/hub/security-malware ; https://huggingface.co/docs/hub/repositories-licenses
- https://www.reversinglabs.com/blog/rl-identifies-malware-ml-model-hosted-on-hugging-face
- https://arxiv.org/abs/2601.14324 (FlowGPT NSFW, CHI 2026); https://tooldirectory.ai/tools/flowgpt (unverified editorial)
- https://promptbase.com/prompt-guidelines (403); https://godofprompt.ai/blog/?p=3302 (secondary)
- https://developers.raycast.com/basics/prepare-an-extension-for-store ; https://github.com/raycast/ray-so
- https://obsidian.md/blog/future-of-plugins/ ; https://obsidian.md/help/plugin-security
- https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/
- https://thehackernews.com/2026/02/eclipse-foundation-mandates-pre-publish.html ; https://newsroom.eclipse.org/node/43620
- https://www.404media.co/civitai-site-used-to-generate-ai-porn-cut-off-by-credit-card-processor ; https://404media.co/civitai-ban-of-real-people-content-deals-major-blow-to-the-nonconsensual-ai-porn-ecosystem ; https://civarchive.com/articles/3751/proposed-review-system-change-civitai ; https://civitai.com/articles/33294/the-2026-creator-program-the-full-picture
- https://koi.ai/blog/clawhavoc-341-malicious-clawedbot-skills-found-by-the-bot-they-were-targeting ; https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/
- https://vercel.com/changelog/automated-security-audits-now-available-for-skills-sh ; https://skills.sh/about
- https://agentskills.io/specification
- https://blog.pragmaticengineer.com/stack-overflow-is-almost-dead
- https://www.eweek.com/news/openai-chatgpt-google-search-indexes/ ; https://www.fortune.com/2025/08/22/xai-grok-chats-public-on-google-search-elon-musk
- https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/codes-of-practice ; https://prighter.com/resources/laws/dsa/quick-access
- https://ipwatchdog.com/2025/01/29/part-two-copyright-office-ai-report-says-creative-prompting-doesnt-constitute-authorship/
- https://blog.discourse.org/2018/06/understanding-discourse-trust-levels/
- https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network
- https://roost.tools/blog/introducing-osprey-v1-0-open-source-infrastructure-for-real-time-abuse-mitigation/ ; https://github.com/roostorg/coop
- https://huggingface.co/api/models/openai/gpt-oss-safeguard-20b
- gh api today (license, stars, pushed): f/prompts.chat, raycast/extensions, raycast/ray-so, agentskills/agentskills, vercel-labs/skills, github/awesome-copilot, anthropics/skills, roostorg/osprey, roostorg/coop, microsoft/presidio, gitleaks/gitleaks, discourse/discourse, openclaw/clawhub
- Local: `repo/backend/migrations/014,015,016,018`; `blueprint-work/spikes/w2-community-network/{rank_sim.py,share_gate.py,results/}`
