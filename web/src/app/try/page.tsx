'use client';

import { useState } from 'react';
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

  // Load examples on mount
  useState(() => {
    api.platforms().then((p) => {
      // Fetch demo examples from backend
      fetch(`${api.baseUrl}/demo/examples`).then(r => r.json()).then(d => {
        if (d.examples) setExamples(d.examples);
      }).catch(() => {});
    }).catch(() => {});
  });

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
        setError((res as any).reason ?? strings.error);
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {examples.map((ex) => (
          <button
            key={ex.example_id}
            onClick={() => handleSelect(ex.example_id)}
            disabled={loading}
            className={`rounded-lg border p-4 text-left text-sm transition hover:border-gray-400 ${
              selected === ex.example_id ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
            }`}
          >
            <span className="text-gray-900">{ex.example_id.replace(/-/g, ' ')}</span>
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{ex.modality}</span>
          </button>
        ))}
      </div>

      {loading && <p className="mt-8 text-sm text-gray-600">{strings.buildGenerating}</p>}

      {error && !rateLimited && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {rateLimited && (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{strings.tryRateLimited}</p>
          <Link
            href="/auth/signup"
            className="mt-2 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
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
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
          >
            {strings.resultCopy}
          </button>

          {/* Signup banner */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">{strings.trySignupBanner}</p>
            <Link
              href="/auth/signup"
              className="mt-2 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              {strings.navSignUp}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}