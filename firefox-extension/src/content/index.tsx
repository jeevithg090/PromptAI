/**
 * Firefox content script — ports extension/src/content/index.tsx
 * Uses browser.* namespace for Firefox MV3 compatibility.
 */

import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';

let root: Root | null = null;
let shadowHost: HTMLElement | null = null;

function mountOverlay(): void {
  if (shadowHost) return;

  shadowHost = document.createElement('div');
  shadowHost.id = 'promptforge-shadow-host';

  const shadow = shadowHost.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  document.body.appendChild(shadowHost);

  // Minimal placeholder — same React components as the Chrome extension.
  root = createRoot(mountPoint);
  root.render(<PlaceholderOverlay onClose={unmountOverlay} />);
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

function PlaceholderOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 2147483647,
        background: 'white', border: '1px solid #ccc', borderRadius: 8,
        padding: 16, minWidth: 300, fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>PromptForge</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
          &times;
        </button>
      </div>
      <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Firefox extension overlay ready.</p>
    </div>
  );
}

// Keyboard shortcut: Alt+/
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.altKey && e.key === '/') {
    e.preventDefault();
    e.stopPropagation();
    mountOverlay();
  }
});

// Listen for messages from the background script
browser.runtime.onMessage.addListener((msg: { type: string }) => {
  if (msg.type === 'SHOW_OVERLAY') mountOverlay();
  if (msg.type === 'HIDE_OVERLAY') unmountOverlay();
});
