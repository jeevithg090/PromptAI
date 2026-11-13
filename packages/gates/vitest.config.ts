import { defineConfig } from 'vitest/config';

// Unit tests (part of `pnpm test`). The browser and Electron journeys have their own configs.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
