// The widget preload bridge (F1.5). Mirrors ../../src/preload/widget.ts.
type WidgetSkin = 'pill' | 'orb' | 'companion';
type WidgetSizePreset = 'S' | 'M' | 'L';

interface WidgetState {
  skin: WidgetSkin;
  size: WidgetSizePreset;
  opacity: number;
  hotkey: string;
}

type WidgetAction =
  | { kind: 'draft'; idea: string }
  | { kind: 'enhance-clipboard' }
  | { kind: 'dictate' }
  | { kind: 'open-app' };

interface PfWidgetBridge {
  getState(): Promise<WidgetState>;
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  expand(): void;
  collapse(): void;
  action(a: WidgetAction): void;
  onExpand(cb: () => void): void;
  onCollapse(cb: () => void): void;
}

interface Window {
  pfWidget?: PfWidgetBridge;
}
