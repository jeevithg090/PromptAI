// Minimal electron mock for unit tests (F1.2). Only what the modules touch.
export const app = {
  getPath: () => '/tmp/pf-desktop-test',
  getVersion: () => '0.1.0',
  setLoginItemSettings: () => {},
  getLoginItemSettings: () => ({ openAtLogin: false }),
};
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s, 'utf-8'),
  decryptString: (b: Buffer) => b.toString('utf-8'),
};
export const BrowserWindow = class {};
export const ipcMain = { handle: () => {} };
export const clipboard = { readText: () => '' };
export const shell = { openExternal: () => {} };
export const session = { defaultSession: { webRequest: { onHeadersReceived: () => {} } } };
export const Tray = class {
  setToolTip() {}
  setContextMenu() {}
  on() {}
};
// Return the template so tests can assert labels / checked states.
export const Menu = { buildFromTemplate: (template: unknown) => template };
export const globalShortcut = { register: () => true, unregisterAll: () => {} };
export const screen = { getAllDisplays: () => [], getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) };
export const nativeImage = { createFromPath: () => ({ setTemplateImage: () => {} }), createEmpty: () => ({}) };
