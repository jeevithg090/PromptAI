import { defineConfig } from 'vitest/config';

// Most server tests start a fresh in-memory Postgres (PGlite) and migrate it,
// which overruns vitest's 5 s default on a loaded machine or a slow CI runner.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
