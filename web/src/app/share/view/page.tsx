'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { fillVars, type TemplateVar } from '@/lib/templateVars';

interface Shared {
  assembled: string;
  nodes: Array<{ type: string; value: string }>;
  strength_score: number | null;
  variables: TemplateVar[];
}

function ShareView() {
  const params = useSearchParams();
  const slug = params.get('slug') ?? '';
  const [shared, setShared] = useState<Shared | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    api.getShare(slug)
      .then((r) => setShared({ assembled: r.assembled, nodes: r.nodes, strength_score: r.strength_score, variables: r.variables ?? [] }))
      .catch(() => setShared(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const filled = useMemo(() => (shared ? fillVars(shared.assembled, values) : ''), [shared, values]);

  if (loading) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-gray-500">Loading…</main>;
  if (!shared) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-gray-500">{strings.share.notFound}</main>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">{strings.share.publicTitle}</h1>
      {shared.strength_score != null && (
        <p className="mt-1 text-sm text-gray-500">Strength {shared.strength_score} / 100</p>
      )}

      {shared.variables.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700">{strings.share.fillTitle}</h2>
          <div className="mt-3 space-y-2">
            {shared.variables.map((v) => (
              <label key={v.name} className="block text-sm">
                <span className="text-gray-500">{v.name}</span>
                <input
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                  placeholder={v.default ?? ''}
                  value={values[v.name] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <pre className="mt-6 overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-sm text-gray-800">{filled}</pre>

      <div className="mt-4 flex gap-3">
        <button
          onClick={async () => { await navigator.clipboard.writeText(filled); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {copied ? strings.share.copied : strings.share.copyLink}
        </button>
        <a href="/build" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {strings.share.openInApp}
        </a>
      </div>

      <ReportShare slug={slug} />
    </main>
  );
}

/** Report a public share with a reason code; nothing else is sent. */
function ReportShare({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (state === 'sent') {
    return <p role="status" className="mt-8 text-sm text-gray-600">{strings.share.reportThanks}</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-8 text-sm text-gray-600 underline hover:text-gray-900">
        {strings.share.reportButton}
      </button>
    );
  }
  return (
    <form
      className="mt-8 rounded-lg border border-gray-200 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        try {
          await api.reportShare(slug, reason);
          setState('sent');
        } catch {
          setState('error');
        }
      }}
    >
      <label className="block text-sm text-gray-700">
        {strings.share.reportPrompt}
        <select
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
        >
          <option value="" disabled>{strings.share.reportChoose}</option>
          {Object.entries(strings.share.reportReasons).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </label>
      {state === 'error' && <p role="alert" className="mt-2 text-sm text-red-600">{strings.share.reportError}</p>}
      <button
        type="submit"
        disabled={!reason || state === 'sending'}
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {strings.share.reportSubmit}
      </button>
    </form>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareView />
    </Suspense>
  );
}
