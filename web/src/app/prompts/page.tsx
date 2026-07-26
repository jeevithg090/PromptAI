'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { useRequireAuth } from '@/components/AuthProvider';

interface PromptRow { id: string; platform_id: string; version: number; strength_score: number | null; created_at: string; }

export default function PromptsPage() {
  useRequireAuth();
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.promptsList()
      .then((r) => setPrompts((r.prompts as PromptRow[]) ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">{strings.prompts.listTitle}</h1>
      <p className="mt-2 text-xs text-gray-400">{strings.prompts.interimNote}</p>

      {loading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : prompts.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">{strings.prompts.listEmpty}</p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {prompts.map((p) => (
            <li key={p.id}>
              <Link href={`/prompts/view?id=${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <span className="font-medium text-gray-800">{p.platform_id}</span>
                <span className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{strings.prompts.version.replace('{n}', String(p.version))}</span>
                  {p.strength_score != null && <span>{strings.prompts.strength.replace('{n}', String(p.strength_score))}</span>}
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
