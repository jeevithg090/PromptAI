'use client';

import { useEffect, useState } from 'react';
import { api, type ApiError } from '@/lib/api';
import { strings } from '@/lib/strings';

interface ComparePanelProps {
  platformId: string;
  taskType: string;
  promptA: string; // original
  promptB: string; // enhanced
}

/**
 * A/B compare via BYOK (F2.5). Visible only when the user has BYOK entitlement
 * AND an active connection; otherwise an honest upsell chip (never an error).
 * Outputs are ephemeral (server never persists them). The verdict feeds the
 * anonymized /feedback loop.
 */
export default function ComparePanel({ platformId, taskType, promptA, promptB }: ComparePanelProps) {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [outputs, setOutputs] = useState<{ a: string; b: string; la: number; lb: number } | null>(null);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [usage, conns] = await Promise.all([api.meUsage(), api.getConnections()]);
        const hasActive = (conns.connections ?? []).some((c) => c.status === 'active');
        setEligible(usage.byok && hasActive);
      } catch {
        setEligible(false);
      }
    })();
  }, []);

  const run = async () => {
    setState('running');
    try {
      const r = await api.compare({ platform_id: platformId, prompt_a: promptA, prompt_b: promptB });
      setOutputs({ a: r.a.output, b: r.b.output, la: r.a.latency_ms, lb: r.b.latency_ms });
      setState('done');
    } catch (e) {
      setState('error');
      void (e as ApiError);
    }
  };

  const vote = async (outcome: 'worked' | 'didnt_work' | 'mixed') => {
    setVoted(true);
    try {
      await api.feedback({ task_type: taskType, platform_id: platformId, outcome });
    } catch {
      // best-effort — the vote UI still confirms
    }
  };

  if (eligible === null) return null;
  if (!eligible) {
    return <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{strings.compare.upsell}</p>;
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 p-4">
      {state === 'idle' && (
        <button onClick={() => void run()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          {strings.compare.button}
        </button>
      )}
      {state === 'running' && <p className="text-sm text-gray-600">{strings.compare.running}</p>}
      {state === 'error' && <p className="text-sm text-red-600">{strings.compare.error}</p>}
      {state === 'done' && outputs && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <OutputPane title={strings.compare.original} text={outputs.a} latency={outputs.la} />
            <OutputPane title={strings.compare.enhanced} text={outputs.b} latency={outputs.lb} highlight />
          </div>
          <div className="mt-4">
            {voted ? (
              <p className="text-sm text-green-700">{strings.compare.thanks}</p>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">{strings.compare.whichBetter}</span>
                <button onClick={() => void vote('didnt_work')} className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">{strings.compare.voteA}</button>
                <button onClick={() => void vote('worked')} className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">{strings.compare.voteB}</button>
                <button onClick={() => void vote('mixed')} className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">{strings.compare.voteTie}</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OutputPane({ title, text, latency, highlight }: { title: string; text: string; latency: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</span>
        <span className="text-xs text-gray-400">{strings.compare.latency.replace('{ms}', String(latency))}</span>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm text-gray-800">{text}</pre>
    </div>
  );
}
