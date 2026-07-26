'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import seeds from '@/data/library-seeds.json';

/**
 * Public prompt library (V1.3): curated seeds across 8 niches merged with
 * approved community entries from the backend. No auth required — this is
 * the browse-and-borrow front door of the product.
 */
interface LibraryItem {
  id: string;
  title: string;
  description: string;
  niche: string;
  modality: string;
  platform_id: string;
  idea: string;
  template: string;
  community?: boolean;
}

interface CommunityEntry {
  id: string;
  title: string;
  description: string | null;
  modality: string;
  platform_tags: string[] | null;
  template: string;
}

const NICHES = ['all', 'marketing', 'coding', 'art', 'writing', 'education', 'product-ux', 'data', 'video'];
const MODALITIES = ['all', 'image', 'video', 'chat', 'code', 'text'];

export default function LibraryPage() {
  const [niche, setNiche] = useState('all');
  const [modality, setModality] = useState('all');
  const [query, setQuery] = useState('');
  const [community, setCommunity] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Community entries are additive; seed content renders regardless.
    api.library()
      .then((res) => {
        if (res.source !== 'db') return;
        const entries = (res.entries as CommunityEntry[]).map((e) => ({
          id: `community-${e.id}`,
          title: e.title,
          description: e.description ?? '',
          niche: 'all',
          modality: e.modality,
          platform_id: e.platform_tags?.[0] ?? '',
          idea: e.title,
          template: e.template,
          community: true,
        }));
        setCommunity(entries);
      })
      .catch(() => {});
  }, []);

  const items = useMemo(() => {
    const all: LibraryItem[] = [...(seeds as LibraryItem[]), ...community];
    const q = query.trim().toLowerCase();
    return all.filter((item) => {
      if (niche !== 'all' && item.niche !== niche) return false;
      if (modality !== 'all' && item.modality !== modality) return false;
      if (q && !`${item.title} ${item.description} ${item.template}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [community, niche, modality, query]);

  const handleCopy = (template: string) => {
    navigator.clipboard.writeText(template).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.libraryTitle}</h1>
      <p className="mt-1 text-sm text-gray-500">{strings.librarySubtitle}</p>

      {/* Niche pills */}
      <div className="mt-5 flex flex-wrap gap-2">
        {NICHES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNiche(n)}
            aria-pressed={niche === n}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
              niche === n ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {strings.libraryNiches[n] ?? n}
          </button>
        ))}
      </div>

      {/* Modality + search */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          aria-label="Modality"
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          {MODALITIES.map((m) => (
            <option key={m} value={m}>{m === 'all' ? strings.libraryFilterAll : m}</option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={strings.librarySearchPlaceholder}
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-xs shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <span className="text-xs text-gray-400">{items.length} prompts</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">{strings.libraryEmpty}</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-400 hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">{item.title}</h2>
                <div className="flex shrink-0 gap-1">
                  {item.community && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      {strings.libraryCommunityBadge}
                    </span>
                  )}
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {item.modality}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500">{item.description}</p>
              <p className="mt-3 font-mono text-xs text-gray-400 line-clamp-2">{item.template}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">{item.platform_id.replace(/_/g, ' ')}</span>
                <span className="text-xs font-medium text-emerald-700">{strings.libraryViewPrompt} →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={selected.title}>
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => setSelected(null)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{selected.title}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{selected.description}</p>
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {strings.libraryNiches[selected.niche] ?? selected.niche}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{selected.modality}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {selected.platform_id.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={strings.close}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 px-5 py-4">
              <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-800">
                {selected.template}
              </pre>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-200 px-5 py-4">
              <Link
                href={`/build?idea=${encodeURIComponent(selected.idea)}&platform=${selected.platform_id}`}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
              >
                {strings.libraryUseThis}
              </Link>
              <button
                type="button"
                onClick={() => handleCopy(selected.template)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {copied ? strings.copied : strings.libraryCopyTemplate}
              </button>
              <Link
                href={`/enhance?text=${encodeURIComponent(selected.template)}${selected.platform_id ? `&platform=${selected.platform_id}` : ''}`}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {strings.libraryOpenEnhance}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
