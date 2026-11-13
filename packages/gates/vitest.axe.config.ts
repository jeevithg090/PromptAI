import { defineConfig } from 'vitest/config';

// axe over the built app (`pnpm gates:axe`). Needs `pnpm build` first.
export default defineConfig({
  test: {
    include: ['e2e/axe.e2e.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
