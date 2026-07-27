'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { strings } from '@/lib/strings';
import { AuthProvider, useAuth } from './AuthProvider';
import { EncryptionProvider } from './EncryptionProvider';
import CommandPalette from './CommandPalette';
import Tour from './Tour';
import InstallChip from './InstallChip';

/** The ember mark — a struck spark. Used as the brand glyph. */
function ForgeMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ember-600 shadow-[0_4px_12px_-4px_rgba(217,72,15,0.6)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c1.5 3 4 4 4 7a4 4 0 0 1-8 0c0-1 .5-2 1.2-2.8" />
        <path d="M12 21v-4" />
      </svg>
    </span>
  );
}

const NAV_LINK = 'rounded-md px-2.5 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink';

function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const items = [
    { href: '/debug', label: strings.tools.debugTitle },
    { href: '/reverse', label: strings.tools.reverseTitle },
    { href: '/workflows', label: strings.workflows.title },
    { href: '/tests', label: strings.regression.title },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${NAV_LINK} inline-flex items-center gap-1`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Tools
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor"><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div role="menu" className="pf-rise absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {items.map((it) => (
            <Link key={it.href} href={it.href} onClick={() => setOpen(false)} role="menuitem"
              className="block rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-ember-50 hover:text-ember-700">
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavBar() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 pr-2">
          <ForgeMark />
          <span className="font-display text-[1.05rem] font-bold tracking-tight text-ink">{strings.appName}</span>
        </Link>

        <div className="ml-2 hidden items-center gap-0.5 md:flex">
          <Link href="/try" className={NAV_LINK}>{strings.navTry}</Link>
          <Link href="/build" className={NAV_LINK}>{strings.navBuild}</Link>
          <Link href="/enhance" className={NAV_LINK}>{strings.navEnhance}</Link>
          <Link href="/library" className={NAV_LINK}>{strings.navLibrary}</Link>
          <Link href="/platforms" className={NAV_LINK}>{strings.navPlatforms}</Link>
          <ToolsMenu />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {user ? (
            <>
              <Link href="/history" className={`${NAV_LINK} hidden lg:inline-block`}>{strings.navHistory}</Link>
              <Link href="/prompts" className={`${NAV_LINK} hidden lg:inline-block`}>{strings.prompts.navLink}</Link>
              <Link href="/projects" className={`${NAV_LINK} hidden lg:inline-block`}>Projects</Link>
              <Link href="/teams" className={`${NAV_LINK} hidden lg:inline-block`}>Teams</Link>
              <Link href="/account" className={NAV_LINK}>{strings.navAccount}</Link>
              <button onClick={() => signOut()} className="pf-btn pf-btn-ghost !px-3 !py-1.5">{strings.navSignOut}</button>
            </>
          ) : (
            <>
              <Link href="/auth/signin" className={NAV_LINK}>{strings.navSignIn}</Link>
              <Link href="/auth/signup" className="pf-btn pf-btn-primary !px-3.5 !py-1.5">{strings.navSignUp}</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <EncryptionProvider>
      <div className="flex min-h-screen flex-col">
        <CommandPalette />
        <Tour />
        <InstallChip />
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <ForgeMark />
                <span className="font-display text-base font-bold tracking-tight text-ink">{strings.appName}</span>
              </div>
              <p className="mt-3 text-sm text-stone-500">Rough ideas, forged into excellent, platform-tailored prompts.</p>
              <p className="mt-4 text-xs text-stone-400">&copy; {new Date().getFullYear()} {strings.appName}</p>
            </div>
            <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-stone-500 sm:grid-cols-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">Product</span>
              <Link href="/build" className="transition-colors hover:text-ember-700">{strings.navBuild}</Link>
              <Link href="/enhance" className="transition-colors hover:text-ember-700">{strings.navEnhance}</Link>
              <Link href="/library" className="transition-colors hover:text-ember-700">{strings.navLibrary}</Link>
              <Link href="/platforms" className="transition-colors hover:text-ember-700">{strings.navPlatforms}</Link>
              <Link href="/download" className="transition-colors hover:text-ember-700">{strings.download.title}</Link>
            </nav>
          </div>
        </footer>
      </div>
      </EncryptionProvider>
    </AuthProvider>
  );
}