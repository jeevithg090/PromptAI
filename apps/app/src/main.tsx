// Astryx's prebuilt CSS (no StyleX compiler, no Tailwind entry). Fonts: the
// system stack; the theme's fonts.css loads Google Fonts, so it is not imported.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { Theme } from '@astryxdesign/core/theme';
import { ToastViewport } from '@astryxdesign/core/Toast';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { createHttpApi } from './api/client.ts';
import { authFromConfig } from './auth/port.ts';
import { DESKTOP_API_BASE, desktopFetch } from './desktop-fetch.ts';
import { idbQueueStore } from './events/idb-store.ts';
import { createEventQueue } from './events/queue.ts';
import { directionOf } from './i18n/direction.ts';
import { activate, pickLocale } from './i18n/index.ts';
import { App } from './shell/App.tsx';
import { createWebBridge } from './web-bridge.ts';

const locale = pickLocale();
activate(locale);
// The pseudo-locale is English underneath; real locales take their direction from their script.
const tag = locale === 'pseudo' ? 'en' : locale;
const dir = directionOf(tag);
document.documentElement.lang = tag;
document.documentElement.dir = dir;

const desktop = window.promptai;
const tokens: { current: string | null } = { current: null };
const api = createHttpApi({
  baseUrl: desktop ? DESKTOP_API_BASE : (import.meta.env.VITE_PROMPTAI_SERVER_URL ?? 'http://localhost:8787'),
  ...(desktop?.api ? { fetch: desktopFetch({ api: desktop.api }) } : {}),
  token: () => tokens.current,
});

function webBridge() {
  // On desktop the queue lives in main (under userData); here it is IndexedDB.
  const queue = createEventQueue({ send: (events) => api.sendEvents(events), store: idbQueueStore(), log: (m) => console.warn(`[events] ${m}`) });
  window.addEventListener('online', () => void queue.flush());
  return createWebBridge({
    api,
    track: (type, props) => {
      try {
        queue.track(type, props);
      } catch (err) {
        console.warn(`[events] ${String(err)}`);
      }
    },
  });
}
const bridge = desktop ?? webBridge();
const auth = authFromConfig(import.meta.env);

// The offline app shell. Electron loads file:// and needs none.
if (!desktop && import.meta.env.PROD && location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err: unknown) => console.warn(`[pwa] ${String(err)}`));
}

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
      <InternationalizationProvider locale={tag} dir={dir}>
        <ToastViewport>
          <App bridge={bridge} api={api} auth={auth} tokens={tokens} />
        </ToastViewport>
      </InternationalizationProvider>
    </Theme>
  </StrictMode>,
);
