/**
 * The dependency-cruiser rules (.dependency-cruiser.cjs) fire on a throwaway
 * workspace that breaks each one, and stay quiet on the allowed edges.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

const REPO = path.resolve(import.meta.dirname, '../../..');
const DEPCRUISE = path.join(REPO, 'node_modules/.bin/depcruise');

const tree: Record<string, string> = {
  'package.json': '{ "type": "module" }',
  'node_modules/undici/package.json': '{ "name": "undici", "license": "MIT", "main": "index.js" }',
  'node_modules/undici/index.js': 'export const fetch = 1;',
  'node_modules/agpl-lib/package.json': '{ "name": "agpl-lib", "license": "AGPL-3.0-only", "main": "index.js" }',
  'node_modules/agpl-lib/index.js': 'export const x = 1;',
  'node_modules/lgpl-lib/package.json': '{ "name": "lgpl-lib", "license": "LGPL-2.1", "main": "index.js" }',
  'node_modules/lgpl-lib/index.js': 'export const x = 1;',
  'node_modules/mit-lib/package.json': '{ "name": "mit-lib", "license": "MIT", "main": "index.js" }',
  'node_modules/mit-lib/index.js': 'export const x = 1;',

  'packages/contract/src/index.js': "import '../../core/src/ok.js';",
  'packages/core/src/ok.js': "import 'mit-lib';",
  'packages/core/src/fs.js': "import 'node:fs'; import 'path';",
  'packages/core/src/net.js': "import 'undici';",
  'packages/core/src/app.js': "import '../../../apps/server/src/ok.js';",
  'packages/core/test/reads-files.js': "import 'node:fs';",
  'packages/loop/src/a.js': "import './b.js';",
  'packages/loop/src/b.js': "import './a.js';",

  'apps/server/src/ok.js': "import '../../../packages/core/src/ok.js'; import 'node:fs';",
  'apps/server/src/desktop.js': "import '../../desktop/src/main.js';",
  'apps/server/src/app.js': "import '../../app/src/main.js';",
  'apps/server/src/agpl.js': "import 'agpl-lib';",
  'apps/server/src/lgpl.js': "import 'lgpl-lib';",
  'apps/server/test/dev-only.js': "import 'agpl-lib';",
  'apps/desktop/src/main.js': "import '../../app/src/main.js';",
  'apps/app/src/main.js': "import '../../../packages/contract/src/index.js';",
};

let dir: string;
let violations: string[];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'depcruise-'));
  for (const [file, text] of Object.entries(tree)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  let out: string;
  try {
    out = execFileSync(DEPCRUISE, ['apps', 'packages', '--config', path.join(REPO, '.dependency-cruiser.cjs'), '--output-type', 'json'], { cwd: dir, encoding: 'utf8' });
  } catch (err) {
    out = (err as { stdout: string }).stdout; // exits non-zero because there are violations
  }
  const result = JSON.parse(out) as { summary: { violations: Array<{ rule: { name: string }; from: string; to: string }> } };
  violations = result.summary.violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`).sort();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

it('flags each boundary break, and only those', () => {
  expect(violations).toEqual(
    [
      'apps-never-import-each-other: apps/server/src/desktop.js -> apps/desktop/src/main.js',
      'contract-is-a-leaf: packages/contract/src/index.js -> packages/core/src/ok.js',
      'core-no-io-packages: packages/core/src/net.js -> node_modules/undici/index.js',
      'core-no-node-builtins: packages/core/src/fs.js -> fs', // node:fs, reported without the prefix
      'core-no-node-builtins: packages/core/src/fs.js -> path',
      'licence: apps/server/src/agpl.js -> node_modules/agpl-lib/index.js',
      'licence: apps/server/src/lgpl.js -> node_modules/lgpl-lib/index.js',
      'no-circular: packages/loop/src/a.js -> packages/loop/src/b.js', // a cycle is reported once
      'only-desktop-imports-app: apps/server/src/app.js -> apps/app/src/main.js',
      'packages-never-import-apps: packages/core/src/app.js -> apps/server/src/ok.js',
    ].sort(),
  );
});
