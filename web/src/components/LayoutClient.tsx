'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { strings } from '@/lib/strings';
import { AuthProvider, useAuth } from './AuthProvider';
import { EncryptionProvider } from './EncryptionProvider';
import CommandPalette from './CommandPalette';
import Tour from './Tour';
import InstallChip from './InstallChip';
import ThemeToggle from './ThemeToggle';

/** The ember mark — a struck spark. Used as the brand glyph. */
function ForgeMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-[0_4px_12px_-4px_rgba(217,72,15,0.6)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c1.5 3 4 4 4 7a4 4 0 0 1-8 0c0-1 .5-2 1.2-2.8" />
        <path d="M12 21v-4" />
      </svg>
    </span>
  );
}

const NAV_LINK = 'rounded-md px-2.5 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink aria-[current=page]:bg-stone-100 aria-[current=page]:text-ink';

const PRIMARY_LINKS = [
  { href: '/try', label: strings.navTry },
  { href: '/build', label: strings.navBuild },
  { href: '/enhance', label: strings.navEnhance },
  { href: '/library', label: strings.navLibrary },
  { href: '/platforms', label: strings.navPlatforms },
];

const TOOL_LINKS = [
  { href: '/debug', label: strings.tools.debugTitle },
  { href: '/reverse', label: strings.tools.reverseTitle },
  { href: '/workflows', label: strings.workflows.title },
  { href: '/tests', label: strings.regression.title },
];

const ACCOUNT_LINKS = [
  { href: '/history', label: strings.navHistory },
  { href: '/prompts', label: strings.navPrompts },
  { href: '/projects', label: strings.navProjects },
  { href: '/teams', label: strings.navTeams },
  { href: '/account', label: strings.navAccount },
];

/** True when `href` is the current route or one of its children. */
function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${NAV_LINK} inline-flex items-center gap-1`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {strings.navTools}
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div role="menu" className="pf-rise absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {TOOL_LINKS.map((it) => (
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

function MobileMenu({ open, onClose, signedIn, onSignOut }: { open: boolean; onClose: () => void; signedIn: boolean; onSignOut: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;

  const link = 'flex min-h-11 items-center rounded-lg px-3 text-[0.95rem] font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-ink aria-[current=page]:bg-ember-50 aria-[current=page]:text-ember-700';
  const section = (title: string, links: { href: string; label: string }[]) => (
    <div className="border-t border-line pt-3">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</p>
      {links.map((l) => (
        <Link key={l.href} href={l.href} onClick={onClose} className={link} aria-current={isActive(pathname, l.href) ? 'page' : undefined}>{l.label}</Link>
      ))}
    </div>
  );

  return (
    <div id="mobile-menu" className="pf-rise border-t border-line bg-surface lg:hidden">
      <div className="mx-auto flex max-h-[calc(100dvh-3.5rem)] max-w-7xl flex-col gap-3 overflow-y-auto px-4 py-3">
        <div>
          {PRIMARY_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={onClose} className={link} aria-current={isActive(pathname, l.href) ? 'page' : undefined}>{l.label}</Link>
          ))}
        </div>
        {section(strings.navTools, TOOL_LINKS)}
        {signedIn ? (
          <>
            {section(strings.navAccount, ACCOUNT_LINKS)}
            <div className="border-t border-line pt-3">
              <button type="button" onClick={() => { onClose(); onSignOut(); }} className={`${link} w-full`}>{strings.navSignOut}</button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
            <Link href="/auth/signin" onClick={onClose} className="pf-btn pf-btn-secondary min-h-11">{strings.navSignIn}</Link>
            <Link href="/auth/signup" onClick={onClose} className="pf-btn pf-btn-primary min-h-11">{strings.navSignUp}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function NavBar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const current = (href: string) => (isActive(pathname, href) ? 'page' : undefined);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur-md">
      <nav aria-label={strings.navPrimary} className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-md pr-2" onClick={closeMenu}>
          <ForgeMark />
          <span className="font-display text-[1.05rem] font-bold tracking-tight text-ink">{strings.appName}</span>
        </Link>

        <div className="ml-2 hidden items-center gap-0.5 lg:flex">
          {PRIMARY_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={NAV_LINK} aria-current={current(l.href)}>{l.label}</Link>
          ))}
          <ToolsMenu />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <div className="hidden items-center gap-1.5 lg:flex">
              {ACCOUNT_LINKS.slice(0, 4).map((l) => (
                <Link key={l.href} href={l.href} className={`${NAV_LINK} hidden xl:inline-block`} aria-current={current(l.href)}>{l.label}</Link>
              ))}
              <Link href="/account" className={NAV_LINK} aria-current={current('/account')}>{strings.navAccount}</Link>
              <button type="button" onClick={() => signOut()} className="pf-btn pf-btn-ghost !px-3 !py-1.5">{strings.navSignOut}</button>
            </div>
          ) : (
            <>
              <Link href="/auth/signin" className={`${NAV_LINK} hidden sm:inline-block`} aria-current={current('/auth/signin')}>{strings.navSignIn}</Link>
              <Link href="/auth/signup" className="pf-btn pf-btn-primary !px-3.5 !py-1.5">{strings.navSignUp}</Link>
            </>
          )}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-stone-700 transition-colors hover:bg-stone-100 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? strings.navMenuClose : strings.navMenuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>
      <MobileMenu open={menuOpen} onClose={closeMenu} signedIn={!!user} onSignOut={() => signOut()} />
    </header>
  );
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <EncryptionProvider>
      <div className="flex min-h-screen flex-col">
        <a href="#main" className="pf-skip">{strings.skipToContent}</a>
        <CommandPalette />
        <Tour />
        <InstallChip />
        <NavBar />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <ForgeMark />
                <span className="font-display text-base font-bold tracking-tight text-ink">{strings.appName}</span>
              </div>
              <p className="mt-3 text-sm text-stone-500">{strings.footerTagline}</p>
              <p className="mt-4 text-xs text-stone-500">&copy; {new Date().getFullYear()} {strings.appName}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm">
              <nav aria-label={strings.footerProduct} className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{strings.footerProduct}</span>
                {[...PRIMARY_LINKS.slice(1), { href: '/download', label: strings.download.title }].map((l) => (
                  <Link key={l.href} href={l.href} className="text-stone-600 transition-colors hover:text-ember-700">{l.label}</Link>
                ))}
              </nav>
              <nav aria-label={strings.footerTools} className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{strings.footerTools}</span>
                {TOOL_LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="text-stone-600 transition-colors hover:text-ember-700">{l.label}</Link>
                ))}
              </nav>
            </div>
          </div>
        </footer>
      </div>
      </EncryptionProvider>
    </AuthProvider>
  );
}