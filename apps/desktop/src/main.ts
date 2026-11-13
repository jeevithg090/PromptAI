/**
 * Electron main: spawns pf-native, owns the Draft sheet panel and runs the flow.
 * Env: PROMPTAI_NATIVE_BIN (helper path), PROMPTAI_SERVER_URL (forge server),
 * PROMPTAI_APP_URL (load the panel from a Vite dev server instead of dist/).
 */
import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { createFlow, HOTKEY } from './flow.ts';
import { createForgeClient } from './forge.ts';
import { IPC } from './ipc.ts';
import { createNativeClient } from './native.ts';

const PANEL = { width: 520, height: 640 };

const nativeBin =
  process.env.PROMPTAI_NATIVE_BIN ??
  (app.isPackaged
    ? path.join(process.resourcesPath, 'pf-native')
    : path.resolve(__dirname, '..', '..', 'native-macos', 'bin', 'pf-native'));
const serverUrl = process.env.PROMPTAI_SERVER_URL ?? 'http://localhost:8787';

let panel: BrowserWindow | null = null;
let quitting = false;

function createPanel(): BrowserWindow {
  const win = new BrowserWindow({
    // An NSPanel that never activates our app, so the user's app keeps focus.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    ...PANEL,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hiddenInMissionControl: true,
    title: 'PromptAI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  if (process.env.PROMPTAI_APP_URL) void win.loadURL(process.env.PROMPTAI_APP_URL);
  else void win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

function showPanel() {
  if (!panel) return;
  if (!panel.isVisible()) {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    panel.setPosition(
      Math.round(workArea.x + (workArea.width - PANEL.width) / 2),
      Math.round(workArea.y + workArea.height * 0.12),
    );
  }
  panel.showInactive();
}

app.whenReady().then(() => {
  panel = createPanel();

  const flow = createFlow({
    native: { request: (cmd) => native.request(cmd) },
    forge: createForgeClient(serverUrl),
    panel: { show: showPanel, hide: () => panel?.hide() },
    clipboard: { writeText: (text) => clipboard.writeText(text) },
  });
  flow.subscribe((state) => panel?.webContents.send(IPC.state, state));

  const native = createNativeClient({
    bin: nativeBin,
    onEvent(event) {
      if (event.event === 'ready') {
        // On every (re)start of the helper.
        native
          .request({ cmd: 'hotkey.register', keyCode: HOTKEY.keyCode, modifiers: [...HOTKEY.modifiers] })
          .catch((err: unknown) => console.error(`[promptai] hotkey.register failed: ${String(err)}`));
        return;
      }
      void flow.handleNative(event);
    },
  });

  const handle = (channel: string, fn: (...args: string[]) => unknown) =>
    ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (e.sender !== panel?.webContents) throw new Error('unexpected sender');
      return fn(...args.map(String));
    });
  handle(IPC.getState, () => flow.getState());
  handle(IPC.insert, () => flow.insert());
  handle(IPC.copy, () => flow.copy());
  handle(IPC.answerChip, (slotId = '', value = '') => flow.answerChip(slotId, value));
  handle(IPC.retry, () => flow.retry());
  handle(IPC.dismiss, () => flow.dismiss());

  app.on('before-quit', () => {
    quitting = true;
    native.close();
  });
});

// The panel hides instead of closing; the app lives until it is quit.
app.on('window-all-closed', () => {});
