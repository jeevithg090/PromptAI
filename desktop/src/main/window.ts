import { BrowserWindow, shell, session } from 'electron';
import path from 'node:path';

/**
 * Hardened BrowserWindow web preferences (F1.2, rule 11). Exported so a test
 * can assert the security posture never regresses.
 */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webviewTag: false,
  // preload is added at window-creation time (absolute path).
} as const;

/** API + Supabase origins the renderer is allowed to reach (CSP connect-src). */
export function allowedConnectOrigins(): string[] {
  const api = process.env.PF_API_URL ?? 'https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com';
  const supa = process.env.PF_SUPABASE_URL ?? '';
  return [api, supa].filter(Boolean);
}

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false, // avoid white flash — show on ready-to-show
    backgroundColor: '#0b0d12',
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  });

  // Strict CSP — local renderer only; network limited to the API + Supabase.
  const connect = allowedConnectOrigins().join(' ');
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob:; connect-src 'self' ${connect}; media-src 'self' blob:; ` +
            `object-src 'none'; frame-src 'none'; base-uri 'none'`,
        ],
      },
    });
  });

  // Deny all navigation away from the local renderer; open external links in the OS browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());

  const rendererIndex = path.join(__dirname, '..', 'renderer', 'index.html');
  void win.loadFile(rendererIndex);

  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });
  return win;
}
