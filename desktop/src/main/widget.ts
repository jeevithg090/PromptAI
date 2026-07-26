import { BrowserWindow, screen, globalShortcut, ipcMain, clipboard, app } from 'electron';
import path from 'node:path';
import { readSettings, writeSettings } from './settings';
import { snapToEdge, clampToWork, WIDGET_SIZE, panelPosition, type Rect } from './widgetGeometry';
import { createMainWindow, getMainWindow } from './window';
import { triggerNewDraft } from './tray';
import { IPC, type WidgetAction, type DeepAction } from '../shared/ipc';

/**
 * Floating assistant widget "Pulse" (F1.5). A frameless, transparent,
 * always-on-top window that docks to a screen edge, drags anywhere, remembers
 * its spot, and expands into a quick-action panel on click or global hotkey.
 * All the non-distraction rules (idle-fade, reduced-motion, no sound,
 * fullscreen auto-hide) live in the widget renderer; this module owns the
 * window, geometry, persistence, and hotkey.
 */
let widget: BrowserWindow | null = null;
let expanded = false;
let appStateRef: { isQuitting: boolean } | null = null;
const PANEL_W = 340;
const PANEL_H = 440;

function currentWork(): Rect {
  const disp = screen.getPrimaryDisplay();
  return disp.workArea;
}

function widgetSize(): number {
  return WIDGET_SIZE[readSettings().widgetSize];
}

function createWidgetWindow(): BrowserWindow {
  const size = widgetSize();
  const work = currentWork();
  const s = readSettings();
  const pos = clampToWork(s.widgetX, s.widgetY, size, work);

  const win = new BrowserWindow({
    width: size,
    height: size,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false, // we move it ourselves via IPC drag (no -webkit-app-region)
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '..', 'preload', 'widget.js'),
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  void win.loadFile(path.join(__dirname, '..', 'renderer', 'widget.html'));

  win.on('closed', () => { widget = null; expanded = false; });
  return win;
}

function collapse(): void {
  if (!widget) return;
  expanded = false;
  const size = widgetSize();
  const [x = 0, y = 0] = widget.getPosition();
  widget.setBounds({ x, y, width: size, height: size });
  widget.webContents.send(IPC.widgetCollapse);
}

function expand(): void {
  if (!widget) return;
  expanded = true;
  const size = widgetSize();
  const [x = 0, y = 0] = widget.getPosition();
  const panel = panelPosition({ x, y, width: size, height: size }, PANEL_W, PANEL_H, currentWork());
  // Grow the window to host the panel, positioned to stay on-screen.
  widget.setBounds({ x: panel.x, y: panel.y, width: PANEL_W, height: PANEL_H });
  widget.webContents.send(IPC.widgetExpand);
}

function toggleExpanded(): void {
  if (!widget) { setWidgetEnabled(true); return; }
  if (expanded) collapse(); else expand();
}

function persistPosition(x: number, y: number): void {
  const disp = screen.getDisplayNearestPoint({ x, y });
  writeSettings({ widgetX: x, widgetY: y, widgetDisplayId: disp.id });
}

function registerHotkey(): void {
  globalShortcut.unregisterAll();
  const hotkey = readSettings().widgetHotkey;
  const ok = globalShortcut.register(hotkey, () => {
    if (readSettings().widgetEnabled) toggleExpanded();
    else triggerNewDraft();
  });
  if (!ok) {
    // Conflict — the widget settings UI surfaces a warning (renderer reads this via state).
  }
}

export function initWidget(appState: { isQuitting: boolean }): void {
  appStateRef = appState;

  // Drag: the widget renderer reports pointer deltas; the main process moves the window.
  ipcMain.on(IPC.widgetDragMove, (_e, dx: number, dy: number) => {
    if (!widget || expanded) return;
    const [x = 0, y = 0] = widget.getPosition();
    widget.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on(IPC.widgetDragEnd, () => {
    if (!widget) return;
    const size = widgetSize();
    const [x = 0, y = 0] = widget.getPosition();
    const snapped = snapToEdge(x, y, size, currentWork());
    widget.setPosition(snapped.x, snapped.y);
    persistPosition(snapped.x, snapped.y);
  });
  ipcMain.on(IPC.widgetExpand, () => expand());
  ipcMain.on(IPC.widgetCollapse, () => collapse());
  ipcMain.handle(IPC.widgetGetState, () => {
    const s = readSettings();
    return { skin: s.widgetSkin, size: s.widgetSize, opacity: s.widgetOpacity, hotkey: s.widgetHotkey };
  });
  ipcMain.on(IPC.widgetAction, (_e, action: WidgetAction) => handleWidgetAction(action));

  // Clamp back into a visible display if monitors change / unplug.
  screen.on('display-metrics-changed', () => reclamp());
  screen.on('display-removed', () => reclamp());

  registerHotkey();
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

function reclamp(): void {
  if (!widget || expanded) return;
  const size = widgetSize();
  const s = readSettings();
  const pos = clampToWork(s.widgetX, s.widgetY, size, currentWork());
  widget.setPosition(pos.x, pos.y);
  persistPosition(pos.x, pos.y);
}

function handleWidgetAction(action: WidgetAction): void {
  const toMain = (deep: DeepAction) => {
    const win = getMainWindow() ?? createMainWindow();
    win.show();
    win.webContents.send(IPC.deepAction, deep);
  };
  if (action.kind === 'open-app') { const w = getMainWindow() ?? createMainWindow(); w.show(); w.focus(); }
  else if (action.kind === 'draft') toMain({ kind: 'new-draft' });
  else if (action.kind === 'dictate') toMain({ kind: 'dictate' });
  else if (action.kind === 'enhance-clipboard') {
    const text = clipboard.readText(); // explicit user action inside the panel
    if (text.trim()) toMain({ kind: 'enhance-clipboard', text });
  }
  collapse();
}

/** Enable/disable the widget window (F1.4 tray "Toggle Widget"). */
export function setWidgetEnabled(enabled: boolean): void {
  if (enabled) {
    if (!widget) widget = createWidgetWindow();
    widget.show();
  } else if (widget) {
    widget.close();
    widget = null;
  }
  void appStateRef;
}

export function toggleWidget(enabled: boolean): void {
  setWidgetEnabled(enabled);
}
