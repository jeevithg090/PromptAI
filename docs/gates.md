# Quality gates

The gates for the rebuild (`apps/*`, `packages/*`, `catalog/`), from [BLUEPRINT.md](blueprint/BLUEPRINT.md) §13, §14 and §16. The legacy dirs (`backend/`, `web/`, `extension/`, `desktop/` and the rest) are out of scope; their own workflows still cover them.

| Gate | Command | Fails on | CI job |
|---|---|---|---|
| G0 | `pnpm verify` | a type error, a lint finding, a boundary or licence break, an unused file, export or dependency, a failing test | `verify` |
| G1 | `pnpm gates:g1` | a golden case that fails, or an `evals.yaml` that doesn't parse | `verify` |
| G-P | `pnpm gates:gp [web\|electron]` | a canary in a request to another host, in `/v1/events` or in a URL; any desktop request to another host | `web-gates`, `desktop` |
| axe | `pnpm gates:axe` | a serious or critical axe violation | `web-gates` |
| Electron smoke | `pnpm --filter @promptai/desktop test:smoke` | the hold → speak → draft → Insert journey breaking | `desktop` |
| Supply chain | in CI only | a zizmor finding in `rebuild.yml`, a secret in git history | `zizmor`, `gitleaks` |
| Signed bundle | `pnpm bundle:build && pnpm bundle:sign` | a bundle that doesn't verify after signing | not wired yet |

G-P, axe and the smoke test run the built apps, so run `pnpm build` first. On macOS, `pnpm verify` also needs `pnpm build`, because the `pf-native` helper test runs the built binary.

## G0: `pnpm verify`

`pnpm verify` runs `typecheck`, `lint`, `deps`, `knip` and `test`, in that order.

**`pnpm lint` (Biome, `biome.jsonc`).** Biome only lints, and only `apps/**` and `packages/**`. The formatter and import sorting are off, so it never rewrites code. It uses the recommended rules, minus two style rules that clash with the codebase's own conventions (`noNonNullAssertion`, since `noUncheckedIndexedAccess` makes `!` the idiom, and `useTemplate`). It runs with `--error-on-warnings`, so a new warning fails too.

**`pnpm deps`** runs two checks:
- **dependency-cruiser** (`.dependency-cruiser.cjs`) checks the §16 boundaries:
  - `contract-is-a-leaf`: `packages/contract` imports no other workspace package or app.
  - `core-no-node-builtins` and `core-no-io-packages`: `packages/core/src` imports no `node:` or other built-in modules, and no network, DOM or file-system packages. Globals such as `fetch`, `Date` and `process` are caught by core's own test (`packages/core/test/compose.validate.test.ts`).
  - `packages-never-import-apps`.
  - `apps-never-import-each-other` and `only-desktop-imports-app`: the one allowed edge is `apps/desktop` → `apps/app`, whose build is the desktop renderer.
  - `no-circular`.
  - `licence`: nothing a `src/` file imports may be AGPL, SSPL, BUSL or GPL (LGPL included). Imports from `src/` count as shipped even when they are devDependencies, because `apps/desktop` bundles its own.
- **`packages/gates/src/licences.ts`** is the licence rule's transitive half. It reads every production dependency of every workspace package from `pnpm licenses list --prod`. It fails on a forbidden licence, and on a missing or unknown one that someone needs to read. An SPDX `OR` passes when any one branch is allowed.

`packages/gates/test/boundaries.test.ts` builds a throwaway workspace that breaks each rule once, and checks that each rule fires.

**`pnpm knip` (`knip.jsonc`)** finds unused files, exports and dependencies. Its config names the entry points that Knip can't infer: the desktop esbuild entries, the fake helper, `public/color-mode.js` and the manual helper script.

### Baselines

Findings that existed when a gate was added are listed in its config. They are kept out of the failure count, and they don't stop new findings from failing. Each list only shrinks: fix the finding, then delete its entry.

- `biome.jsonc` → `overrides`. Each rule is lowered to `info` only in the one file where it was found. Run `pnpm exec biome lint` to list the findings.
- `knip.jsonc` → `ignoreIssues`, by file.
- `packages/gates/e2e/axe.e2e.ts` → `KNOWN`, by axe rule. Each run says whether each entry still occurs.

## G1: `pnpm gates:g1`

`packages/gates/src/g1.ts` loads every card (`catalog/tools/*/card.yaml` and `catalog/families/*.yaml`). It then runs each case in every `catalog/tools/<id>/evals.yaml` through `@promptai/core`'s `forge`, with a fixed clock and no LLM, so every failure is deterministic. The file format:

```yaml
- name: string                  # unique in the file
  input: <ForgeRequest>         # packages/contract forgeRequestSchema; unknown keys are errors
  expect:                       # every key optional; unknown keys are errors
    toolId: claude              # the card forge picked
    briefIncludes: [launch email]   # substrings of the brief (case-sensitive)
    briefExcludes: ["--ar"]
    noUnsourced: true           # no specifics in the brief that the user didn't say
    maxIssues: { block: 0 }     # at most N issues of a severity (block, warn, info)
```

The report prints one line per tool (PASS, FAIL, or `----` for a card with no `evals.yaml`) and each failing case's reasons. It exits 1 on any failing case, on a file that doesn't parse, and on an `evals.yaml` for a tool with no card. A card without an `evals.yaml` is listed but does not fail. Until W1's files land, the catalog has none.

`packages/gates/samples/tools/claude/evals.yaml` holds two sample cases. Run them with `pnpm gates:g1 --evals packages/gates/samples`. Options: `--catalog <dir>` (where the cards are) and `--evals <dir>` (a dir with `tools/<id>/evals.yaml`). Both default to `catalog`.

## G-P: `pnpm gates:gp [web|electron]`

Each run uses fresh canaries (`gpcanary…` plus random hex) in personal fields. Each journey also checks that its canary reached `/v1/forge`, so a journey that silently tested nothing fails.

**Web (`e2e/gp.web.e2e.ts`).**
- **Setup.** The built `apps/app` runs in headless Chromium against `apps/server` in dev mode (in-memory PGlite, the deterministic forge). `apps/server` sends no CORS headers yet, so a small pass-through (`e2e/harness.ts`) serves `apps/app/dist` and forwards `/v1/*` to the server on one origin. That origin is the server URL the app was built with, read from its CSP (`http://localhost:8787` by default).
- **What's recorded.** Every HTTP request and WebSocket frame is recorded. Requests to any other host are recorded, then blocked.
- **Fails when** a canary appears in a request to another host, in any `/v1/events` payload (events must be content-free), or in any URL (§13: no content in URLs).
- **Journeys:**
  - The typed brief: type a brief, draft, Copy, then leave the page so queued events flush.
  - Memory text: skipped until the app has a textbox named like "memory".
  - A self-test that sends a canary out on purpose, which proves the checks catch it.
- **Selectors.** They are few and role-based: the first textbox on `/`, ⌘/Ctrl+Enter to draft, and a button named "Copy". If the first-run screens (DOB, consent) land in front of the capture field, the journey needs a step for them.

**Desktop (`e2e/gp.electron.e2e.ts`).**
- **Setup.** The built `apps/desktop` runs through Playwright's Electron support with the fake `pf-native` helper, against `apps/server` behind the same pass-through.
- **Journey.** Hold the hotkey, dictate a canary, release, draft, then Insert.
- **What's recorded.** The app's requests come from two network stacks, so both are recorded:
  - Chromium's (the renderer and Electron's `net`), through `--log-net-log` from launch;
  - Node's in the main process (`fetch`, `http`), through `diagnostics_channel`.
- **Recorder check.** The journey sends a probe request through `net.fetch`, then checks that both recorders saw traffic.
- **Fails on** any request to a host other than the server, and on a canary in `/v1/events` or in a URL.

**Not covered yet (§14):**
- mitmproxy as the system proxy, which would see traffic that bypasses both stacks;
- the gateway and STT vendor hosts, which are not configured yet, so nothing else is allowed;
- `human_recipient` insert checks, which need cards that use them.

## axe: `pnpm gates:axe`

`e2e/axe.e2e.ts` runs `@axe-core/playwright` (every rule) over the built app:
- in the light and dark themes, set through both `prefers-color-scheme` and the app's own `promptai.mode`;
- at 320, 390 and 1280 px;
- on each screen the app has today: the ask form, then a draft with its chips.

It fails on serious or critical violations. When W3 adds places (Library, You), add their screens here.

## Signed content bundle (`packages/bundle`)

"Plugins are data" (§16): the catalog ships as one signed bundle, TUF-lite.

```
two offline root keys --sign--> delegation.json: one CI key, role content-bundle, valid ≤12 months
the CI key            --signs--> meta.json: { version, expires (≤30 days), channel, minClientVersion, bundleHash }
bundleHash = sha256 of the manifest (every file's path, size and sha256, sorted)
```

Signatures are ed25519 (`node:crypto`) over canonical JSON (sorted keys, no whitespace). Public keys are the raw 32 bytes in base64url. A key id is the sha256 of a public key.

**Layout** (`pnpm bundle:build`, `pnpm bundle:sign`):

```
dist/bundle/
  files/<catalog paths>    every catalog file except dotfiles
  files.json               the manifest (for people and diffs; verify recomputes it)
  meta.json                canonical JSON
  signatures.json          { delegation, rootSignatures: [2], meta }
```

**API** (`@promptai/bundle`):
- `buildBundle(catalogDir)` → `{ files, manifest, bundleHash }`
- `createMeta({ bundleHash, version, channel, minClientVersion, now, ttlDays ≤ 30 })`
- `createDelegation({ publicKey, notBefore, months ≤ 12 })`, `signDelegation(delegation, rootPem)`, `signMeta(meta, ciPem)`
- `verifyBundle(files, meta, signatures, trustedRoots, { now, channel, clientVersion, lastSeenVersion? })` → `{ ok: true, meta, manifest }` or `{ ok: false, code, reason }`. It never throws on bad bundle data.
- `loadBundle(dir, trustedRoots, opts)` reads `dist/bundle` and verifies it. On success it returns the verified files. Use those files, not a second read of the disk.

**Verify's failure codes:**

| Code | Meaning |
|---|---|
| `malformed` | Bad shape or unknown fields; a CI key delegated for more than 12 months |
| `wrong_role` | A delegation for another role, such as the updater |
| `untrusted_delegation` | Fewer than two distinct trusted roots signed the delegation |
| `ci_key_not_yet_valid` | The CI key's validity hasn't started yet |
| `ci_key_expired` | The CI key's delegation has expired |
| `unknown_key` | `meta.json` signed by a key other than the delegated one, a root included |
| `bad_signature` | `meta.json` edited after signing, or a forged signature |
| `expired` | `meta.json` past its expiry: a frozen or replayed bundle stops working |
| `expires_too_far` | An expiry more than 30 days ahead (plus 1 day of clock skew), so a bad signature can't freeze clients for long |
| `rollback` | A version below `lastSeenVersion` (equal is accepted) |
| `wrong_channel` | A bundle for another channel |
| `client_too_old` | `clientVersion` below `minClientVersion`, compared as dotted numbers |
| `tampered` | Files changed, added, removed or renamed; a meta from another bundle; an unsafe path |

On any failure the loader keeps the last good bundle. `packages/bundle/test/bundle.test.ts` has a test for each code.

**Commands** (from the repo root):
- `pnpm bundle:keys`: dev keys only. It writes `.keys/` (gitignored, mode 0600): `root-1.pem`, `root-2.pem`, `ci.pem`, `trusted-roots.json` and `delegation.json`, which delegates the CI key for 12 months. It refuses to overwrite existing keys.
- `pnpm bundle:build [--catalog catalog] [--out dist/bundle] [--version N] [--channel dev] [--min-client 0.0.0] [--ttl-days 30]`. The version defaults to the current Unix time in seconds, so it rises with every build. In CI, pass an increasing number.
- `pnpm bundle:sign [--out dist/bundle] [--key .keys/ci.pem] [--delegation .keys/delegation.json] [--roots .keys/trusted-roots.json]`. Without `--key`, it uses the PEM in `$PROMPTAI_BUNDLE_CI_KEY` when that is set. After signing, it verifies the bundle and exits 1 if verification fails.

### The real keys: offline procedure

Dev keys never sign a shipped bundle. For real keys:

1. **Root keys.** Two people each make one root key on an offline machine (a fresh OS, never networked) with `node packages/bundle/src/cli.ts keygen --out root-N.pem`. Each person keeps the private key on encrypted offline media, in two places. It never touches a networked machine. Record the printed public keys.
2. **Trusted roots.** Commit the two public keys as the trusted roots that clients and the server embed (the lead picks the file during integration). Rotating a root needs a client release.
3. **CI key.** Make the CI key on a trusted machine with `keygen --out ci.pem`. Store it as the GitHub Actions secret `PROMPTAI_BUNDLE_CI_KEY` in an environment with required reviewers, then delete the local copy.
4. **Delegation.** Carry the CI public key to root holder 1, who runs `node packages/bundle/src/cli.ts delegate --ci-public <key> --root root-1.pem --out delegation.json --months 12`. Carry `delegation.json` to root holder 2, who runs `delegate --root root-2.pem --out delegation.json`. Then commit `delegation.json`; it holds public data only.
5. **Rotation.** Repeat steps 3–4 with a new CI key before the delegation expires (12 months at most).
6. **Limit.** A stolen CI key stays usable until its delegation expires, because there is no revocation list yet. To cut that short, ship new trusted roots in a client release.

**Key roles stay separate** (documented here; only the first is built):
- The **content bundle** uses this package and role `content-bundle`. `verifyBundle` rejects a delegation for any other role.
- The **desktop updater** gets its own ed25519 keys and roots for update metadata (electron-builder or Sparkle style).
- **Code signing** uses the Apple Developer ID and the Windows signing certificates, which the OS vendors' chains manage.

Never reuse a key across roles. A compromised updater or code-signing key must not be able to sign catalog content, and the reverse holds too.

## CI: `.github/workflows/rebuild.yml`

The workflow runs on pull requests and on pushes to `main` and `phase-*/**` that touch any of these paths:
- `apps/**`, `packages/**` or `catalog/**`;
- the root workspace files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json` and the three gate configs;
- the workflow itself.

| Job | Runner | Steps |
|---|---|---|
| `verify` | ubuntu-latest | `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm build`, `pnpm gates:g1` |
| `web-gates` | ubuntu-latest | install, build, Playwright Chromium, `pnpm gates:gp web`, `pnpm gates:axe` |
| `desktop` | macos-latest | install, `test:smoke` (builds app and desktop), `pnpm gates:gp electron` |
| `zizmor` | ubuntu-latest | zizmor 1.32.0 on `rebuild.yml` (the legacy workflows are out of scope) |
| `gitleaks` | ubuntu-latest | the gitleaks 8.30.1 CLI, checksum-verified, over the full history |

**Hardening:**
- Every action is pinned to a full commit SHA, with the tag in a comment.
- The workflow token is `permissions: {}`, and each job asks for `contents: read` only.
- Checkouts don't persist credentials.
- gitleaks runs as the MIT CLI rather than `gitleaks-action`, whose licence is not open source.

Check the workflow locally with `actionlint .github/workflows/rebuild.yml` and `uvx zizmor@1.32.0 .github/workflows/rebuild.yml`.

**Secrets:** none today. `GITHUB_TOKEN` (read-only) is enough. A bundle signing job would add `PROMPTAI_BUNDLE_CI_KEY`. Desktop releases add the Apple signing secrets listed in `apps/desktop/electron-builder.yml`.
