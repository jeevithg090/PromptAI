import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { detect } from './detector';
import { initFloatingButton } from './floatingButton';
import overlayStyles from './overlay.css?inline';

let root: Root | null = null;
let shadowHost: HTMLElement | null = null;

function mountOverlay(initialEnhanceText?: string): void {
  if (shadowHost) return;

  shadowHost = document.createElement('div');
  shadowHost.id = 'promptforge-shadow-host';

  const shadow = shadowHost.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = overlayStyles;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  document.body.appendChild(shadowHost);

  root = createRoot(mountPoint);
  root.render(<App onClose={unmountOverlay} initialEnhanceText={initialEnhanceText} />);
}

function unmountOverlay(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
  }
}

function triggerOverlay(): void {
  // Open even with an empty input (finalplan B3) — empty just starts in draft-from-idea mode.
  mountOverlay();
}

// In-page fallback hotkey: Alt+/ (the primary, rebindable hotkey is the manifest
// `commands` entry Alt+P, routed here via the background worker).
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.altKey && e.key === '/') {
    e.preventDefault();
    e.stopPropagation();
    triggerOverlay();
  }
});

// Optional per-origin floating button (F1.5) — default OFF; opens the overlay.
void initFloatingButton(() => mountOverlay());

// Expose for testing
(window as unknown as Record<string, unknown>).__promptforge = {
  mountOverlay: () => mountOverlay(),
  unmountOverlay,
  detect,
};

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_OVERLAY') {
    mountOverlay();
  }
  if (msg.type === 'HIDE_OVERLAY') {
    unmountOverlay();
  }
  if (msg.type === 'ENHANCE_SELECTION' && typeof msg.text === 'string') {
    // F2.3: open the overlay pre-filled in enhance mode with the selection.
    mountOverlay(msg.text);
  }
  if (msg.type === 'ENHANCE_HOTKEY') {
    // Alt+Shift+P (manifest command): enhance the current page selection if any.
    const selection = window.getSelection?.()?.toString() ?? '';
    mountOverlay(selection.trim() || undefined);
  }
});
