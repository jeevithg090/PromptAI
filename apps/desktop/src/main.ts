/**
 * Electron main: spawns pf-native, owns the Draft sheet panel and runs the flow.
 * Env: PROMPTAI_NATIVE_BIN (helper path), PROMPTAI_SERVER_URL (forge server),
 * PROMPTAI_APP_URL (load the panel from a Vite dev server instead of dist/),
 * PROMPTAI_USER_DATA (a userData folder of its own, for tests).
 * The channel (direct | mas-lite) is fixed at build time: scripts/channels.mjs.
 */
import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { createHttpApi } from '@promptai/app/api';
import { createEventQueue } from '@promptai/app/events-queue';
import { createApiProxy } from './api-proxy.ts';
import { createAutoPaste } from './auto-paste.ts';
import { fileQueueStore } from './events-store.ts';
import { lookupPack, matchVoiceCommand, parseLocalePack } from '@promptai/core';
import enPack from '../../../catalog/locales/en/pack.yaml';
import enInPack from '../../../catalog/locales/en-IN/pack.yaml';
import hiLatnPack from '../../../catalog/locales/hi-Latn/pack.yaml';
import { createFlow, HOTKEY, LOCALE } from './flow.ts';
import { toFlowCommand } from './voice.ts';
import { createForgeClient } from './forge.ts';
import { IPC } from './ipc.ts';
import { createNativeClient } from './native.ts';

/** The voice-command grammar for the dictation locale (catalog/locales). */
const voicePack = lookupPack([enPack, enInPack, hiLatnPack].map(parseLocalePack), LOCALE);

const PANEL = { width: 520, height: 640 };

if (process.env.PROMPTAI_USER_DATA) app.setPath('userData', process.env.PROMPTAI_USER_DATA);

const nativeBin =
  process.env.PROMPTAI_NATIVE_BIN ??
  (app.isPackaged
    ? path.join(process.resourcesPath, 'pf-native')
    : path.resolve(__dirname, '..', '..', 'native-macos', 'bin', 'pf-native'));
const serverUrl = process.env.PROMPTAI_SERVER_URL ?? 'http://localhost:8787';

let panel: BrowserWindow | null = null;
let quitting = false;
/** From the panel: the bearer token for /v1, and whether first run is done. */
let session: { token: string | null; ready: boolean; incognito: boolean } = { token: null, ready: false, incognito: false };

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

  const token = () => session.token;
  const forgeClient = createForgeClient(serverUrl, fetch, 30_000, token);
  const server = createHttpApi({ baseUrl: serverUrl, token });
  const events = createEventQueue({
    send: (batch) => server.sendEvents(batch),
    store: fileQueueStore(path.join(app.getPath('userData'), 'events-queue.json')),
    log: (m) => console.error(`[events] ${m}`),
  });

  const flow = createFlow({
    native: { request: (cmd) => native.request(cmd) },
    forge: {
      // Incognito (set from the panel's You place) rides on every draft request.
      forge: (req) => forgeClient.forge(session.incognito ? { ...req, incognito: true } : req),
    },
    panel: { show: showPanel, hide: () => panel?.hide() },
    clipboard: { writeText: (text) => clipboard.writeText(text) },
    // A literal from the build, so a mas-lite bundle drops auto-paste.ts entirely (scripts/build.mjs checks).
    autoPaste: __PROMPTAI_AUTO_PASTE__ ? createAutoPaste({ request: (cmd) => native.request(cmd) }) : null,
    events: {
      track(type, props) {
        try {
          events.track(type, props);
        } catch (err) {
          console.error(`[events] ${String(err)}`);
        }
      },
    },
    // Speaking while a draft is on screen runs a command on it ("insert", "make it shorter").
    matchVoiceCommand: (transcript) => {
      const spoken = voicePack ? matchVoiceCommand(transcript, voicePack) : null;
      return spoken ? toFlowCommand(spoken) : null;
    },
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
      // First run (date of birth, consent) comes before any use: the hotkey shows the panel, and only that.
      if (event.event === 'hotkey' && !session.ready) {
        if (event.state === 'down') showPanel();
        return;
      }
      void flow.handleNative(event);
    },
  });

  const fromPanel = (e: IpcMainInvokeEvent) => {
    if (e.sender !== panel?.webContents) throw new Error('unexpected sender');
  };
  const handle = (channel: string, fn: (...args: string[]) => unknown) =>
    ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      fromPanel(e);
      return fn(...args.map(String));
    });
  handle(IPC.getState, () => flow.getState());
  handle(IPC.insert, () => flow.insert());
  handle(IPC.copy, () => flow.copy());
  handle(IPC.answerChip, (slotId = '', value = '') => flow.answerChip(slotId, value));
  handle(IPC.retry, () => flow.retry());
  handle(IPC.dismiss, () => flow.dismiss());
  handle(IPC.rate, (rating = '') => flow.rate(rating));
  ipcMain.handle(IPC.setSession, (e, s: { token?: unknown; ready?: unknown; incognito?: unknown } | null) => {
    fromPanel(e);
    session = { token: typeof s?.token === 'string' ? s.token : null, ready: s?.ready === true, incognito: s?.incognito === true };
    // First run (date of birth, consent) shows itself right after install rather than waiting for the hotkey.
    if (!session.ready) showPanel();
    if (session.token) void events.flush();
  });
  const proxy = createApiProxy(serverUrl);
  ipcMain.handle(IPC.api, (e, req: unknown) => {
    fromPanel(e);
    return proxy(req);
  });

  app.on('before-quit', () => {
    quitting = true;
    native.close();
    void events.flush();
  });
});

// The panel hides instead of closing; the app lives until it is quit.
app.on('window-all-closed', () => {});
