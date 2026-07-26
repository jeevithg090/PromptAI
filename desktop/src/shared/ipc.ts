/**
 * The complete IPC surface (F1.2). This is the ONLY bridge between the
 * sandboxed renderer and the main process — every channel is enumerated here
 * and nothing else is exposed on `window.pf`. Keep this list minimal; a test
 * snapshots it so the surface can't grow silently.
 */

export interface DesktopSettings {
  /** Close-to-tray instead of quitting (F1.4). */
  closeToTray: boolean;
  /** Start the app at login (F1.4). */
  openAtLogin: boolean;
  /** Global hotkey for the widget/quick panel (F1.5). */
  widgetHotkey: string;
  /** Floating widget enabled (F1.5). */
  widgetEnabled: boolean;
  /** Widget skin id (F1.5). */
  widgetSkin: 'pill' | 'orb' | 'companion';
  /** Widget size preset (F1.5). */
  widgetSize: 'S' | 'M' | 'L';
  /** Widget opacity 0.2–1 (F1.5). */
  widgetOpacity: number;
  /** Persisted widget position + display (F1.5). */
  widgetX: number | null;
  widgetY: number | null;
  widgetDisplayId: number | null;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  closeToTray: true,
  openAtLogin: false,
  widgetHotkey: 'CommandOrControl+Shift+P',
  widgetEnabled: false,
  widgetSkin: 'pill',
  widgetSize: 'M',
  widgetOpacity: 0.85,
  widgetX: null,
  widgetY: null,
  widgetDisplayId: null,
};

/** The typed API exposed on `window.pf` via the preload contextBridge. */
export interface PfBridge {
  getVersion(): Promise<string>;
  getSettings(): Promise<DesktopSettings>;
  setSettings(partial: Partial<DesktopSettings>): Promise<DesktopSettings>;
  /** Read clipboard text — ONLY invoked from explicit user clicks (never on a timer). */
  readClipboardText(): Promise<string>;
  /** Persisted Supabase session token (safeStorage-encrypted on disk). */
  getSavedToken(): Promise<string | null>;
  setSavedToken(token: string | null): Promise<void>;
  /** Window controls. */
  openMainWindow(): Promise<void>;
  /** Deep actions dispatched from the tray/widget (e.g. {kind:'new-draft'}). */
  onDeepAction(cb: (action: DeepAction) => void): void;
}

export type DeepAction =
  | { kind: 'new-draft' }
  | { kind: 'enhance-clipboard'; text: string }
  | { kind: 'dictate' };

/** IPC channel names — internal, not exposed to the renderer directly. */
export const IPC = {
  getVersion: 'pf:getVersion',
  getSettings: 'pf:getSettings',
  setSettings: 'pf:setSettings',
  readClipboardText: 'pf:readClipboardText',
  getSavedToken: 'pf:getSavedToken',
  setSavedToken: 'pf:setSavedToken',
  openMainWindow: 'pf:openMainWindow',
  deepAction: 'pf:deepAction',
  // Widget-window channels (F1.5) — used by the widget preload only.
  widgetDragStart: 'pf:widgetDragStart',
  widgetDragMove: 'pf:widgetDragMove',
  widgetDragEnd: 'pf:widgetDragEnd',
  widgetExpand: 'pf:widgetExpand',
  widgetCollapse: 'pf:widgetCollapse',
  widgetGetState: 'pf:widgetGetState',
  widgetAction: 'pf:widgetAction',
} as const;

/** Actions the widget quick-panel can dispatch to the main window (F1.5). */
export type WidgetAction =
  | { kind: 'draft'; idea: string }
  | { kind: 'enhance-clipboard' }
  | { kind: 'dictate' }
  | { kind: 'open-app' };
