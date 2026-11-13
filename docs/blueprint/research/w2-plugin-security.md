# Plugin model and extension security (wave 2)

Wave 2 evidence report, 2026-11-10. Lens: how new tools, adapters and community extensions plug in without changes to the core, and how to keep that safe. It builds on BLUEPRINT.md §16 ("Plugins are data … No third-party code plugins"), `research/safety-privacy.md` (threat model T1/T9), `research/w2-community-network.md` (contribution channels) and `research/w2-app-store-policy.md` (remote-code rules), and does not repeat them. Prototypes are in `blueprint-work/spikes/w2-plugin-sandbox/` and raw numbers are in `results/summary.json`. The load average was 45–104 on 10 cores during the runs (many agents at once), so every timing is a median of repeated runs and shows direction only.

## 1. Verdict

**Ship zero third-party code in v1, and make that rule precise.** An extension is declarative data: a manifest plus content. Only PromptAI's own fixed interpreter executes it, and its effects come from a closed, enumerated set. Contributions arrive as pull requests, pass schema, injection-lint and eval gates, and ship in one **TUF-lite signed bundle**: an offline root key, a delegated CI key, an expiry, and a rollback guard. Integrations plug in **out of process through MCP**: the server ships in 2b, and a client comes only with CaMeL-lite. Executable plugins wait behind explicit gates. When they come, run them in **QuickJS-in-wasm inside a worker with a hard watchdog**, on desktop and server only, never on iOS or in the Chrome extension. BYOK keys stay in the device keychain. Plugins get capabilities, never key values.

The blueprint already says "plugins are data". This report adds what that rule lacks today: an effect manifest, signing that can rotate keys without a client release, release-pipeline hardening, and measured numbers for the sandbox to use later.

## 2. What actually plugs in

| Kind | Example | v1 form | Executes where |
|---|---|---|---|
| Tool knowledge | Tool Cards, families, locales | Data (Zod, `schema_version`) | Nothing executes; text and slots |
| Adapters (hand-off) | "Open ChatGPT with this brief", "paste into Figma" | Declarative effect recipe | Fixed first-party code |
| Recipes / skills | User recipes; SKILL.md export | Data; exports carry no `scripts/` | Nothing |
| Integrations / tools | Notion, Linear, calendar | Remote MCP server (OAuth) | Out of process, Phase 3 client |
| Model providers | OpenRouter or Anthropic key | Config + OS keychain | Device |

## 3. Threats seen in 2025–2026

- **Updates are the attack.** In the Cyberhaven case (Dec 2024), a phished Chrome Web Store account pushed v24.10.4 through auto-update to roughly 400k users (secondary reports). In GlassWorm on Open VSX (Jan–Apr 2026), stolen publisher credentials were used to backdoor established extensions, and "sleeper" extensions later added a malicious dependency. postmark-mcp (Sept 2025) shipped 15 benign versions, then added a one-line BCC to every email in 1.0.16.
- **Provenance proves where an artifact came from, not what it does.** In the TanStack incident (11 May 2026), 84 versions of 42 packages were published from inside the real release pipeline. The chain was a `pull_request_target` "Pwn Request", then pnpm-store cache poisoning, then an OIDC token read out of runner memory. The postmortem says "No npm tokens were stolen" and "Detection was external". Secondary reports say the packages carried valid SLSA provenance.
- **The instructions are the payload.** ClawHavoc on ClawHub had 341 malicious skills out of 2,857 audited (Koi, via the wave 2 community report). The lure was a "prerequisites" install step written in Markdown, which malware scanners miss.
- **In-process hosts have no boundary.** VS Code says "The extension host has the same permissions as VS Code itself". The MCPB manifest spec has no permissions block: bundles can be signed (PKCS#7 via `mcpb sign`), but the server runs with the user's privileges. Node's permission model "does not protect against malicious code".

## 4. Evidence from prototypes

| Runtime (version) | Cold start | Call | CPU limit | Memory limit | Capability control | Notes |
|---|---|---|---|---|---|---|
| **QuickJS-wasm** (quickjs-emscripten 0.32, release-sync, 492 KB wasm) | First module load 134 ms; new runtime + context + plugin eval **1.2 ms**; worker + QuickJS **66 ms** | **0.17 ms** for an adapter on a 2.4 KB brief (p95 1.8–6.4 ms) | The interrupt deadline stops bytecode loops (186 ms against a 100 ms deadline). **A `'x'.repeat()` memory bomb ran past it: 6.8–15.7 s (n=4).** A worker watchdog terminated it in **344–403 ms** at a 300 ms hard limit (n=5) | `setMemoryLimit` works. **A max stack of 512 KiB let a host RangeError escape and corrupted the runtime**; 256 KiB gives a clean guest "stack overflow" and a reusable runtime | Only the functions the host injects. No `process`, `require`, `fetch`, `setTimeout` or `WebAssembly`; the `Function('return this')` escape returns undefined; prototype pollution stays inside | No npm provenance. The model Figma uses for plugin logic |
| **Extism JS SDK** (2.0.0-rc13, 682-byte hand-written WAT plugin) | Foreground 3.3 ms; worker 44 ms | Echo 6–14 µs foreground, 0.07–0.19 ms in a worker | `timeoutMs` works only with `runInWorker` (cancelled at 264 ms against 200 ms). In the foreground it throws TypeError, and an infinite loop **blocked the event loop** (0 timer ticks in 2 s) | `maxPages` capped kernel allocations (257 > 256), but **guest `memory.grow` reached 1 GiB (16,385 pages) with maxPages=256** in both modes | Non-allowlisted HTTP host denied by default in JS. Rust manifest docs say `allowed_hosts: null` allows all hosts, so the defaults differ by SDK | Still an rc; last npm publish May 2025. The Rust runtime docs require a declared memory maximum (not tested here) |
| **Component model** (jco 1.41 + componentize-js 0.23) | Instantiate 124 ms (median of 3) | 1.64 ms (~10× QuickJS here) | None in jco-on-Node: needs a worker or wasmtime | None in jco-on-Node | **Imports are statically inspectable**: `jco wit` showed zero imports with `--disable all` | **11.95 MB** component for a 6-line plugin; 72 s build; 346 MB toolchain. Zed uses this model with Rust guests and wasmtime |
| **Node `--permission`** (26.9) | Spawn 412–621 ms under load (plain Node 434–905 ms, so not separable) | n/a | n/a | n/a | Blocked: fs outside the grant, writes, child_process, worker, fetch, `net.connect`. Leaked: environment variables (scrub them) | The docs call it a "seat belt", not a sandbox |

**Supply chain.** The blueprint's adopted JS dependencies resolve to a 238-package tree. All 238 have registry signatures; **75/238 (32%) have provenance attestations**, and **all 18 direct dependencies** are attested. The sandbox libraries (quickjs-emscripten, @extism/extism, wabt) have none; the jco tree has 25/73. Requiring provenance on direct dependencies is feasible today. Requiring it on transitive dependencies is not.

**Signing cost.** Ed25519 over a 426 KiB bundle: sign 2.7–3.6 ms, verify 1.6–1.8 ms; one flipped byte fails verification. The cryptography costs nothing. The real cost is keeping the keys safe.

**Device secrets.** On this M5, an ad-hoc-signed Swift binary built with Command Line Tools (SDK 26.5; the default 27.0 SDK does not match Swift 6.3.3) and no entitlements could use the Secure Enclave. ECIES wrap of an API key: SE keygen 6–16 ms, wrap 1.1–1.6 ms, unwrap 5.8–9.3 ms; the key blob is 284 bytes and bound to this device. A tampered blob loaded without error but failed at first use (CryptoTokenKit −3).

## 5. Options compared

| | A. In-process code + store review | B. Sandboxed code | C. Out-of-process protocol | **D. Zero third-party code: declarative data + fixed interpreter** *(non-obvious)* |
|---|---|---|---|---|
| Precedent | VS Code, Obsidian, Raycast | Figma (QuickJS + iframe), Zed (wasm components), Extism hosts | MCP servers, MCPB, M365 declarative agents | Raycast/Homebrew-style "we are the only publisher", applied to data. Eval results, not reviewer trust, decide merges |
| Isolation | None: user privileges | Strong if the limits hold (§4 shows two that did not) | Process or network boundary, but local servers run as the user | **Nothing runs**: a malicious card can at worst produce a bad brief |
| What the community can add | Anything | Logic within host APIs | Tools and data sources | Cards, adapters (URL/deep-link/paste recipes), recipes, locales, selectors |
| Store fit | Banned for downloaded code (Apple 2.5.2; Chrome MV3 bans "an interpreter to run complex commands fetched from a remote source, even if … fetched as data") | Same bans; desktop and server only | Fine (remote) | Fine, if the effect set stays closed and enumerated (see risks) |
| Team cost (1–3 engineers) | Low to build, high to police (GlassWorm, ClawHavoc) | High: own a sandbox, an API, versioning and escapes | Medium; already planned (2b) | **Low**: schemas + CI + ~150-line verifier |
| Failure mode | Credential theft at scale | Sandbox escape or DoS | Tool poisoning, rug-pull updates | Prompt injection in card text; a poisoned signing pipeline |
| Verdict | **Avoid** | **Assess** (QuickJS-in-worker), behind gates | **Trial**: server now, client with CaMeL-lite | **Adopt for v1** |

D is non-obvious because the ecosystem expects "plugins" to mean code, and the pressure to add a marketplace is real. Its insight is that what PromptAI's users need to add (tool knowledge and hand-off recipes) is data, and any data that needs logic is a signal to extend the first-party interpreter, not to run someone else's code.

## 6. The security model

### 6.1 Trust tiers

- **T0, first-party code:** the only code that runs. It is signed per platform (notarization, Windows signing, the Tauri updater's minisign key).
- **T1, reviewed data:** catalog PRs merged by a named owner. These are the only items in the signed bundle.
- **T2, user-local data:** a user's own recipes. Never shared unless exported, and never auto-installed from a link.
- **T3, remote tools (later):** MCP servers. Their outputs taint the context, and they are never on the request path.
- **T4, sandboxed code (gated):** see §6.7.

### 6.2 Manifest

Every bundle item declares its **effects**. CI checks them, and the interpreter refuses anything undeclared:

```json
{
  "id": "adapter.chatgpt.open",
  "kind": "adapter",
  "schema_version": 1,
  "publisher": "community:octocat",
  "reviewed_by": "owner",
  "license": "CC-BY-4.0",
  "effects": {
    "open_url": { "pattern": "https://chatgpt.com/?q={brief}", "slots_in": ["query"] },
    "clipboard_write": true,
    "paste": false
  },
  "evals": "evals/adapter.chatgpt.open.yaml"
}
```

**Interpreter rules.** The effect set is closed: `render` (templates with named slots, no loops, no eval), `open_url` (a fixed host from the manifest; slot values URL-encoded and only in the query or fragment, so a brief can never pick its destination), `clipboard_write`, `paste` (desktop, user-initiated), and `export_skill` (SKILL.md with no `scripts/`). There is no fetch, no file access, no regex from the bundle (use URLPattern and CSS selectors) and no key access. Sizes are capped. A property test (fast-check) asserts that no slot value can change the scheme, host or path.

**Text is an injection surface.** CI rejects invisible and bidirectional Unicode (the Tags block U+E0000–E007F, bidi controls, zero-width characters), URLs outside the allowlist, base64 blobs and imperative patterns ("ignore previous", "run this command"). Per-card promptfoo evals must pass. At runtime, card text sits in a delimited reference section, and the blueprint's "no tools or egress on the request path" rule means injected text has nothing to call.

### 6.3 Signing and update channels (TUF-lite)

- `root.json`: two Ed25519 root public keys pinned in every client. The private keys live on two hardware keys held offline, and either one can sign.
- `keys.json`: signed by a root key. It lists the current CI **bundle key** and its expiry (≤12 months). Rotating the bundle key needs no client release, which fixes the blueprint's "under one key" single point of failure.
- `meta.json` + `bundle.json`: signed by the bundle key. `meta.json` carries a CalVer `version`, which must increase monotonically (rollback guard), `expires` ≤30 days (freeze guard), `channel` (`canary` | `stable`), `min_client` and the bundle's SHA-256.
- Clients verify the chain, keep the **last good bundle** on any failure, refuse older versions and warn on expiry. A kill switch is a newer bundle, never a deletion. Canary goes to internal and beta users first through the blueprint's G-P canary gate, and moves to stable after 24 h.
- Keys stay separate: content bundle, app updater (Tauri minisign) and OS code signing never share a key.
- Optional: `actions/attest-build-provenance` gives a public Rekor record for auditors. Verify it in CI, not on clients: the Sigstore client stack adds TUF and transparency-log fetches the app doesn't need.

### 6.4 Pipeline hardening (TanStack's lessons)

- Never build fork code in a privileged context: ban `pull_request_target` with checkout of PR code (zizmor flags it).
- No `actions/cache` in release or signing jobs.
- Pin actions by SHA.
- Signing runs in a GitHub environment with a required reviewer (a two-person flip), and only that job gets `id-token: write`.
- Dependencies: `minimumReleaseAge: 1440` (the pnpm 11 default; pnpm 10.16+ supports it); `pnpm audit signatures` in CI; provenance required for direct dependencies (18/18 pass today); lockfile diffs reviewed.

### 6.5 Secrets and BYOK

The key lives on the device and goes from the device straight to the provider. It is never synced or logged, and is deleted at sign-out. Nothing in the bundle can reference a key. A future plugin would get an opaque provider capability that the host fulfils.

| Platform | Store | Caveat |
|---|---|---|
| macOS / iOS | Keychain, `…WhenUnlockedThisDeviceOnly`; optional SE wrap (measured at a few ms) | The SE has no symmetric keys, so wrap with ECIES (§4) |
| Windows | Credential Manager (DPAPI) | Not protected from other apps of the same user (Electron's safeStorage docs) |
| Linux | Secret Service | Refuse Electron's `basic_text` fallback (a hardcoded password) |
| Android | Keystore, StrongBox when present | via a Capacitor plugin |
| Web | **No persistent BYOK**; key held in tab memory only | Browsers have no OS-protected store |

For Tauri, use the `keyring` crate (Apache-2.0, 781★, pushed 2026-11-06) rather than Stronghold. A Tauri discussion reply says Stronghold will be removed in v3 (*unverified* officially).

### 6.6 MCP rules

- **Server (2b):** follow MCP 2025-11-25 security best practices: no token passthrough ("MUST NOT accept any tokens that were not explicitly issued for the MCP server"), per-client consent, exact `redirect_uri` match, and never sessions as authentication.
- **Client (Phase 3, with CaMeL-lite):** remote servers by default. Pin each tool's description and schema by hash at approval and ask again on any change (a rug-pull defence; postmark-mcp's pattern). Outputs are tainted. Local stdio servers require showing the exact command (a spec MUST) and an OS-level sandbox, never Node's permission model.

### 6.7 Executable plugins, later

Open this gate only when all three hold: at least 3 real requests that data cannot express, a named sandbox owner, and desktop or server only.

The runtime is **QuickJS-wasm in a worker**: memory 16–32 MiB, max stack ≤256 KiB, a 100 ms interrupt deadline plus a 300 ms hard `terminate()`, a warm worker pool (66 ms cold), and host functions limited to the manifest's permissions. UI goes in a sandboxed iframe (Figma's split; MCP Apps' double-iframe pattern on web). The server-side alternative is Extism on wasmtime (Rust), whose docs require a declared memory maximum (not tested).

**Do not** use the Extism JS SDK for untrusted code (guest memory is uncapped and it is still an rc), JS components (12 MB, a 72 s build, slower calls), or Node's permission model as a boundary.

## 7. Minimal version to ship first

1. **Schemas** (`packages/contract`): item manifest with `effects`, plus `root`/`keys`/`meta` documents, as strict Zod (unknown fields rejected).
2. **Verifier** (`packages/core`, pure): bytes plus pinned roots in, a verified bundle or a typed error out; last-good fallback. Fast-check tests for tampering, rollback, expiry and a wrong key. About 150 lines (*estimate*).
3. **Interpreter**: the four or five effects, URLPattern allowlist, and the slot-cannot-change-host property test.
4. **CI**: validate, then injection lint, then promptfoo evals, then sign (protected environment), then canary, then stable. Plus the §6.4 hardening and the dependency policy.
5. **Contribution path**: a PR template and CODEOWNERS. No in-app install of anything from third parties.
6. **Keys**: generate two roots offline on hardware keys; write the rotation and compromise runbook (revoke by publishing a new `keys.json`).
7. **BYOK**: none in MVP (the blueprint retired server custody). When added, device keychain only, per §6.5.

## 8. Risks and open questions

- **Chrome review:** even a closed template interpreter could be read as an "interpreter … fetched as data". Ship only selectors and URL templates to the extension, and keep `render` in the server or desktop app (*review outcome unverified*).
- **The signing pipeline is the crown jewel.** A poisoned CI signs valid bundles, as TanStack showed. Hardware root keys limit how long a compromise lasts, not whether one happens.
- **Prompt injection through reviewed text** survives lint. Evals and the absence of tools on the request path are the real backstop.
- **Gaps in the limits:** QuickJS's deadline is not a wall clock (~100× overrun), and Extism-JS `maxPages` does not cap guest memory. Treat any single sandbox limit as advisory, and put a process- or worker-level kill behind it.
- **Pressure to add code plugins** will come from power users. Hold the gate in §6.7 and answer with first-party effects.
- **Unverified:** the Stronghold removal; the date of npm's bypass-2FA token reset; the Rust Extism memory enforcement; Chrome's review stance; and the TanStack SLSA-provenance claim, which comes from secondary reports (the postmortem does not state it).

## 9. How to rerun

From `blueprint-work/spikes/w2-plugin-sandbox/`:

- `npm i && node build.mjs`, then `node bench-quickjs.mjs`, `node probe-quickjs-hostile.mjs`, `node bench-qjs-watchdog.mjs`, `node bench-extism.mjs`, `node probe-extism-limits.mjs`, `node bench-nodeperm.mjs` and `node bench-bundle-sign.mjs`.
- `component/`: `npm i`, then `npx jco componentize adapter.js --wit adapter.wit --world-name adapter --disable all -o adapter.wasm` and `npx jco transpile adapter.wasm -o out --name adapter`, then `node bench-component.mjs`.
- `provenance/`: `npm i --ignore-scripts`, then `npm audit signatures`.
- `secrets/`: `swiftc -sdk …/MacOSX26.5.sdk se_wrap.swift -o se_wrap && ./se_wrap`.

The large `node_modules` folders were deleted after the runs.

## Sources

- TanStack postmortem: https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
- TanStack provenance (secondary): https://cybelangel.com/blog/tanstack-npm-supply-chain-attack/ ; https://venturebeat.com/security/shai-hulud-worm-172-npm-pypi-packages-valid-provenance-ci-cd-audit
- npm 2026 hardening (secondary): https://thehackernews.com/2026/02/npms-update-to-harden-their-supply.html ; https://socket.dev/blog/npm-to-implement-staged-publishing
- pnpm minimumReleaseAge: https://pnpm.io/settings ; https://socket.dev/blog/pnpm-10-16-adds-new-setting-for-delayed-dependency-updates
- GlassWorm: https://thehackernews.com/2026/04/researchers-uncover-73-fake-vs-code.html ; https://thehackernews.com/2026/03/glassworm-supply-chain-attack-abuses-72.html
- postmark-mcp: https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html
- Cyberhaven: https://therecord.media/cyberhaven-hack-google-chrome-extension
- ClawHavoc: https://koi.ai/blog/clawhavoc-341-malicious-clawedbot-skills-found-by-the-bot-they-were-targeting ; https://snyk.io/articles/clawdhub-malicious-campaign-ai-agent-skills/
- VS Code extension runtime security: https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security
- Figma: https://developers.figma.com/docs/plugins/how-plugins-run ; https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
- Zed extensions: https://zed.dev/blog/language-extensions-part-1
- Node permissions: https://nodejs.org/api/permissions.html
- MCP security best practices: https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
- MCPB: https://github.com/modelcontextprotocol/mcpb (MANIFEST.md, CLI.md)
- MCP Apps sandbox (secondary): https://sunpeak.ai/blogs/mcp-app-iframe-sandbox-origins-cors
- Agent Skills spec: https://agentskills.io/specification
- Extism manifest: https://extism.org/docs/concepts/manifest ; https://docs.rs/extism-manifest/latest/src/extism_manifest/lib.rs.html
- WASI 0.3: https://bytecodealliance.org/articles/WASI-0.3
- Sigstore Rekor v2 GA: https://blog.sigstore.dev/rekor-v2-ga/
- SLSA v1.2: https://slsa.dev/blog/2025/11/announce-slsa-v1.2
- Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
- Tauri Stronghold discussion: https://github.com/orgs/tauri-apps/discussions/7846
- Chrome MV3 remote code: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Apple App Review Guidelines 2.5.2: https://developer.apple.com/app-store/review/guidelines/
- Repos checked with `gh api` today: extism/extism (BSD-3-Clause, 5.8k★, pushed 2026-10-09), extism/js-sdk (pushed 2025-05-14), justjake/quickjs-emscripten (MIT per npm, 1.7k★, 2026-07-23), quickjs-ng/quickjs (MIT, 2026-11-09), bytecodealliance/jco (Apache-2.0, 2026-11-10), ComponentizeJS (Apache-2.0, 2026-10-19), wasmtime (Apache-2.0, 18.8k★), sigstore/cosign (Apache-2.0), sigstore/sigstore-js (Apache-2.0), jedisct1/minisign (ISC), hwchen/keyring-rs (Apache-2.0, 781★, 2026-11-06), modelcontextprotocol/mcpb (2.2k★, 2026-05-26)
