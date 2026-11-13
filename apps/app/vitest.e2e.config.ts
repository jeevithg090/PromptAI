import { defineConfig } from 'vitest/config';

// The PWA journey in a real Chromium (Playwright) against test/fake-server.ts. `pnpm test:e2e` builds as part of the test.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
