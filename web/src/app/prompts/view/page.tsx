'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { useRequireAuth } from '@/components/AuthProvider';

interface VersionMeta { id: string; version: number; strength_score: number | null; created_at: string; }
interface NodeLite { type: string; value: string; }
interface VersionDetail { version: number; strength_score: number | null; nodes_json: NodeLite[]; }
interface Diff { added: string[]; removed: string[]; changed: Array<{ type: string; before: string; after: string }>; }

function PromptDetail() {
  useRequireAuth();
  const params = useSearchParams();
  const promptId = params.get('id') ?? '';

  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!promptId) return;
    const r = await api.promptVersions(promptId);
    const vs = (r.versions as VersionMeta[]) ?? [];
    setVersions(vs);
    if (vs.length > 0) {
      const head = vs[vs.length - 1].version;
      const d = await api.promptVersion(promptId, head);
      setSelected(d.version as unknown as VersionDetail);
      setDiffFrom(vs[0].version);
      setDiffTo(head);
    }
  }, [promptId]);

  useEffect(() => { void loadVersions(); }, [loadVersions]);

  const viewVersion = async (v: number) => {
    const d = await api.promptVersion(promptId, v);
    setSelected(d.version as unknown as VersionDetail);
  };

  const runDiff = async () => {
    if (diffFrom == null || diffTo == null) return;
    const r = await api.promptDiff(promptId, diffFrom, diffTo);
    setDiff(r.diff);
  };

  const restore = async (v: number) => {
    setBusy(true);
    try {
      await api.promptRestore(promptId, v);
      await loadVersions();
    } finally {
      setBusy(false);
    }
  };

  const headVersion = versions.length ? versions[versions.length - 1].version : null;

  // Share controls (F2.4).
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'creating' | 'blocked'>('idle');
  const [shareCopied, setShareCopied] = useState(false);
  const createShare = async () => {
    setShareState('creating');
    try {
      const r = await api.createShare(promptId);
      setShareUrl(`/share/view?slug=${r.slug}`);
      setShareState('idle');
    } catch (e) {
      setShareState((e as { status?: number }).status === 422 ? 'blocked' : 'idle');
    }
  };
  const revokeShare = async () => { await api.revokeShare(promptId); setShareUrl(null); };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <aside>
          <h2 className="text-sm font-semibold text-gray-700">{strings.prompts.versionsTitle}</h2>
          <ul className="mt-3 space-y-1">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => void viewVersion(v.version)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    selected?.version === v.version ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{strings.prompts.version.replace('{n}', String(v.version))}</span>
                  {v.strength_score != null && <span className="text-xs text-gray-400">{v.strength_score}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="space-y-8">
          {selected && (
            <div>
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">{strings.prompts.version.replace('{n}', String(selected.version))}</h1>
                {headVersion != null && selected.version !== headVersion && (
                  <button onClick={() => void restore(selected.version)} disabled={busy}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {strings.prompts.restore}
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-400">{strings.prompts.restoreNote}</p>

              {/* Share controls (F2.4) */}
              <div className="mt-3 flex items-center gap-3 text-sm">
                {shareUrl ? (
                  <>
                    <button
                      onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`); setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); }}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
                    >
                      {shareCopied ? strings.share.copied : strings.share.copyLink}
                    </button>
                    <button onClick={() => void revokeShare()} className="text-gray-500 hover:underline">{strings.share.revoke}</button>
                  </>
                ) : (
                  <button
                    onClick={() => void createShare()}
                    disabled={shareState === 'creating'}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {shareState === 'creating' ? strings.share.creating : strings.share.button}
                  </button>
                )}
                {shareState === 'blocked' && <span className="text-red-600">{strings.share.blocked}</span>}
              </div>

              <div className="mt-4 space-y-1.5">
                {selected.nodes_json?.map((n) => (
                  <div key={n.type} className="flex gap-3 text-sm">
                    <span className="min-w-[130px] text-gray-400">{n.type}</span>
                    <span className="text-gray-800">{n.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {versions.length > 1 && (
            <div className="rounded-lg border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700">{strings.prompts.diffTitle}</h2>
              <div className="mt-3 flex items-center gap-3 text-sm">
                <label>{strings.prompts.diffFrom}
                  <select className="ml-1 rounded border-gray-300" value={diffFrom ?? ''} onChange={(e) => setDiffFrom(Number(e.target.value))}>
                    {versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}
                  </select>
                </label>
                <label>{strings.prompts.diffTo}
                  <select className="ml-1 rounded border-gray-300" value={diffTo ?? ''} onChange={(e) => setDiffTo(Number(e.target.value))}>
                    {versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}
                  </select>
                </label>
                <button onClick={() => void runDiff()} className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700">Compare</button>
              </div>
              {diff && (
                <div className="mt-4 space-y-2 text-sm">
                  {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
                    <p className="text-gray-500">{strings.prompts.noDiff}</p>
                  )}
                  {diff.added.map((t) => <div key={`a${t}`} className="rounded bg-green-50 px-2 py-1 text-green-700">+ {strings.prompts.diffAdded}: {t}</div>)}
                  {diff.removed.map((t) => <div key={`r${t}`} className="rounded bg-red-50 px-2 py-1 text-red-700">− {strings.prompts.diffRemoved}: {t}</div>)}
                  {diff.changed.map((c) => (
                    <div key={`c${c.type}`} className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                      ~ {c.type}: <span className="line-through opacity-60">{c.before}</span> → {c.after}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function PromptDetailPage() {
  return (
    <Suspense fallback={null}>
      <PromptDetail />
    </Suspense>
  );
}
