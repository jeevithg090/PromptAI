// Astryx's prebuilt CSS (no StyleX compiler, no Tailwind entry). Fonts: the
// system stack; the theme's fonts.css loads Google Fonts, so it is not imported.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { DraftSheet } from './DraftSheet.tsx';
import { createWebBridge } from './web-bridge.ts';

const bridge = window.promptai ?? createWebBridge({ serverUrl: import.meta.env.VITE_PROMPTAI_SERVER_URL ?? 'http://localhost:8787' });

/** Same key public/color-mode.js reads before hydration. */
function storedMode(): 'light' | 'dark' | 'system' {
  try {
    const m = localStorage.getItem('promptai.mode');
    return m === 'light' || m === 'dark' ? m : 'system';
  } catch {
    return 'system';
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={neutralTheme} mode={storedMode()}>
      <DraftSheet bridge={bridge} />
    </Theme>
  </StrictMode>,
);
