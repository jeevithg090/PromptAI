import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build to ../dist/renderer so the main process loads dist/renderer/index.html.
// base:'./' makes asset URLs relative (required for file:// loading in Electron).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'index.html',
        widget: 'widget.html',
      },
    },
  },
  define: {
    'import.meta.env.PF_API_URL': JSON.stringify(process.env.PF_API_URL ?? 'https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com'),
    'import.meta.env.PF_SUPABASE_URL': JSON.stringify(process.env.PF_SUPABASE_URL ?? ''),
    'import.meta.env.PF_SUPABASE_ANON_KEY': JSON.stringify(process.env.PF_SUPABASE_ANON_KEY ?? ''),
  },
});
