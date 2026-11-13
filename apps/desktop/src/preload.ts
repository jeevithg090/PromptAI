// Sandboxed preload: the panel gets this enumerated API and nothing else.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FlowState } from './flow.ts';
import { IPC, type PromptAIApi } from './ipc.ts';

const api: PromptAIApi = {
  platform: 'desktop',
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
};

contextBridge.exposeInMainWorld('promptai', api);
