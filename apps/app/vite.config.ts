import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** A strict CSP for built pages (dev keeps Vite's inline HMR preamble working). */
function csp(serverUrl: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${new URL(serverUrl).origin}`,
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
  return {
    // Relative asset URLs, so dist/ also loads from file:// inside Electron.
    base: './',
    plugins: [react(), csp(env.VITE_PROMPTAI_SERVER_URL ?? 'http://localhost:8787')],
    build: { target: 'es2023' },
    server: { port: 5173, strictPort: true },
  };
});
