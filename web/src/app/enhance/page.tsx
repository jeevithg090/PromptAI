'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type ApiError } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { Platform, EnhanceResponse, DesignedResponse, RubricDimension } from '@/lib/api-types';
import NodeEditor from '@/components/NodeEditor';
import StrengthPanel from '@/components/StrengthPanel';
import MicButton from '@/components/MicButton';
import SavePromptButton from '@/components/SavePromptButton';
import ComparePanel from '@/components/ComparePanel';

type Phase = 'input' | 'loading' | 'result' | 'error';

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

function EnhanceContent() {
  const searchParams = useSearchParams();
  const [text, setText] = useState(searchParams.get('text') ?? '');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState(searchParams.get('platform') ?? '');
  const [phase, setPhase] = useState<Phase>('input');
  const [result, setResult] = useState<EnhanceResponse | null>(null);
  const [enhanced, setEnhanced] = useState<DesignedResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.platforms().then((res) => setPlatforms(res.platforms)).catch(() => {});
  }, []);

  const runEnhance = useCallback(
    async (targetPlatform?: string) => {
      if (text.trim().length < 10) return;
      setPhase('loading');
      setError('');
      try {
        const res = await api.enhance({
          text,
          platform_id: targetPlatform || selectedPlatform || undefined,
        });
        setResult(res);
        setEnhanced(res.enhanced);
        setPhase('result');
      } catch (e) {
        setError((e as ApiError).message ?? strings.errorServer);
        setPhase('error');
      }
    },
    [text, selectedPlatform]
  );

  const dimLabels: Record<string, string> = {};
  for (const d of enhanced?.strength?.dimensions ?? []) dimLabels[d.dimension] = d.label;

  const deltaArrow = (before: number, after: number) =>
    after > before ? '▲' : after < before ? '▼' : '—';
  const deltaColor = (before: number, after: number) =>
    after > before ? 'text-green-700 bg-green-50' : after < before ? 'text-red-700 bg-red-50' : 'text-gray-500 bg-gray-50';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">{strings.enhance.title}</h1>
      <p className="mt-2 text-gray-600">{strings.enhance.subtitle}</p>

      {phase === 'input' || phase === 'error' ? (
        <div className="mt-8 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="prompt-text" className="block text-sm font-medium text-gray-700">
                {strings.enhance.pasteLabel}
              </label>
              <MicButton onText={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
            </div>
            <textarea
              id="prompt-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={strings.enhance.pastePlaceholder}
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="platform" className="block text-sm font-medium text-gray-700">
              {strings.enhance.platformLabel}
            </label>
            <select
              id="platform"
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900 focus:border-emerald-500 focus:ring-emerald-500"
            >
              <option value="">{strings.enhance.platformAuto}</option>
              {platforms.map((p) => (
                <option key={p.platform_id} value={p.platform_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
          {phase === 'error' && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => runEnhance()}
            disabled={text.trim().length < 10}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {strings.enhance.button}
          </button>
        </div>
      ) : null}

      {phase === 'loading' && (
        <div className="mt-10 flex items-center gap-3 text-gray-600" aria-live="polite">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          {strings.enhance.loading}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="mt-8 space-y-8">
          {/* Improvement headline */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            {result.improvement.note === 'improved' ? (
              <p className="text-lg font-semibold text-green-700">
                {fmt(strings.enhance.improvedBy, { before: result.improvement.before, after: result.improvement.after })}
              </p>
            ) : (
              <p className="text-lg font-semibold text-gray-800">{strings.enhance.alreadyStrong}</p>
            )}
            {result.platform_hint && !selectedPlatform && (
              <p className="mt-2 text-sm text-gray-600">
                {fmt(strings.enhance.platformHint, { platform: result.platform_hint })}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlatform(result.platform_hint as string);
                    runEnhance(result.platform_hint as string);
                  }}
                  className="font-medium text-emerald-600 hover:underline"
                >
                  {strings.enhance.reEnhanceForHint}
                </button>
              </p>
            )}
          </div>

          {/* Before/After scores */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{strings.enhance.beforeTitle}</p>
              <p className="mt-1 text-4xl font-bold text-gray-700">{result.improvement.before}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-500">{strings.enhance.afterTitle}</p>
              <p className="mt-1 text-4xl font-bold text-emerald-700">{result.improvement.after}</p>
            </div>
          </div>

          {/* Per-dimension deltas */}
          {result.improvement.dimension_deltas.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700">{strings.enhance.deltaTitle}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.improvement.dimension_deltas.map((d) => (
                  <li
                    key={d.dimension}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${deltaColor(d.before, d.after)}`}
                  >
                    {dimLabels[d.dimension as RubricDimension] ?? d.dimension}: {d.before} {deltaArrow(d.before, d.after)} {d.after}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Enhanced strength panel + node editor */}
          {enhanced && (
            <>
              {enhanced.strength && (
                <StrengthPanel
                  strength={enhanced.strength}
                  whyThisWorks={enhanced.whyThisWorks}
                  improvementHints={enhanced.improvementHints}
                  grounding={enhanced.grounding}
                />
              )}
              <NodeEditor response={enhanced} onUpdate={setEnhanced} />
              {/* A/B compare (F2.5) — original pasted text vs enhanced assembled. */}
              <ComparePanel
                platformId={enhanced.platformId}
                taskType={enhanced.taskType}
                promptA={text}
                promptB={enhanced.assembled}
              />
            </>
          )}

          <div className="flex items-center gap-3">
          {enhanced && <SavePromptButton response={enhanced} />}
          <button
            type="button"
            onClick={() => {
              setPhase('input');
              setResult(null);
              setEnhanced(null);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {strings.enhance.tryAnother}
          </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function EnhancePage() {
  return (
    <Suspense fallback={null}>
      <EnhanceContent />
    </Suspense>
  );
}
