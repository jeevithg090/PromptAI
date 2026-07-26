'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rankActions, type PaletteAction } from '@/lib/palette';
import { strings } from '@/lib/strings';

/**
 * Global command palette (F2.3). ⌘K / Ctrl+K opens it; arrow/Enter/Escape
 * navigate. Renders nothing until opened (zero cost). Focus-trapped dialog.
 */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: PaletteAction[] = useMemo(() => {
    const go = (path: string) => () => { setOpen(false); router.push(path); };
    return [
      { id: 'new-draft', label: strings.palette.newDraft, keywords: 'create build prompt', run: go('/build') },
      { id: 'enhance', label: strings.palette.enhance, keywords: 'improve existing paste', run: go('/enhance') },
      { id: 'prompts', label: strings.palette.prompts, keywords: 'saved versions history diff', run: go('/prompts') },
      { id: 'history', label: strings.palette.history, keywords: 'sessions past', run: go('/history') },
      { id: 'library', label: strings.palette.library, keywords: 'templates community', run: go('/library') },
      { id: 'account', label: strings.palette.account, keywords: 'settings profile export', run: go('/account') },
      { id: 'download', label: strings.palette.download, keywords: 'desktop app mac windows', run: go('/download') },
    ];
  }, [router]);

  const ranked = useMemo(() => rankActions(query, actions), [query, actions]);

  // ⌘K / Ctrl+K toggles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, ranked.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); ranked[active]?.run(); }
  }, [ranked, active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/30 pt-[15vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={strings.palette.title}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={strings.palette.placeholder}
          className="w-full border-b border-gray-200 px-4 py-3 text-gray-900 outline-none"
          aria-activedescendant={`palette-${active}`}
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {ranked.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">{strings.palette.empty}</li>}
          {ranked.map((a, i) => (
            <li key={a.id} id={`palette-${i}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => a.run()}
                className={`flex w-full items-center px-4 py-2.5 text-left text-sm ${
                  i === active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'
                }`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
