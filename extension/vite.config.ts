import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Standalone Vite config for interactive development.
// Production builds use scripts/build.mjs for dual-format output.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src', 'background', 'index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
    sourcemap: false,
  },
});
