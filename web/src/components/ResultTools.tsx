'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { toDesignedResponse } from '@/lib/nodes';
import type { DesignedResponse, DesignedNode, Platform } from '@/lib/api-types';

interface ResultToolsProps {
  response: DesignedResponse;
  platforms: Platform[];
  onReplace: (response: DesignedResponse) => void;
}

type SimRow = { model_id: string; display_name: string; provider: string; est_cost_usd: number | null; latency_bucket: string; context_fit_pct: number; truncation_risk: boolean };
type Finding = { start: number; end: number; text: string; risk: string; reason: string; fix: string };
type Change = { node_type: string; action: string; from: string; to: string; reason: string };

const RISK_COLOR: Record<string, string> = {
  ambiguous: 'bg-amber-100 text-amber-900',
  conflicting: 'bg-red-100 text-red-900',
  likely_ignored: 'bg-stone-200 text-stone-700',
  underspecified: 'bg-blue-100 text-blue-900',
};

/** Collapsible section shell. */
function Tool({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-stone-700 hover:bg-stone-50"
      >
        {title}
        <svg className={`h-4 w-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="border-t border-stone-100 px-4 py-3">{children}</div>}
    </div>
  );
}

export default function ResultTools({ response, platforms, onReplace }: ResultToolsProps) {
  return (
    <div className="mt-6 space-y-3">
      <SimulatePanel assembled={response.assembled} />
      <AmbiguityPanel response={response} onReplace={onReplace} />
      <MigratePanel response={response} platforms={platforms} onReplace={onReplace} />
      <LintPanel response={response} />
    </div>
  );
}

function SimulatePanel({ assembled }: { assembled: string }) {
  const [rows, setRows] = useState<SimRow[] | null>(null);
  const [cheapest, setCheapest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.simulate({ assembled });
      setRows(res.rows);
      setCheapest(res.cheapest_safe_pick);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tool title={strings.tools.simulateTitle}>
      <button onClick={() => void run()} disabled={busy} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:opacity-50">
        {busy ? strings.tools.simulateRunning : strings.tools.simulateRun}
      </button>
      {rows && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="py-1 pr-3">Model</th><th className="pr-3">Est. cost</th><th className="pr-3">Speed</th><th className="pr-3">Context fit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model_id} className={`border-t border-stone-100 ${r.model_id === cheapest ? 'bg-emerald-50' : ''}`}>
                  <td className="py-1 pr-3 text-stone-700">
                    {r.display_name}
                    {r.model_id === cheapest && <span className="ml-1 rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-700">{strings.tools.simulateCheapest}</span>}
                  </td>
                  <td className="pr-3 tabular-nums text-stone-600">{r.est_cost_usd == null ? '—' : `$${r.est_cost_usd.toFixed(5)}`}</td>
                  <td className="pr-3 text-stone-600">{r.latency_bucket}</td>
                  <td className={`pr-3 tabular-nums ${r.truncation_risk ? 'text-red-600' : 'text-stone-600'}`}>{r.context_fit_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tool>
  );
}

function AmbiguityPanel({ response, onReplace }: { response: DesignedResponse; onReplace: (r: DesignedResponse) => void }) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.analyzeAmbiguity({ assembled: response.assembled, platform_id: response.platformId });
      setFindings(res.findings);
      setCounts(res.counts);
    } finally {
      setBusy(false);
    }
  };

  const applyFix = async (f: Finding) => {
    const newAssembled = response.assembled.slice(0, f.start) + f.fix + response.assembled.slice(f.end);
    // Re-serialize is not meaningful for free text; replace assembled + drop this finding.
    onReplace({ ...response, assembled: newAssembled });
    setFindings((prev) => (prev ? prev.filter((x) => x !== f) : prev));
  };

  const render = () => {
    if (!findings) return null;
    if (findings.length === 0) return <p className="mt-2 text-xs text-stone-500">{strings.tools.ambiguityClean}</p>;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    const sorted = [...findings].sort((a, b) => a.start - b.start);
    sorted.forEach((f, i) => {
      if (f.start > cursor) parts.push(<span key={`t${i}`}>{response.assembled.slice(cursor, f.start)}</span>);
      parts.push(<span key={`h${i}`} className={`rounded px-0.5 ${RISK_COLOR[f.risk] ?? 'bg-amber-100'}`} title={`${f.risk}: ${f.reason}`}>{f.text}</span>);
      cursor = Math.max(cursor, f.end);
    });
    if (cursor < response.assembled.length) parts.push(<span key="tail">{response.assembled.slice(cursor)}</span>);
    return (
      <div className="mt-3">
        <p className="mb-2 text-xs text-stone-500">{Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}</p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs leading-relaxed text-stone-800">{parts}</p>
        <ul className="mt-2 space-y-1.5">
          {sorted.map((f, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-stone-600"><span className="font-medium">{f.risk}:</span> {f.reason} → <span className="italic">{f.fix}</span></span>
              <button onClick={() => void applyFix(f)} className="shrink-0 rounded border border-stone-300 px-2 py-0.5 text-[10px] hover:bg-stone-50">{strings.tools.ambiguityApply}</button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Tool title={strings.tools.ambiguityTitle}>
      <button onClick={() => void run()} disabled={busy} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:opacity-50">
        {busy ? strings.tools.ambiguityRunning : strings.tools.ambiguityRun}
      </button>
      {render()}
    </Tool>
  );
}

function MigratePanel({ response, platforms, onReplace }: { response: DesignedResponse; platforms: Platform[]; onReplace: (r: DesignedResponse) => void }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ target_assembled: string; source_assembled: string; change_report: Change[]; risk_flags: string[]; target_nodes: DesignedNode[] } | null>(null);

  const run = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await api.migrate({
        nodes: response.nodes.map((n) => ({ type: n.type, value: n.value })),
        source_platform_id: response.platformId,
        target_platform_id: target,
      });
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  const openPorted = async () => {
    if (!result) return;
    const name = platforms.find((p) => p.platform_id === target)?.display_name ?? target;
    onReplace(await toDesignedResponse(target, name, response.taskType, result.target_nodes));
  };

  return (
    <Tool title={strings.tools.migrateTitle}>
      <div className="flex items-center gap-2">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-md border border-stone-300 px-2 py-1.5 text-xs focus:border-stone-900 focus:outline-none">
          <option value="">Target platform…</option>
          {platforms.filter((p) => p.platform_id !== response.platformId).map((p) => <option key={p.platform_id} value={p.platform_id}>{p.display_name}</option>)}
        </select>
        <button onClick={() => void run()} disabled={busy || !target} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:opacity-50">
          {busy ? strings.tools.migrateRunning : strings.tools.migrateRun}
        </button>
      </div>
      {result && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-stone-200 bg-stone-50 px-2 py-1.5 font-mono text-[11px] text-stone-600">{result.source_assembled}</pre>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 font-mono text-[11px] text-stone-800">{result.target_assembled}</pre>
          </div>
          {result.risk_flags.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-amber-700">{strings.tools.migrateRisks}</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">{result.risk_flags.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase text-stone-400">{strings.tools.migrateChanges}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
              {result.change_report.map((c, i) => (
                <li key={i}><span className="font-medium">{c.node_type.replace(/_/g, ' ')}</span> — <span className="text-emerald-700">{c.action}</span>: {c.reason}</li>
              ))}
            </ul>
          </div>
          <button onClick={() => void openPorted()} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700">{strings.tools.migrateOpen}</button>
        </div>
      )}
    </Tool>
  );
}

function LintPanel({ response }: { response: DesignedResponse }) {
  const [violations, setViolations] = useState<Array<{ rule: { kind: string; value: string }; severity: string; where: string; fix_hint: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // Pull the user's saved style rules (V2.8) from localStorage.
      const rules = JSON.parse(localStorage.getItem('pf_style_rules') ?? '[]');
      const res = await api.lint({ assembled: response.assembled, nodes: response.nodes.map((n) => ({ type: n.type, value: n.value })), rules });
      setViolations(res.violations);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tool title={strings.tools.lintTitle}>
      <button onClick={() => void run()} disabled={busy} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:opacity-50">
        {busy ? '…' : 'Check style guide'}
      </button>
      {violations && (violations.length === 0 ? (
        <p className="mt-2 text-xs text-emerald-700">{strings.tools.lintClean}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {violations.map((v, i) => (
            <li key={i} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
              <span className="font-medium">{v.rule.kind.replace(/_/g, ' ')}</span> ({v.rule.value}) — {v.fix_hint}
            </li>
          ))}
        </ul>
      ))}
      <p className="mt-2 text-[10px] text-stone-400">Edit rules in Account → Style Guide.</p>
    </Tool>
  );
}
