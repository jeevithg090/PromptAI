/**
 * Firefox content script — ports extension/src/content/index.tsx
 * Uses browser.* namespace for Firefox MV3 compatibility.
 */

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
  root.render(createPlaceholderOverlay());
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

function createPlaceholderOverlay(): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 2147483647;
    background: white; border: 1px solid #ccc; border-radius: 8px;
    padding: 16px; min-width: 300px; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>PromptForge</strong>
      <button id="pf-close" style="background:none;border:none;cursor:pointer;font-size:18px">&times;</button>
    </div>
    <p style="margin:0;color:#666;font-size:13px">
      Firefox extension overlay ready.
    </p>
  `;
  const closeBtn = container.querySelector('#pf-close');
  closeBtn?.addEventListener('click', unmountOverlay);
  return container;
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
