// Sandboxed preload: the panel gets this enumerated API and nothing else.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FlowState } from './flow.ts';
import { IPC, type PromptAIApi } from './ipc.ts';

const api: PromptAIApi = {
  platform: 'desktop',
  // Fixed by the build's channel profile (scripts/channels.mjs).
  caps: { insertAtCursor: __PROMPTAI_AUTO_PASTE__, dictation: true },
  onState(listener) {
    const handler = (_e: IpcRendererEvent, state: FlowState) => listener(state);
    ipcRenderer.on(IPC.state, handler);
    void ipcRenderer.invoke(IPC.getState).then(listener);
    return () => {
      ipcRenderer.removeListener(IPC.state, handler);
    };
  },
  insert: () => ipcRenderer.invoke(IPC.insert),
  copy: () => ipcRenderer.invoke(IPC.copy),
  answerChip: (slotId, value) => ipcRenderer.invoke(IPC.answerChip, String(slotId), String(value)),
  retry: () => ipcRenderer.invoke(IPC.retry),
  dismiss: () => ipcRenderer.invoke(IPC.dismiss),
  rate: (rating) => ipcRenderer.invoke(IPC.rate, String(rating)),
  setSession: (s) => ipcRenderer.invoke(IPC.setSession, { token: typeof s?.token === 'string' ? s.token : null, ready: s?.ready === true }),
  api: (req) =>
    ipcRenderer.invoke(IPC.api, {
      method: String(req.method),
      path: String(req.path),
      headers: { ...req.headers },
      ...(typeof req.body === 'string' ? { body: req.body } : {}),
    }),
};

contextBridge.exposeInMainWorld('promptai', api);
