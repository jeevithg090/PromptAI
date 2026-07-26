'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { ModeRecommendation } from '@/lib/api-types';

interface ModeSuggestionProps {
  platformId: string;
  idea: string;
  /** Task type when known (post-classification); a sensible guess before that. */
  taskType: string;
}

/**
 * Doc-grounded platform-mode advice (V1.2): once a platform + idea exist,
 * shows which mode of that platform (Gemini Flash/Pro/Thinking, Midjourney
 * v7/niji…) fits this task and why — data from the platform registry's
 * curated `modes`, ranked deterministically server-side.
 */
export default function ModeSuggestion({ platformId, idea, taskType }: ModeSuggestionProps) {
  const [recs, setRecs] = useState<ModeRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!platformId || platformId.startsWith('custom:') || !idea.trim()) {
      setRecs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .recommendMode({ platform_id: platformId, task_type: taskType, idea })
        .then((res) => { if (!cancelled) setRecs(res.recommendations); })
        .catch(() => { if (!cancelled) setRecs([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 500); // debounce typing
    return () => { cancelled = true; clearTimeout(timer); };
  }, [platformId, idea, taskType]);

  if (!platformId || recs.length < 2) return null; // single-mode platforms need no chooser

  const top = recs[0];

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4" data-tour="mode-suggestion">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          {strings.modeSuggestion.topPick}
        </p>
        {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />}
      </div>
      <p className="mt-1 text-sm font-medium text-gray-900">{top.mode.name}</p>
      <p className="mt-0.5 text-sm text-gray-600">{top.reason}</p>
      {top.mode.docs_url && (
        <a
          href={top.mode.docs_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline"
        >
          {strings.modeSuggestion.docsLink}
        </a>
      )}

      <button
        type="button"
        onClick={() => setShowAll(!showAll)}
        aria-expanded={showAll}
        className="mt-2 block text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        {showAll ? strings.modeSuggestion.hideAll : strings.modeSuggestion.showAll}
      </button>

      {showAll && (
        <ul className="mt-2 space-y-2">
          {recs.slice(1).map((r) => (
            <li key={r.mode.mode_id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
              <p className="text-sm font-medium text-gray-800">{r.mode.name}</p>
              <p className="text-xs text-gray-500">{r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
