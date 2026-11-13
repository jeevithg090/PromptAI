import { defineConfig } from 'vitest/config';

// The Electron smoke test; `pnpm test:smoke` builds first.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
