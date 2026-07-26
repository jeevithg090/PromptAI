import { app, Tray, Menu, nativeImage, clipboard } from 'electron';
import path from 'node:path';
import { readSettings, writeSettings } from './settings';
import { createMainWindow, getMainWindow } from './window';
import { toggleWidget } from './widget';
import type { DeepAction } from '../shared/ipc';
import { IPC } from '../shared/ipc';

/**
 * System tray / macOS menu-bar entry (F1.4). One-click reach at all times
 * without living in the Dock/taskbar. Close-to-tray is handled in index.ts;
 * the tray menu drives Open / New Draft / Enhance Clipboard / Toggle Widget /
 * Start at Login / Quit. Also registers the global hotkey that opens a New Draft.
 */
let tray: Tray | null = null;

function trayImage() {
  // On macOS a template image auto-adapts to menu-bar light/dark. On Windows we
  // ship the same shape (non-template) as a small tray icon.
  // Icons are copied into dist/ at build time (see package.json build script).
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'trayTemplate.png'));
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function sendDeepAction(action: DeepAction): void {
  const win = createMainWindow();
  win.webContents.once('did-finish-load', () => win.webContents.send(IPC.deepAction, action));
  // If already loaded, send immediately too.
  win.webContents.send(IPC.deepAction, action);
}

export function buildTrayMenu(appState: { isQuitting: boolean }): Menu {
  const s = readSettings();
  return Menu.buildFromTemplate([
    { label: 'Open PromptForge', click: () => { const w = getMainWindow() ?? createMainWindow(); w.show(); w.focus(); } },
    { label: 'New Draft', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendDeepAction({ kind: 'new-draft' }) },
    {
      label: 'Enhance Clipboard',
      click: () => {
        const text = clipboard.readText(); // explicit user action
        if (text.trim()) sendDeepAction({ kind: 'enhance-clipboard', text });
      },
    },
    { type: 'separator' },
    { label: 'Toggle Widget', type: 'checkbox', checked: s.widgetEnabled, click: () => { const next = !readSettings().widgetEnabled; writeSettings({ widgetEnabled: next }); toggleWidget(next); refreshTray(appState); } },
    { label: 'Start at Login', type: 'checkbox', checked: s.openAtLogin, click: () => { const next = !readSettings().openAtLogin; writeSettings({ openAtLogin: next }); app.setLoginItemSettings({ openAtLogin: next }); refreshTray(appState); } },
    { type: 'separator' },
    { label: 'Quit PromptForge', click: () => { appState.isQuitting = true; app.quit(); } },
  ]);
}

let currentAppState: { isQuitting: boolean } | null = null;

export function refreshTray(appState: { isQuitting: boolean }): void {
  if (tray) tray.setContextMenu(buildTrayMenu(appState));
}

export function initTray(appState: { isQuitting: boolean }): void {
  currentAppState = appState;
  tray = new Tray(trayImage());
  tray.setToolTip('PromptForge');
  tray.setContextMenu(buildTrayMenu(appState));

  // Windows: left-click toggles the main window; macOS uses the menu (convention).
  if (process.platform === 'win32') {
    tray.on('click', () => {
      const w = getMainWindow();
      if (w && w.isVisible()) w.hide();
      else { const win = getMainWindow() ?? createMainWindow(); win.show(); win.focus(); }
    });
  }

  // The single global hotkey is owned by the widget module (F1.5): it toggles
  // the quick panel when the widget is enabled, else opens a New Draft.
  void currentAppState;
}

/** Exposed so the widget's hotkey can open a New Draft when the widget is off. */
export function triggerNewDraft(): void {
  sendDeepAction({ kind: 'new-draft' });
}
