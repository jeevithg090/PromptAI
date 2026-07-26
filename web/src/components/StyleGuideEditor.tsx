'use client';

import { useState, useEffect } from 'react';
import { strings } from '@/lib/strings';

interface Rule { kind: string; value: string }

const KINDS: Array<{ id: string; label: string; placeholder: string }> = [
  { id: 'banned_term', label: 'Banned term', placeholder: 'e.g. cutting-edge' },
  { id: 'required_term', label: 'Required term', placeholder: 'e.g. disclaimer' },
  { id: 'max_length_tokens', label: 'Max length (tokens)', placeholder: 'e.g. 400' },
  { id: 'tone', label: 'Required tone', placeholder: 'e.g. warm and concise' },
  { id: 'required_node', label: 'Required node', placeholder: 'e.g. negative_prompt' },
];

/**
 * Style Guide editor (V2.8) — the user's implicit rules, persisted client-side
 * (localStorage) and sent with each /lint request. No server persistence needed
 * for personal rules; teams would move this to the DB.
 */
export default function StyleGuideEditor() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [kind, setKind] = useState('banned_term');
  const [value, setValue] = useState('');

  useEffect(() => {
    try { setRules(JSON.parse(localStorage.getItem('pf_style_rules') ?? '[]')); } catch { /* ignore */ }
  }, []);

  const persist = (next: Rule[]) => {
    setRules(next);
    localStorage.setItem('pf_style_rules', JSON.stringify(next));
  };

  const add = () => {
    if (!value.trim()) return;
    persist([...rules, { kind, value: value.trim() }].slice(0, 50));
    setValue('');
  };

  return (
    <div>
      <label className="block text-sm font-medium text-stone-700">{strings.styleGuide.title}</label>
      <p className="mt-0.5 text-xs text-stone-400">{strings.styleGuide.subtitle}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-stone-900 focus:outline-none">
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={KINDS.find((k) => k.id === kind)?.placeholder}
          className="w-56 rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-stone-900 focus:outline-none"
        />
        <button onClick={add} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-700">{strings.styleGuide.add}</button>
      </div>

      {rules.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rules.map((r, i) => (
            <li key={i} className="flex items-center justify-between rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs">
              <span className="text-stone-700"><span className="font-medium">{KINDS.find((k) => k.id === r.kind)?.label ?? r.kind}:</span> {r.value}</span>
              <button onClick={() => persist(rules.filter((_, j) => j !== i))} aria-label="Remove" className="text-stone-400 hover:text-stone-700">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
