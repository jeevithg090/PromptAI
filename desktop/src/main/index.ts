import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC, type DesktopSettings } from '../shared/ipc';
import { readSettings, writeSettings, readSavedToken, writeSavedToken } from './settings';
import { createMainWindow, getMainWindow } from './window';
import { initTray } from './tray';
import { initWidget, setWidgetEnabled } from './widget';

/** Set by the tray "Quit" / Cmd+Q so close-to-tray doesn't trap the app (F1.4). */
export const appState = { isQuitting: false };

// Single-instance lock — re-focus the existing window instead of opening a second app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      createMainWindow();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    const win = createMainWindow();

    // Close-to-tray (F1.4): hide instead of quit unless the user is really quitting.
    win.on('close', (e) => {
      if (!appState.isQuitting && readSettings().closeToTray) {
        e.preventDefault();
        win.hide();
      }
    });

    initTray(appState);
    initWidget(appState);
    setWidgetEnabled(readSettings().widgetEnabled);

    // Auto-update against GitHub Releases (F1.2) — silent-fail offline.
    autoUpdater.autoDownload = true;
    autoUpdater.on('error', () => { /* offline / no release — ignore */ });
    void autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => void autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else getMainWindow()?.show();
    });
  });

  app.on('window-all-closed', () => {
    // Stay resident in the tray on all platforms; real quit goes through appState.
    if (process.platform !== 'darwin' && appState.isQuitting) app.quit();
  });

  app.on('before-quit', () => {
    appState.isQuitting = true;
  });
}

function registerIpc(): void {
  ipcMain.handle(IPC.getVersion, () => app.getVersion());
  ipcMain.handle(IPC.getSettings, () => readSettings());
  ipcMain.handle(IPC.setSettings, (_e, partial: Partial<DesktopSettings>) => {
    const merged = writeSettings(partial);
    if ('openAtLogin' in partial) app.setLoginItemSettings({ openAtLogin: merged.openAtLogin });
    if ('widgetEnabled' in partial) setWidgetEnabled(merged.widgetEnabled);
    return merged;
  });
  // Clipboard read is only ever triggered by an explicit user click in the renderer.
  ipcMain.handle(IPC.readClipboardText, () => clipboard.readText());
  ipcMain.handle(IPC.getSavedToken, () => readSavedToken());
  ipcMain.handle(IPC.setSavedToken, (_e, token: string | null) => writeSavedToken(token));
  ipcMain.handle(IPC.openMainWindow, () => { createMainWindow(); });
}
