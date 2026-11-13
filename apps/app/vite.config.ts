import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

/** A strict CSP for built pages (dev keeps Vite's inline HMR preamble working). */
function csp(connect: string[]): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
  return {
    name: 'promptai-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const connect = [new URL(env.VITE_PROMPTAI_SERVER_URL ?? 'http://localhost:8787').origin];
  if (env.VITE_SUPABASE_URL) connect.push(new URL(env.VITE_SUPABASE_URL).origin);
  return {
    // Relative asset URLs, so dist/ also loads from file:// inside Electron.
    base: './',
    plugins: [
      react(),
      // Compiles the .po catalogs on import and the Lingui macros natively (no Babel).
      lingui({ macroTransform: true, configPath: fileURLToPath(new URL('./lingui.config.ts', import.meta.url)) }),
      VitePWA({
        // main.tsx registers the worker itself, and only on http(s): Electron loads file:// and has no use for it.
        injectRegister: false,
        registerType: 'autoUpdate',
        manifest: {
          name: 'PromptAI',
          short_name: 'PromptAI',
          description: 'Say it roughly; get an ask whose first answer is usable.',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#b23809',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        // The offline app shell: every built asset is precached; navigations fall back to index.html
        // (routes are hash-based). API calls go to another origin and are never cached.
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
      }),
      csp(connect),
    ],
    build: { target: 'es2023' },
    server: { port: 5173, strictPort: true },
  };
});
