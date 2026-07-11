import { build, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';

const srcDir = resolve(import.meta.dirname, '..', 'src');
const outDir = resolve(import.meta.dirname, '..', 'dist');

const backgroundConfig = defineConfig({
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
    lib: {
      entry: resolve(srcDir, 'background', 'index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
    sourcemap: false,
  },
});

const contentConfig = defineConfig({
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: resolve(srcDir, 'content', 'index.tsx'),
      formats: ['iife'],
      name: 'PromptForgeContent',
      fileName: () => 'content.js',
    },
    sourcemap: false,
  },
});

async function main() {
  await build(backgroundConfig);
  await build(contentConfig);

  copyFileSync(resolve(srcDir, 'manifest.json'), resolve(outDir, 'manifest.json'));

  const iconsSrc = resolve(srcDir, 'icons');
  if (existsSync(iconsSrc)) {
    const iconsDest = resolve(outDir, 'icons');
    if (!existsSync(iconsDest)) mkdirSync(iconsDest, { recursive: true });
    for (const f of readdirSync(iconsSrc)) {
      copyFileSync(resolve(iconsSrc, f), resolve(iconsDest, f));
    }
  }

  console.log('Build complete: dist/');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exitCode = 1;
});
