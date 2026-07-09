# Load testing (T3.7 · §31.4 Step 27)

`draft-load.js` is a [k6](https://k6.io) scenario that drives 100 concurrent
users at `POST /draft` and asserts latency + error-rate thresholds.

## Why mock-provider mode

The test runs against a **local server in `PROVIDER_FORCE_MOCK` mode** so it
measures *our* orchestration (state machine, serialization, scoring, DB writes),
not a model provider's throughput. Groq's free tier caps at ~30 requests/minute,
so a real-provider run at 100 VUs would just measure Groq throttling, not our
code. `PROVIDER_FORCE_MOCK` swaps every `generate()` call for a deterministic
mock that returns step-appropriate canned JSON, so the full pipeline still runs.

`PROVIDER_FORCE_MOCK` is **refused at startup in production** (`config/env.ts`) —
it can never serve real traffic.

## Run it locally

```bash
# 1. install k6 (standalone binary, not an npm dep)
brew install k6            # macOS; else https://k6.io/docs/get-started/installation

# 2. start the backend in mock mode
cd backend
npm run build
# RATE_LIMIT_REQUESTS_PER_MINUTE must be raised: under DEV_AUTH_BYPASS every VU
# is the same user (dev-user-000), so the default 30/min throttles the whole run
# to ~30 requests (see "Finding" below).
PROVIDER_FORCE_MOCK=true DEV_AUTH_BYPASS=true RATE_LIMIT_REQUESTS_PER_MINUTE=100000000 node dist/index.js

# 3. in another shell, run the load test
cd backend
k6 run load/draft-load.js
# save a run:  k6 run load/draft-load.js | tee load/results-$(date +%Y-%m-%d).txt
```

Config via env: `K6_BASE_URL` (default `http://localhost:3001`), `K6_TOKEN`
(any value under `DEV_AUTH_BYPASS`).

## Thresholds (the pass/fail bar)

| Metric | Threshold | Meaning |
|---|---|---|
| `http_req_duration` p(50) | < 2000 ms | median request under 2s |
| `http_req_duration` p(99) | < 5000 ms | 99th percentile under 5s |
| `http_req_failed` | rate < 0.01 | fewer than 1% failed requests |

k6 exits non-zero if any threshold is breached, so this is CI-gate-able.

## Real-provider capacity note

Mock mode measures our ceiling. **Production capacity is provider-bound** until a
paid tier:

- **Groq free tier:** ~30 requests/minute and per-minute token caps (TPM). At
  those limits, sustained concurrency well below 100 VUs will be throttled
  (HTTP 429 from Groq) regardless of how fast our code is.
- **Cerebras free tier:** faster per-call, but an 8,192-token context ceiling.

So the k6 numbers here are the *orchestration* ceiling. Real end-to-end capacity
scales with the provider plan; revisit when billing is added (§ pricing / T7.6).

## Results (2026-07-09, mock mode, 100 VUs, 2 min)

Full output in `results-2026-07-09.txt`. Thresholds **all passed**:

| Metric | Threshold | Result |
|---|---|---|
| `http_req_duration` p(50) | < 2000 ms | **30.15 ms** ✓ |
| `http_req_duration` p(99) | < 5000 ms | **334 ms** ✓ |
| `http_req_failed` | < 1% | **0.00%** ✓ |
| throughput | — | ~1,709 req/s (205,664 iterations, 100% checks passed) |

The orchestration is not the bottleneck — at 100 concurrent users it holds a 30 ms
median with zero errors. (Real end-to-end capacity is provider-bound; see above.)

### Finding: the in-memory rate limiter throttles a single-user load test

The first run failed with 99.99% errors at a 5 ms median — the classic shape of
everything being rejected instantly. Cause: under `DEV_AUTH_BYPASS` every VU
authenticates as `dev-user-000`, and the per-user limiter (`RATE_LIMIT_REQUESTS_
PER_MINUTE`, default 30) 429'd all traffic after ~30 requests. **The limiter works
as designed** — it's just measuring the limiter, not the pipeline. Fix for load
runs: raise `RATE_LIMIT_REQUESTS_PER_MINUTE` (as in the command above). Real
multi-user traffic wouldn't hit this because each user has an independent bucket.

## Tunings applied from this task

- `utils/db.ts` pool `max` is now `DB_POOL_MAX` (default **10** for a long-lived
  server; a Lambdalith sets `DB_POOL_MAX=3`).
- Session-metadata persistence and usage metering in `runPipeline` now run
  **concurrently** (`Promise.allSettled`) instead of two serial DB round-trips.
- Registry / config JSON is already read once and cached (`PlatformService`,
  routing table) — no per-request file I/O.
- pino pretty-printing is development-only; structured JSON logging in prod.
