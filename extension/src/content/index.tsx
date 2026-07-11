import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { detect } from './detector';
import overlayStyles from './overlay.css?inline';

let root: Root | null = null;
let shadowHost: HTMLElement | null = null;

function mountOverlay(): void {
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
  root.render(<App onClose={unmountOverlay} />);
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
  const ctx = detect();
  if (!ctx.sourceText.trim()) return;
  mountOverlay();
}

// Keyboard shortcut: Alt+/
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.altKey && e.key === '/') {
    e.preventDefault();
    e.stopPropagation();
    triggerOverlay();
  }
});

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
});
