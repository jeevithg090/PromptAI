// Bundles main and preload with esbuild, then copies the built panel UI from @promptai/app.
import { cp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');

await rm(out, { recursive: true, force: true });
await build({
  entryPoints: { main: path.join(root, 'src/main.ts'), preload: path.join(root, 'src/preload.ts') },
  outdir: out,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'info',
});

if (!process.argv.includes('--no-renderer')) {
  const appDist = path.join(path.dirname(createRequire(import.meta.url).resolve('@promptai/app/package.json')), 'dist');
  try {
    await stat(path.join(appDist, 'index.html'));
  } catch {
    console.error(`No panel UI at ${appDist}. Run \`pnpm --filter @promptai/app build\` first.`);
    process.exit(1);
  }
  await cp(appDist, path.join(out, 'renderer'), { recursive: true });
}
