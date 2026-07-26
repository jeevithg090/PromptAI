'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import StrengthPanel from '@/components/StrengthPanel';
import NodeEditor from '@/components/NodeEditor';
import type { Platform, DesignedResponse } from '@/lib/api-types';

export default function ReversePage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformId, setPlatformId] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<DesignedResponse | null>(null);

  useEffect(() => {
    api.platforms().then((r) => { setPlatforms(r.platforms); if (r.platforms[0]) setPlatformId(r.platforms[0].platform_id); }).catch(() => {});
  }, []);

  const run = async () => {
    if (!output.trim() || !platformId || busy) return;
    setBusy(true);
    setError('');
    setResponse(null);
    try {
      const res = await api.reverse({ output, platform_id: platformId });
      setResponse(res.response);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? strings.tools.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-900">{strings.tools.reverseTitle}</h1>
      <p className="mt-1 text-sm text-stone-500">{strings.tools.reverseSubtitle}</p>

      <div className="mt-6 space-y-4">
        <select
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
          className="block w-full max-w-xs rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
        >
          {platforms.map((p) => <option key={p.platform_id} value={p.platform_id}>{p.display_name}</option>)}
        </select>
        <div>
          <label className="block text-sm font-medium text-stone-700">{strings.tools.reverseOutput}</label>
          <textarea
            rows={8}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
          />
        </div>
        <button
          onClick={() => void run()}
          disabled={busy || !output.trim() || !platformId}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? strings.tools.reverseRunning : strings.tools.reverseRun}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {response && (
        <div className="mt-8">
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">{strings.tools.reverseDisclaimer}</p>
          </div>
          {response.strength && (
            <div className="mb-4">
              <StrengthPanel strength={response.strength} whyThisWorks={response.whyThisWorks} improvementHints={response.improvementHints} grounding={response.grounding} />
            </div>
          )}
          <NodeEditor response={response} onUpdate={setResponse} />
        </div>
      )}
    </div>
  );
}
