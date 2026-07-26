'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';

interface Assertion { kind: string; value: string }
interface TestCase { name: string; var_values: string; assertions: Assertion[] }
type CaseResult = { name: string; pass: boolean; output: string; assertions: Array<{ kind: string; value: string; pass: boolean; detail: string }> };

const ASSERTION_KINDS = ['contains', 'not_contains', 'regex', 'max_words', 'judge'];

export default function TestsPage() {
  const [prompt, setPrompt] = useState('Answer the question concisely: {{question}}');
  const [cases, setCases] = useState<TestCase[]>([
    { name: 'Mentions Paris', var_values: 'question = capital of France', assertions: [{ kind: 'contains', value: 'Paris' }] },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<CaseResult[] | null>(null);
  const [passRate, setPassRate] = useState(0);

  const parseVars = (s: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of s.split('\n')) { const i = line.indexOf('='); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    return out;
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const res = await api.runPromptTests({
        prompt,
        cases: cases.map((c) => ({ name: c.name, var_values: parseVars(c.var_values), assertions: c.assertions })),
      });
      setResults(res.results);
      setPassRate(res.pass_rate);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? strings.tools.genericError);
    } finally {
      setBusy(false);
    }
  };

  const setCase = (i: number, patch: Partial<TestCase>) => setCases((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-900">{strings.regression.title}</h1>
      <p className="mt-1 text-sm text-stone-500">{strings.regression.subtitle}</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">Prompt (with {'{{'}variables{'}}'}) </label>
          <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-stone-900 focus:outline-none" />
        </div>

        {cases.map((c, i) => (
          <div key={i} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <input value={c.name} onChange={(e) => setCase(i, { name: e.target.value })} placeholder={strings.regression.caseName} className="w-56 rounded-md border border-stone-300 px-2 py-1 text-sm font-medium focus:border-stone-900 focus:outline-none" />
              {cases.length > 1 && <button onClick={() => setCases(cases.filter((_, j) => j !== i))} className="text-xs text-stone-400 hover:text-stone-700">Remove</button>}
            </div>
            <textarea rows={1} value={c.var_values} onChange={(e) => setCase(i, { var_values: e.target.value })} placeholder="question = capital of France" className="mt-2 w-full rounded-md border border-stone-300 px-3 py-1.5 font-mono text-xs focus:border-stone-900 focus:outline-none" />
            <div className="mt-2 space-y-1.5">
              {c.assertions.map((a, ai) => (
                <div key={ai} className="flex items-center gap-2">
                  <select value={a.kind} onChange={(e) => setCase(i, { assertions: c.assertions.map((x, j) => (j === ai ? { ...x, kind: e.target.value } : x)) })} className="rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-stone-900 focus:outline-none">
                    {ASSERTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input value={a.value} onChange={(e) => setCase(i, { assertions: c.assertions.map((x, j) => (j === ai ? { ...x, value: e.target.value } : x)) })} className="flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-stone-900 focus:outline-none" />
                  {c.assertions.length > 1 && <button onClick={() => setCase(i, { assertions: c.assertions.filter((_, j) => j !== ai) })} className="text-stone-400 hover:text-stone-700">×</button>}
                </div>
              ))}
              <button onClick={() => setCase(i, { assertions: [...c.assertions, { kind: 'contains', value: '' }] })} className="text-xs text-emerald-700 hover:underline">{strings.regression.addAssertion}</button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCases([...cases, { name: `Case ${cases.length + 1}`, var_values: '', assertions: [{ kind: 'contains', value: '' }] }])} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">{strings.regression.addCase}</button>
          <button onClick={() => void run()} disabled={busy} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? strings.regression.running : strings.regression.run}</button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {results && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-stone-900">Results</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${passRate === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{strings.regression.passRate(passRate)}</span>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`rounded-lg border p-3 ${r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <p className="text-sm font-medium text-stone-800">{r.pass ? '✓' : '✗'} {r.name}</p>
                <ul className="mt-1 space-y-0.5">
                  {r.assertions.map((a, ai) => (
                    <li key={ai} className={`text-xs ${a.pass ? 'text-emerald-700' : 'text-red-700'}`}>{a.pass ? '✓' : '✗'} {a.kind} “{a.value}” — {a.detail}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
