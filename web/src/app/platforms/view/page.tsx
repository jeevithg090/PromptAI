'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';

/**
 * Platform guide page (V1.8): teaches a newcomer what this platform is and
 * how prompting works there — registry rules/quirks/modes + doc-grounded
 * lessons (PKB) + starter prompts from the library. Query-param routing
 * (?id=) because the app is a Next static export (no runtime dynamic segments).
 */
type Guide = Awaited<ReturnType<typeof api.platformGuide>>;

function GuideContent() {
  const params = useSearchParams();
  const platformId = params.get('id') ?? '';
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!platformId) return;
    api.platformGuide(platformId)
      .then(setGuide)
      .catch(() => setError(strings.platformGuide.notFound));
  }, [platformId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!guide) return <p className="text-sm text-gray-500">{strings.loading}</p>;

  const { platform, lessons, starter_prompts } = guide;
  const modes = platform.modes ?? [];

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-900 text-xl font-bold text-white">
            {platform.display_name.slice(0, 1)}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{platform.display_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {platform.modalities.map((m) => (
                <span key={m} className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{m}</span>
              ))}
              <span className="text-xs text-gray-400">
                {strings.platformGuide.contextLine(new Intl.NumberFormat().format(platform.max_prompt_tokens))}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          <Link
            href={`/build?platform=${platform.platform_id}`}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
          >
            {strings.platformGuide.cta(platform.display_name)}
          </Link>
          <a
            href={platform.docs_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {strings.platformGuide.officialDocs}
          </a>
        </div>
      </div>

      {/* How prompting works */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900">{strings.platformGuide.howTitle}</h2>
        <ol className="mt-3 space-y-2">
          {platform.syntax_rules.map((rule, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700">{rule}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Quirks */}
      {platform.quirks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">{strings.platformGuide.quirksTitle}</h2>
          <div className="mt-3 space-y-2">
            {platform.quirks.map((q, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">{q}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modes */}
      {modes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">{strings.platformGuide.modesTitle}</h2>
          <div className="mt-3 space-y-3">
            {modes.map((m) => (
              <div key={m.mode_id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{m.name}</h3>
                  {m.docs_url && (
                    <a href={m.docs_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline">
                      {strings.modeSuggestion.docsLink}
                    </a>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600">{m.notes}</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <span className="text-gray-500">
                    <span className="font-medium text-emerald-700">{strings.platformGuide.modeBestFor}:</span> {m.best_for.join(', ')}
                  </span>
                  {m.avoid_for.length > 0 && (
                    <span className="text-gray-500">
                      <span className="font-medium text-amber-700">{strings.platformGuide.modeAvoidFor}:</span> {m.avoid_for.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Doc lessons */}
      {lessons.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">{strings.platformGuide.lessonsTitle}</h2>
          <div className="mt-3 space-y-2">
            {lessons.map((l, i) => {
              let domain = '';
              try { domain = new URL(l.source_url).hostname; } catch { domain = l.source_url; }
              return (
                <div key={i} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <p className="text-sm text-gray-700">{l.content}</p>
                  {l.source_url && (
                    <a href={l.source_url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100">
                      {domain} ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Starter prompts */}
      {starter_prompts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900">{strings.platformGuide.startersTitle}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {starter_prompts.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-xs text-gray-500">{s.description}</p>
                <p className="mt-2 font-mono text-xs text-gray-400 line-clamp-2">{s.template}</p>
                <Link
                  href={`/build?idea=${encodeURIComponent(s.idea)}&platform=${platform.platform_id}`}
                  className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline"
                >
                  {strings.platformGuide.startersUse} →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function PlatformGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<p className="text-sm text-gray-600">{strings.loading}</p>}>
        <GuideContent />
      </Suspense>
    </div>
  );
}
