import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type WidgetAction } from '../shared/ipc';

/**
 * Widget-window preload (F1.5). Separate from the main bridge — exposes only
 * the small `window.pfWidget` surface the floating widget needs.
 */
interface WidgetState { skin: 'pill' | 'orb' | 'companion'; size: 'S' | 'M' | 'L'; opacity: number; hotkey: string; }

const bridge = {
  getState: (): Promise<WidgetState> => ipcRenderer.invoke(IPC.widgetGetState),
  dragMove: (dx: number, dy: number): void => ipcRenderer.send(IPC.widgetDragMove, dx, dy),
  dragEnd: (): void => ipcRenderer.send(IPC.widgetDragEnd),
  expand: (): void => ipcRenderer.send(IPC.widgetExpand),
  collapse: (): void => ipcRenderer.send(IPC.widgetCollapse),
  action: (a: WidgetAction): void => ipcRenderer.send(IPC.widgetAction, a),
  onExpand: (cb: () => void): void => { ipcRenderer.on(IPC.widgetExpand, () => cb()); },
  onCollapse: (cb: () => void): void => { ipcRenderer.on(IPC.widgetCollapse, () => cb()); },
};

export type PfWidgetBridge = typeof bridge;
contextBridge.exposeInMainWorld('pfWidget', bridge);
