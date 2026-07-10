'use client';

import { useState } from 'react';
import Link from 'next/link';
import { strings } from '@/lib/strings';
import { useRequireAuth } from '@/components/AuthProvider';
import seeds from '@/data/library-seeds.json';

type Modality = 'all' | 'image' | 'video' | 'chat' | 'code' | 'text';

const FILTERS: Array<{ id: Modality; label: string }> = [
  { id: 'all', label: strings.libraryFilterAll },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'chat', label: 'Chat' },
  { id: 'code', label: 'Code' },
  { id: 'text', label: 'Text' },
];

export default function LibraryPage() {
  useRequireAuth();
  const [filter, setFilter] = useState<Modality>('all');

  const filtered = filter === 'all' ? seeds : seeds.filter((s) => s.modality === filter);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.libraryTitle}</h1>
      <p className="mt-1 text-sm text-gray-500">{strings.libraryFromSeed}</p>

      {/* Filter pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
              filter === f.id
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">{strings.libraryEmpty}</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((seed) => (
            <div
              key={seed.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{seed.title}</h2>
                  <p className="mt-1 text-xs text-gray-500">{seed.description}</p>
                </div>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                  {seed.modality}
                </span>
              </div>
              <p className="mt-3 text-xs text-gray-400 line-clamp-2">
                {seed.idea}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">{seed.platform_id.replace(/_/g, ' ')}</span>
                <Link
                  href={`/build?idea=${encodeURIComponent(seed.idea)}&platform=${seed.platform_id}`}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
                >
                  {strings.libraryRemix}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
