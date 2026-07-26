import fs from 'node:fs';
import { readSettings, writeSettings, readSavedToken, writeSavedToken } from '../src/main/settings';
import { DEFAULT_SETTINGS } from '../src/shared/ipc';

// The electron mock points userData at /tmp/pf-desktop-test.
const DIR = '/tmp/pf-desktop-test';

beforeEach(() => {
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of ['settings.json', 'settings.json.tmp', 'session.enc', 'session.enc.tmp']) {
    try { fs.unlinkSync(`${DIR}/${f}`); } catch { /* ignore */ }
  }
});

describe('desktop settings store (F1.2)', () => {
  it('returns defaults when no file exists', () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and merges partial writes', () => {
    writeSettings({ widgetEnabled: true, widgetSkin: 'orb' });
    const s = readSettings();
    expect(s.widgetEnabled).toBe(true);
    expect(s.widgetSkin).toBe('orb');
    // Unspecified keys keep their defaults.
    expect(s.closeToTray).toBe(DEFAULT_SETTINGS.closeToTray);
  });

  it('round-trips the session token (encrypted at rest)', () => {
    writeSavedToken('secret-jwt');
    expect(readSavedToken()).toBe('secret-jwt');
    writeSavedToken(null);
    expect(readSavedToken()).toBeNull();
  });
});
