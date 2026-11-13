import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';

export default defineConfig({
  plugins: [react(), lingui({ macroTransform: true })],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // The journeys render whole places in jsdom; a busy machine (pnpm -r runs packages at once) needs the headroom.
    testTimeout: 20_000,
  },
});
