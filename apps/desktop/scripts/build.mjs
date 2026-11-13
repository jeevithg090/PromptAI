// Bundles main and preload with esbuild for one channel (PROMPTAI_CHANNEL, scripts/channels.mjs),
// fails if the bundle reaches code the channel forbids, then copies the built panel UI from @promptai/app.
import { cp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { assertChannel, channelDefines, channelFrom } from './channels.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
const channel = channelFrom(process.env);

/** The esbuild options for one channel; test/channels.test.ts builds with them too. */
export function bundleOptions(name) {
  return {
    absWorkingDir: root,
    entryPoints: { main: 'src/main.ts', preload: 'src/preload.ts' },
    outdir: out,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    define: channelDefines(name),
    // Folds the channel flags so a forbidden branch is gone from the bundle, not just unreachable.
    minifySyntax: true,
    metafile: true,
  };
}

if (process.argv[1] === import.meta.filename) {
  await rm(out, { recursive: true, force: true });
  const result = await build({ ...bundleOptions(channel), sourcemap: 'linked', logLevel: 'info' });
  assertChannel(result.metafile, channel);
  console.log(`channel: ${channel}`);

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
}
