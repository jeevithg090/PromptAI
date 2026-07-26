'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { formatTokens } from '@/lib/tokens';

interface Step { name: string; prompt: string; output_var: string }
type StepResult = { name: string; output_var: string; resolved_prompt: string; output: string; tokens_used: number };

const STARTER: Step[] = [
  { name: 'Outline', prompt: 'Write a tight 5-point outline for an article about {{topic}}.', output_var: 'outline' },
  { name: 'Draft', prompt: 'Write a 200-word article from this outline:\n{{outline}}', output_var: 'article' },
];

export default function WorkflowsPage() {
  const [name, setName] = useState('My workflow');
  const [inputs, setInputs] = useState('topic = sustainable coffee farming');
  const [steps, setSteps] = useState<Step[]>(STARTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pf_workflow');
      if (saved) {
        const w = JSON.parse(saved);
        if (w.name) setName(w.name);
        if (w.inputs) setInputs(w.inputs);
        if (Array.isArray(w.steps) && w.steps.length) setSteps(w.steps);
      }
    } catch { /* ignore */ }
  }, []);

  const persist = (next: Partial<{ name: string; inputs: string; steps: Step[] }>) => {
    const w = { name, inputs, steps, ...next };
    localStorage.setItem('pf_workflow', JSON.stringify(w));
  };

  const parseInputs = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of inputs.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return out;
  };

  const setStep = (i: number, patch: Partial<Step>) => {
    setSteps((prev) => { const next = prev.map((s, j) => (j === i ? { ...s, ...patch } : s)); persist({ steps: next }); return next; });
  };

  const run = async () => {
    if (busy || steps.some((s) => !s.prompt.trim() || !s.output_var.trim())) return;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const res = await api.runWorkflow({ name, steps, inputs: parseInputs() });
      setResults(res.results);
      setTotalTokens(res.total_tokens);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? strings.tools.genericError);
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name, inputs: parseInputs(), steps }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name.replace(/\s+/g, '-')}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-900">{strings.workflows.title}</h1>
      <p className="mt-1 text-sm text-stone-500">{strings.workflows.subtitle}</p>

      <div className="mt-6 space-y-4">
        <input value={name} onChange={(e) => { setName(e.target.value); persist({ name: e.target.value }); }} className="w-full max-w-sm rounded-md border border-stone-300 px-3 py-2 text-sm font-medium focus:border-stone-900 focus:outline-none" />
        <div>
          <label className="block text-sm font-medium text-stone-700">{strings.workflows.inputsLabel}</label>
          <textarea rows={2} value={inputs} onChange={(e) => { setInputs(e.target.value); persist({ inputs: e.target.value }); }} placeholder={strings.workflows.inputsPlaceholder} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-stone-900 focus:outline-none" />
        </div>

        {steps.map((step, i) => (
          <div key={i} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">{i + 1}</span>
              {steps.length > 1 && <button onClick={() => { const next = steps.filter((_, j) => j !== i); setSteps(next); persist({ steps: next }); }} className="text-xs text-stone-400 hover:text-stone-700">{strings.workflows.removeStep}</button>}
            </div>
            <input value={step.name} onChange={(e) => setStep(i, { name: e.target.value })} placeholder={strings.workflows.stepName} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-stone-900 focus:outline-none" />
            <textarea rows={3} value={step.prompt} onChange={(e) => setStep(i, { prompt: e.target.value })} placeholder={strings.workflows.stepPrompt} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-stone-900 focus:outline-none" />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-stone-500">{strings.workflows.outputVar}</span>
              <input value={step.output_var} onChange={(e) => setStep(i, { output_var: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} className="w-40 rounded-md border border-stone-300 px-2 py-1 font-mono text-xs focus:border-stone-900 focus:outline-none" />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => { const next = [...steps, { name: `Step ${steps.length + 1}`, prompt: '', output_var: `out${steps.length + 1}` }]; setSteps(next); persist({ steps: next }); }} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">{strings.workflows.addStep}</button>
          <button onClick={exportJson} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">{strings.workflows.exportJson}</button>
          <button onClick={() => void run()} disabled={busy} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? strings.workflows.running : strings.workflows.run}</button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {results && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Run</h2>
            <span className="text-xs text-stone-400">{strings.workflows.totalTokens(totalTokens)}</span>
          </div>
          <div className="space-y-3">
            {results.map((r, i) => (
              <details key={i} className="rounded-lg border border-stone-200 bg-white" open>
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-stone-700">
                  {i + 1}. {r.name} <span className="ml-1 text-xs text-stone-400">→ {r.output_var} · {formatTokens(r.tokens_used)} tok</span>
                </summary>
                <pre className="whitespace-pre-wrap border-t border-stone-100 px-4 py-3 font-mono text-xs text-stone-700">{r.output}</pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
