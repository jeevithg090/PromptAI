import { describe, expect, it } from 'vitest';
import { t } from '@lingui/core/macro';
import { activate } from './index.ts';
import { directionOf, scriptOf } from './direction.ts';

describe('direction from the script table', () => {
  it('derives the script, then the direction', () => {
    expect(scriptOf('ur')).toBe('Arab');
    expect(scriptOf('hi')).toBe('Deva');
    expect(['en', 'en-IN', 'hi', 'ja', 'pseudo'].map(directionOf)).toEqual(['ltr', 'ltr', 'ltr', 'ltr', 'ltr']);
    expect(['ar', 'he', 'fa', 'ur', 'ps', 'dv'].map(directionOf)).toEqual(['rtl', 'rtl', 'rtl', 'rtl', 'rtl', 'rtl']);
  });
});

describe('catalogs', () => {
  it('serves English, and a pseudo-locale that marks every string', () => {
    activate('pseudo');
    const pseudo = t`Library`;
    activate('en');
    expect(t`Library`).toBe('Library');
    expect(pseudo).toMatch(/^⟦.+⟧$/);
    expect(pseudo).not.toBe('Library');
  });
});
