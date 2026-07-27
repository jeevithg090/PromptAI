'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/components/AuthProvider';

type Team = { id: string; name: string; owner_id: string; created_at: string };

export default function TeamsPage() {
  useRequireAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [memberInputs, setMemberInputs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.teamsList()
      .then((res) => setTeams((res.teams ?? []) as Team[]))
      .catch(() => setError('Could not load teams.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.createTeam({ name: name.trim() });
      setName('');
      load();
    } catch {
      setError('Could not create the team.');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (teamId: string) => {
    const uid = (memberInputs[teamId] ?? '').trim();
    if (!uid) return;
    setError('');
    setNotice('');
    try {
      await api.addTeamMember(teamId, { user_id: uid, role: 'member' });
      setMemberInputs((m) => ({ ...m, [teamId]: '' }));
      setNotice('Member added.');
    } catch {
      setError('Could not add the member. Check the user ID.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
      <p className="mt-2 text-gray-600">Create a shared team space. Add teammates by their user ID to collaborate.</p>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">New team</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            placeholder="Team name"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500"
          />
          <button
            onClick={create}
            disabled={!name.trim() || busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-gray-600">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No teams yet. Create one above to start collaborating.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {teams.map((t) => (
            <li key={t.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-gray-900">{t.name}</p>
              <p className="mt-0.5 text-xs text-gray-400">Team ID: {t.id}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={memberInputs[t.id] ?? ''}
                  onChange={(e) => setMemberInputs((m) => ({ ...m, [t.id]: e.target.value }))}
                  placeholder="Add member by user ID"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500"
                />
                <button
                  onClick={() => addMember(t.id)}
                  disabled={!(memberInputs[t.id] ?? '').trim()}
                  className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  Add member
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
