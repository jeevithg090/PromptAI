'use client';

import { useState, useEffect } from 'react';
import { strings } from '@/lib/strings';
import { api } from '@/lib/api';
import type { SessionSummary } from '@/lib/api-types';
import { useRequireAuth } from '@/components/AuthProvider';

function stateLabel(state: string): string {
  switch (state) {
    case 'awaiting_clarification': return strings.historyStateClarifying;
    case 'created':
    case 'context_resolved':
    case 'intent_classified':
    case 'docs_retrieved':
    case 'clarifying':
    case 'drafting': return strings.historyStateDrafting;
    case 'scored':
    case 'refined':
    case 'rated':
    case 'completed': return strings.historyStateDone;
    default: return strings.historyStateError;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function HistoryPage() {
  useRequireAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.sessionsList().then((res) => {
      if (res.status === 'ok' && Array.isArray(res.sessions)) {
        setSessions(res.sessions as SessionSummary[]);
      } else {
        setError(strings.errorServer);
      }
    }).catch(() => setError(strings.errorNetwork))
    .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-gray-600">{strings.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.historyTitle}</h1>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {sessions.length === 0 && !error && (
        <p className="mt-8 text-sm text-gray-500">{strings.historyEmpty}</p>
      )}

      {sessions.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{strings.historyPlatformLabel}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{strings.historyStateLabel}</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">{strings.historyScoreLabel}</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">{strings.historyDateLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {s.platform_id?.replace(/_/g, ' ')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {stateLabel(s.final_state)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                    {s.strength_score != null ? `${s.strength_score}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-gray-500">
                    {formatDate(s.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
