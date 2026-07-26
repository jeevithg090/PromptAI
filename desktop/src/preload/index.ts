import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type DesktopSettings, type DeepAction, type PfBridge } from '../shared/ipc';

/**
 * Preload (F1.2) — the ONLY bridge from the sandboxed renderer to the main
 * process. Exposes exactly the `PfBridge` surface; nothing else. Raw
 * `ipcRenderer` is never handed to the page.
 */
const bridge: PfBridge = {
  getVersion: () => ipcRenderer.invoke(IPC.getVersion),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (partial: Partial<DesktopSettings>) => ipcRenderer.invoke(IPC.setSettings, partial),
  readClipboardText: () => ipcRenderer.invoke(IPC.readClipboardText),
  getSavedToken: () => ipcRenderer.invoke(IPC.getSavedToken),
  setSavedToken: (token: string | null) => ipcRenderer.invoke(IPC.setSavedToken, token),
  openMainWindow: () => ipcRenderer.invoke(IPC.openMainWindow),
  onDeepAction: (cb: (action: DeepAction) => void) => {
    ipcRenderer.on(IPC.deepAction, (_e, action: DeepAction) => cb(action));
  },
};

contextBridge.exposeInMainWorld('pf', bridge);
