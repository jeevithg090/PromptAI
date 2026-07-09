// k6 load test for POST /draft (T3.7, §31.4 Step 27).
//
// k6 is a standalone Go binary — NOT an npm dependency (keeps the backend deps
// minimal, §32). Install: `brew install k6` (macOS) or see https://k6.io/docs.
//
// Run against a LOCAL mock-mode server so we measure OUR orchestration, not a
// provider's rate limits (Groq free tier is 30 req/min — a real-provider run
// would just measure Groq throttling). Start the server first:
//
//   cd backend
//   npm run build
//   PROVIDER_FORCE_MOCK=true DEV_AUTH_BYPASS=true node dist/index.js
//   k6 run load/draft-load.js
//
// Config via env: K6_BASE_URL (default http://localhost:3001), K6_TOKEN (any
// value works under DEV_AUTH_BYPASS).

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3001';
const TOKEN = __ENV.K6_TOKEN || 'dev';

// A spread of ideas so we're not drafting the identical prompt every iteration.
const IDEAS = [
  'a horse running through a field',
  'a cozy bookshop on a rainy evening',
  'a lone astronaut watching earthrise',
  'a neon-lit street market at night',
  'a red bicycle leaning on a wall',
  'a mountain lake at golden hour',
  'a futuristic city skyline',
  'a bowl of ramen, steam rising',
  'a fox in a snowy forest',
  'a vintage car on a desert road',
];

export const options = {
  scenarios: {
    draft: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 }, // ramp up to 100 concurrent users
        { duration: '1m', target: 100 },  // hold
        { duration: '30s', target: 0 },   // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // §31.4 Step 27 success criteria.
    http_req_duration: ['p(50)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const idea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  const res = http.post(
    `${BASE_URL}/draft`,
    JSON.stringify({ platform_id: 'midjourney', idea, just_generate: true }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'reached ready_for_review': (r) => {
      try {
        return JSON.parse(r.body).final_state === 'ready_for_review';
      } catch {
        return false;
      }
    },
  });
}
