'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import NodeEditor from '@/components/NodeEditor';
import { toDesignedResponse } from '@/lib/nodes';
import type { Platform, DesignedNode, DesignedResponse } from '@/lib/api-types';

type Diagnosis = { node_type: string; fault: string; evidence: string; severity: 'high' | 'medium' | 'low' };

const SEV_STYLE: Record<string, string> = {
  high: 'border-red-200 bg-red-50 text-red-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-stone-200 bg-stone-50 text-stone-700',
};

export default function DebugPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformId, setPlatformId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [actual, setActual] = useState('');
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ diagnosis: Diagnosis[]; patched_nodes: DesignedNode[]; patch_summary: string } | null>(null);
  const [patched, setPatched] = useState<DesignedResponse | null>(null);

  useEffect(() => {
    api.platforms().then((r) => setPlatforms(r.platforms)).catch(() => {});
  }, []);

  const run = async () => {
    if (!prompt.trim() || !actual.trim() || !expected.trim() || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await api.debug({ prompt, actual_output: actual, expected, platform_id: platformId || undefined });
      setResult({ diagnosis: res.diagnosis, patched_nodes: res.patched_nodes, patch_summary: res.patch_summary });
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? strings.tools.genericError);
    } finally {
      setBusy(false);
    }
  };

  const openPatched = async () => {
    if (!result) return;
    const platformName = platforms.find((p) => p.platform_id === platformId)?.display_name ?? platformId ?? 'Prompt';
    const res = await toDesignedResponse(platformId || 'openai_chatgpt', platformName, 'long_form_writing', result.patched_nodes);
    setPatched(res);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-900">{strings.tools.debugTitle}</h1>
      <p className="mt-1 text-sm text-stone-500">{strings.tools.debugSubtitle}</p>

      <div className="mt-6 space-y-4">
        <select
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
          className="block w-full max-w-xs rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
        >
          <option value="">Platform (optional)</option>
          {platforms.map((p) => <option key={p.platform_id} value={p.platform_id}>{p.display_name}</option>)}
        </select>
        {([[strings.tools.debugPrompt, prompt, setPrompt], [strings.tools.debugActual, actual, setActual], [strings.tools.debugExpected, expected, setExpected]] as const).map(([label, val, set], i) => (
          <div key={i}>
            <label className="block text-sm font-medium text-stone-700">{label}</label>
            <textarea
              rows={i === 2 ? 2 : 4}
              value={val}
              onChange={(e) => set(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>
        ))}
        <button
          onClick={() => void run()}
          disabled={busy || !prompt.trim() || !actual.trim() || !expected.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? strings.tools.debugRunning : strings.tools.debugRun}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <div className="mt-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{strings.tools.debugDiagnosis}</h2>
            <div className="mt-3 space-y-2">
              {result.diagnosis.map((d, i) => (
                <div key={i} className={`rounded-lg border p-3 ${SEV_STYLE[d.severity]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide">{d.node_type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] font-medium uppercase">{d.severity}</span>
                  </div>
                  <p className="mt-1 text-sm">{d.fault}</p>
                  {d.evidence && <p className="mt-1 text-xs italic opacity-80">“{d.evidence}”</p>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{strings.tools.debugPatched}</h2>
            <p className="mt-1 text-sm text-stone-500">{result.patch_summary}</p>
            {patched ? (
              <div className="mt-3">
                <NodeEditor response={patched} onUpdate={setPatched} />
              </div>
            ) : (
              <>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-800">
                  {result.patched_nodes.map((n) => n.value).join(', ')}
                </pre>
                <button onClick={() => void openPatched()} className="mt-3 rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700">
                  {strings.tools.debugOpenEditor}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
