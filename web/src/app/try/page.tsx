'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { strings } from '@/lib/strings';
import { api } from '@/lib/api';
import type { DraftResponse, DesignedResponse } from '@/lib/api-types';
import StrengthPanel from '@/components/StrengthPanel';

interface DemoExample {
  example_id: string;
  platform_id: string;
  modality: string;
}

export default function TryPage() {
  const [examples, setExamples] = useState<DemoExample[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<DesignedResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [examplesState, setExamplesState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  // Load the demo examples on mount (and again on "Try again").
  useEffect(() => {
    let cancelled = false;
    fetch(`${api.baseUrl}/demo/examples`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { examples?: DemoExample[] }) => {
        if (cancelled) return;
        setExamples(d.examples ?? []);
        setExamplesState('ready');
      })
      .catch(() => { if (!cancelled) setExamplesState('error'); });
    return () => { cancelled = true; };
  }, [attempt]);

  const handleSelect = async (id: string) => {
    if (loading) return;
    setSelected(id);
    setLoading(true);
    setError('');
    setResult(null);
    setRateLimited(false);
    try {
      const res: DraftResponse = await api.demoDraft({ example_id: id });
      if ((res as { status: string }).status === 'rate_limited') {
        setRateLimited(true);
        setError((res as { message?: string }).message ?? strings.tryRateLimited);
      } else if (res.status === 'ok' && 'response' in res) {
        setResult(res.response);
      } else if (res.status === 'error' && 'message' in res) {
        setError(res.message);
      } else if (res.status === 'blocked') {
        setError((res as { reason?: string }).reason ?? strings.error);
      } else {
        setError(strings.errorServer);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.errorNetwork);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.tryTitle}</h1>
      <p className="mt-2 text-sm text-gray-600">{strings.tryDescription}</p>

      {examplesState === 'error' && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{strings.tryExamplesError}</p>
          <button type="button" onClick={() => { setExamplesState('loading'); setAttempt((n) => n + 1); }} className="pf-btn pf-btn-secondary !py-2">
            {strings.tryRetry}
          </button>
        </div>
      )}
      {examplesState === 'ready' && examples.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">{strings.tryExamplesEmpty}</p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-busy={examplesState === 'loading'}>
        {examplesState === 'loading' && Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[54px] animate-pulse rounded-lg border border-line bg-stone-100" aria-hidden />
        ))}
        {examples.map((ex) => (
          <button
            key={ex.example_id}
            onClick={() => handleSelect(ex.example_id)}
            disabled={loading}
            aria-pressed={selected === ex.example_id}
            className={`rounded-lg border bg-surface p-4 text-left text-sm transition hover:border-ember-300 disabled:cursor-wait ${
              selected === ex.example_id ? 'border-ember-500 ring-1 ring-ember-500' : 'border-gray-200'
            }`}
          >
            <span className="font-medium capitalize text-gray-900">{ex.example_id.replace(/-/g, ' ')}</span>
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{ex.modality}</span>
          </button>
        ))}
      </div>

      {loading && (
        <p role="status" className="mt-8 flex items-center gap-2 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-ember-600" aria-hidden />
          {strings.buildGenerating}
        </p>
      )}

      {error && !rateLimited && (
        <div role="alert" className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {rateLimited && (
        <div role="alert" className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{strings.tryRateLimited}</p>
          <Link
            href="/auth/signup"
            className="mt-2 inline-block rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover"
          >
            {strings.navSignUp}
          </Link>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-4">
          {/* Strength Score */}
          {result.strength && (
            <StrengthPanel
              strength={result.strength}
              whyThisWorks={result.whyThisWorks}
              improvementHints={result.improvementHints}
              grounding={result.grounding}
            />
          )}

          {/* Assembled prompt */}
          <div className="rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <h2 className="text-sm font-medium text-gray-700">{strings.resultAssembled}</h2>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-sm text-gray-800">
              {result.assembled}
            </pre>
          </div>

          {/* Copy button */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.assembled).then(() => {
                const btn = document.activeElement as HTMLButtonElement | null;
                if (btn) {
                  const orig = btn.textContent;
                  btn.textContent = strings.copied;
                  setTimeout(() => { btn.textContent = orig; }, 1500);
                }
              });
            }}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover"
          >
            {strings.resultCopy}
          </button>

          {/* Signup banner */}
          <div className="rounded-lg border border-ember-200 bg-ember-50 p-4">
            <p className="text-sm text-ember-800">{strings.trySignupBanner}</p>
            <Link
              href="/auth/signup"
              className="mt-2 inline-block rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover"
            >
              {strings.navSignUp}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}