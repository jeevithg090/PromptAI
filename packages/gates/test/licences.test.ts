import { describe, expect, it } from 'vitest';
import { licenceAllowed, violations } from '../src/licences.ts';

describe('licence rule', () => {
  it.each(['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', '(MIT OR Apache-2.0)', 'MIT OR GPL-3.0', 'MPL-2.0', 'BlueOak-1.0.0'])('allows %s', (id) => {
    expect(licenceAllowed(id)).toBe(true);
  });

  it.each(['GPL-3.0', 'AGPL-3.0-only', 'LGPL-2.1-or-later', 'SSPL-1.0', 'BUSL-1.1', 'MIT AND GPL-2.0', '(GPL-2.0 OR AGPL-3.0)', 'Unknown', 'UNLICENSED', 'SEE LICENSE IN LICENSE.md', ''])(
    'refuses %s',
    (id) => {
      expect(licenceAllowed(id)).toBe(false);
    },
  );

  it('lists offending packages from pnpm licenses output', () => {
    expect(
      violations({
        MIT: [{ name: 'ok', versions: ['1.0.0'], license: 'MIT' }],
        'AGPL-3.0': [{ name: 'bad', versions: ['2.0.0', '2.1.0'], license: 'AGPL-3.0' }],
        Unknown: [{ name: 'unread', versions: ['0.1.0'] }],
      }),
    ).toEqual(['bad@2.0.0, 2.1.0: AGPL-3.0', 'unread@0.1.0: Unknown']);
  });
});
