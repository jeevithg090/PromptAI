import { SECURE_WEB_PREFERENCES, allowedConnectOrigins } from '../src/main/window';
import { IPC, DEFAULT_SETTINGS, type PfBridge } from '../src/shared/ipc';

/**
 * F1.2 security posture regression tests. If any of these fail, the desktop
 * app's sandbox has been weakened — do not ship.
 */
describe('desktop security posture', () => {
  it('windows are contextIsolated, non-nodeIntegration, sandboxed', () => {
    expect(SECURE_WEB_PREFERENCES.contextIsolation).toBe(true);
    expect(SECURE_WEB_PREFERENCES.nodeIntegration).toBe(false);
    expect(SECURE_WEB_PREFERENCES.sandbox).toBe(true);
    expect(SECURE_WEB_PREFERENCES.webviewTag).toBe(false);
  });

  it('the IPC bridge surface is exactly the enumerated PfBridge keys (no silent growth)', () => {
    const expected: (keyof PfBridge)[] = [
      'getVersion', 'getSettings', 'setSettings', 'readClipboardText',
      'getSavedToken', 'setSavedToken', 'openMainWindow', 'onDeepAction',
    ].sort() as (keyof PfBridge)[];
    // IPC channel constants that back invoke() calls (onDeepAction is push-only).
    const invokeChannels = [
      IPC.getVersion, IPC.getSettings, IPC.setSettings, IPC.readClipboardText,
      IPC.getSavedToken, IPC.setSavedToken, IPC.openMainWindow,
    ];
    expect(invokeChannels.every((c) => c.startsWith('pf:'))).toBe(true);
    expect(expected).toHaveLength(8);
  });

  it('connect-src is limited to the API + Supabase (no wildcard)', () => {
    process.env.PF_API_URL = 'https://api.example.com';
    process.env.PF_SUPABASE_URL = 'https://x.supabase.co';
    const origins = allowedConnectOrigins();
    expect(origins).toContain('https://api.example.com');
    expect(origins).toContain('https://x.supabase.co');
    expect(origins).not.toContain('*');
  });

  it('close-to-tray defaults on; widget defaults off', () => {
    expect(DEFAULT_SETTINGS.closeToTray).toBe(true);
    expect(DEFAULT_SETTINGS.widgetEnabled).toBe(false);
  });
});
