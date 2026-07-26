'use client';

import { useState, useRef, useEffect } from 'react';
import type { GroundingSource } from '@/lib/api-types';

/**
 * Inline [P1]/[M2] citation chip (V1.6): renders a rationale's citation token
 * as a small accent chip; clicking opens a popover with the doc snippet and
 * an outbound link to the source the draft was grounded in.
 */
export function CitationChip({ source }: { source: GroundingSource }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mx-0.5 rounded bg-emerald-50 px-1 py-0.5 align-baseline text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
      >
        {source.ref}
      </button>
      {open && (
        <span className="absolute bottom-full left-0 z-20 mb-1 block w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <span className="block text-xs text-gray-700">{source.snippet}…</span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 block text-xs font-medium text-emerald-700 hover:underline"
          >
            {source.domain} ↗
          </a>
        </span>
      )}
    </span>
  );
}

/** Splits rationale text on [P<n>]/[M<n>] tokens and renders resolvable ones as chips. */
export function RationaleWithCitations({ text, sources }: { text: string; sources: GroundingSource[] }) {
  if (sources.length === 0) return <>{text}</>;
  const parts = text.split(/\[([PM]\d+)\]/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        const source = sources.find((s) => s.ref === part);
        return source ? <CitationChip key={i} source={source} /> : <span key={i}>[{part}]</span>;
      })}
    </>
  );
}
