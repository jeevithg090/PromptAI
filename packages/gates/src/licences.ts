/**
 * The licence rule's transitive half (docs/blueprint/BLUEPRINT.md §13): no
 * production dependency of any workspace package, direct or not, may be AGPL,
 * SSPL, BUSL or GPL (LGPL included); a missing licence needs a person to read
 * it. dependency-cruiser checks what src/ imports (.dependency-cruiser.cjs,
 * rule "licence"), which covers apps/desktop's bundled devDependencies.
 *
 *   node packages/gates/src/licences.ts      (part of `pnpm deps`)
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const FORBIDDEN = /GPL|SSPL|BUSL/i;
const UNREAD = /^(?:unknown|unlicensed|see license in\b.*)$/i;

/** An SPDX expression passes when at least one OR branch has only allowed licences. */
export function licenceAllowed(expression: string): boolean {
  const branches = expression.replace(/[()]/g, ' ').split(/\s+OR\s+/i);
  return branches.some((branch) =>
    branch
      .split(/\s+AND\s+/i)
      .map((id) => id.trim())
      .every((id) => id !== '' && !FORBIDDEN.test(id) && !UNREAD.test(id)),
  );
}

type LicenceList = Record<string, Array<{ name: string; versions: string[]; license?: string }>>;

/** `pnpm licenses list --prod --json -r` output -> one line per offending package. */
export function violations(list: LicenceList): string[] {
  const out: string[] = [];
  for (const [group, pkgs] of Object.entries(list)) {
    for (const p of pkgs) {
      const licence = p.license ?? group;
      if (!licenceAllowed(licence)) out.push(`${p.name}@${p.versions.join(', ')}: ${licence}`);
    }
  }
  return out.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const list = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json', '--recursive'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as LicenceList;
  const bad = violations(list);
  const count = Object.values(list).reduce((n, pkgs) => n + pkgs.length, 0);
  if (bad.length > 0) {
    console.error(`licences: ${bad.length} production dependenc${bad.length === 1 ? 'y breaks' : 'ies break'} the licence rule (no AGPL, SSPL, BUSL or GPL; read unknown ones):`);
    for (const line of bad) console.error(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log(`licences: ${count} production dependencies, none AGPL, SSPL, BUSL, GPL or unknown.`);
  }
}
