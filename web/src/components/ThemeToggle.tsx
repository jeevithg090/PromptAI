'use client';

import { useSyncExternalStore } from 'react';
import { strings } from '@/lib/strings';
import { THEME_KEY as KEY } from '@/lib/theme';

type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];

/** Applies a theme choice to <html>. "system" removes the override so the
 *  prefers-color-scheme media query decides. */
function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  window.dispatchEvent(new Event(EVENT));
}

const EVENT = 'pf-theme-change';
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
// <html data-theme> is the source of truth (set pre-paint by themeInitScript).
const readTheme = (): Theme => {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
};

const ICONS: Record<Theme, React.ReactNode> = {
  system: <path d="M4 5h16v11H4zM8 20h8M12 16v4" />,
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
};

/** Cycles System → Light → Dark. The label names the current theme. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    apply(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch { /* ignore */ }
  };

  const label = strings.theme[theme];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${strings.theme.label}: ${label}`}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[theme]}
      </svg>
    </button>
  );
}
