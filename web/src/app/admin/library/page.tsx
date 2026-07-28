'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, type PendingLibraryEntry } from '@/lib/api';
import { useRequireAuth } from '@/components/AuthProvider';

type ModerationResult = { id: string; ok: boolean; message?: string };

export default function AdminLibraryPage() {
  useRequireAuth();
  const [entries, setEntries] = useState<PendingLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lastResult, setLastResult] = useState<ModerationResult | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminApi
      .listPending()
      .then((rows) => setEntries(rows))
      .catch((e: { status?: number; message?: string }) => {
        if (e.status === 401) setError('Sign in required to view the moderation queue.');
        else if (e.status === 403) setError('Your account is not on the admin allowlist.');
        else setError(e.message ?? 'Could not load the moderation queue.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    setLastResult(null);
    try {
      await adminApi.moderate(id, action, notes[id]?.trim() || undefined);
      setEntries((rows) => rows.filter((r) => r.id !== id));
      setLastResult({ id, ok: true, message: `${action === 'approve' ? 'Approved' : 'Rejected'} entry ${id.slice(0, 8)}` });
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'moderation failed';
      setLastResult({ id, ok: false, message: msg });
    } finally {
      setBusyId(null);
    }
  };

  const templateSnippet = (template: unknown): string => {
    if (typeof template === 'string') return template;
    if (Array.isArray(template)) {
      return template
        .map((n) => {
          if (n && typeof n === 'object' && 'value' in n) return String((n as { value: unknown }).value);
          return typeof n === 'string' ? n : '';
        })
        .filter(Boolean)
        .join('\n');
    }
    try {
      return JSON.stringify(template, null, 2);
    } catch {
      return String(template ?? '');
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700">
          Admin · Library moderation
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Pending community submissions</h1>
        <p className="mt-2 text-sm text-stone-600">
          Approve moves an entry to the public library. Reject hides it and records the reviewer note.
          Rejected entries stay in the database for audit; they never surface publicly.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {lastResult && (
        <div
          className={`mb-4 rounded border p-3 text-sm ${
            lastResult.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-red-300 bg-red-50 text-red-800'
          }`}
        >
          {lastResult.message}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-stone-600">
          {loading ? 'Loading…' : `${entries.length} pending`}
        </div>
        <button
          onClick={load}
          className="rounded border border-stone-300 bg-white px-3 py-1 text-sm text-stone-700 hover:bg-stone-50"
        >
          Refresh
        </button>
      </div>

      {!loading && !error && entries.length === 0 && (
        <div className="rounded border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
          Queue empty. Nothing pending review.
        </div>
      )}

      <ul className="space-y-4">
        {entries.map((e) => {
          const isBusy = busyId === e.id;
          const isOpen = !!expanded[e.id];
          return (
            <li key={e.id} className="rounded border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-stone-900">{e.title || '(untitled)'}</h2>
                    {e.modality && (
                      <span className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-xs text-stone-700">
                        {e.modality}
                      </span>
                    )}
                    {(e.platform_tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {e.description && (
                    <p className="mt-1 text-sm text-stone-700">{e.description}</p>
                  )}
                  <p className="mt-2 text-xs text-stone-500">
                    Submitted {new Date(e.created_at).toLocaleString()}
                    {e.submitted_email ? ` · ${e.submitted_email}` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setExpanded((s) => ({ ...s, [e.id]: !isOpen }))}
                className="mt-3 text-xs font-medium text-emerald-700 hover:underline"
              >
                {isOpen ? 'Hide template' : 'Show template'}
              </button>
              {isOpen && (
                <pre className="mt-2 max-h-64 overflow-auto rounded border border-stone-200 bg-stone-50 p-3 text-xs text-stone-800">
                  {templateSnippet(e.template)}
                </pre>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  placeholder="Reviewer note (optional)"
                  value={notes[e.id] ?? ''}
                  onChange={(ev) => setNotes((s) => ({ ...s, [e.id]: ev.target.value }))}
                  className="flex-1 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400"
                  disabled={isBusy}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => moderate(e.id, 'approve')}
                    disabled={isBusy}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isBusy ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => moderate(e.id, 'reject')}
                    disabled={isBusy}
                    className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-xs text-stone-500">
        Backed by the physically separate admin service (§21.3). It holds no decryption capability and only
        writes to <code className="text-stone-700">library_entries.moderation_status</code>.
        Access is gated by Supabase JWT plus the <code className="text-stone-700">ADMIN_ALLOWED_EMAILS</code>
        allowlist or an <code className="text-stone-700">admin_roles</code> row.
      </p>
    </main>
  );
}
