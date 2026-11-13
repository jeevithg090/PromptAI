import { defineConfig } from 'vitest/config';

// G-P privacy canary journeys (`pnpm gates:gp [web|electron]`). Needs `pnpm build` first.
export default defineConfig({
  test: {
    include: ['e2e/gp.*.e2e.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
