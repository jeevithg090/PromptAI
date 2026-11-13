// Dev loop: the panel UI from Vite (hot reload), main and preload rebuilt once, then Electron.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const APP_URL = 'http://localhost:5173';
const run = (cmd, args, env = {}) => spawn(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

const built = run(process.execPath, ['scripts/build.mjs', '--no-renderer']);
if ((await new Promise((r) => built.on('exit', r))) !== 0) process.exit(1);

const vite = run('pnpm', ['--filter', '@promptai/app', 'dev']);
for (let i = 0; ; i++) {
  try {
    await fetch(APP_URL);
    break;
  } catch {
    if (i > 100) throw new Error(`Vite did not start on ${APP_URL}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const electron = run(createRequire(import.meta.url)('electron'), ['.'], { PROMPTAI_APP_URL: APP_URL });
electron.on('exit', (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
