'use client';

import Link from 'next/link';
import { usePlatforms } from '@/lib/usePlatforms';
import LoadError from '@/components/LoadError';
import { strings } from '@/lib/strings';

/**
 * Platform index (V1.8) — the front door to per-platform guides that teach a
 * newcomer what each platform is and how to prompt it.
 */
export default function PlatformsPage() {
  const { platforms, status, retry } = usePlatforms();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.platformGuide.indexTitle}</h1>
      <p className="mt-1 text-sm text-gray-500">{strings.platformGuide.indexSubtitle}</p>

      {status === 'error' && <LoadError className="mt-6" message={strings.platformsLoadError} onRetry={retry} />}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={status === 'loading'}>
        {status === 'loading' && Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-lg border border-line bg-stone-100" aria-hidden />
        ))}
        {platforms.map((p) => (
          <Link
            key={p.platform_id}
            href={`/platforms/view?id=${p.platform_id}`}
            className="rounded-lg border border-gray-200 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
                {p.display_name.slice(0, 1)}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{p.display_name}</h2>
                <div className="mt-0.5 flex gap-1">
                  {p.modalities.map((m) => (
                    <span key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {p.max_prompt_tokens != null && (
              <p className="mt-3 text-xs text-stone-500">
                {strings.tokenMeter.contextSize(new Intl.NumberFormat().format(p.max_prompt_tokens))}
              </p>
            )}
            <p className="mt-2 text-xs font-medium text-emerald-700">{strings.platformGuide.openGuide} →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
