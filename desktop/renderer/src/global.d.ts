// The preload bridge exposed on window.pf (F1.2). Mirrors ../../src/shared/ipc.ts
// (PfBridge / DesktopSettings / DeepAction) — update together.
interface DesktopSettings {
  closeToTray: boolean;
  openAtLogin: boolean;
  widgetHotkey: string;
  widgetEnabled: boolean;
  widgetSkin: 'pill' | 'orb' | 'companion';
  widgetSize: 'S' | 'M' | 'L';
  widgetOpacity: number;
  widgetX: number | null;
  widgetY: number | null;
  widgetDisplayId: number | null;
}

type DeepAction =
  | { kind: 'new-draft' }
  | { kind: 'enhance-clipboard'; text: string }
  | { kind: 'dictate' };

interface PfBridge {
  getVersion(): Promise<string>;
  getSettings(): Promise<DesktopSettings>;
  setSettings(partial: Partial<DesktopSettings>): Promise<DesktopSettings>;
  readClipboardText(): Promise<string>;
  getSavedToken(): Promise<string | null>;
  setSavedToken(token: string | null): Promise<void>;
  openMainWindow(): Promise<void>;
  onDeepAction(cb: (action: DeepAction) => void): void;
}

interface Window {
  pf?: PfBridge;
}
