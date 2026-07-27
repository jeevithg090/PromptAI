'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/components/AuthProvider';

type Project = { id: string; name: string; description: string | null; default_platform: string | null; created_at: string };

export default function ProjectsPage() {
  useRequireAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.projectsList()
      .then((res) => setProjects((res.projects ?? []) as Project[]))
      .catch(() => setError('Could not load projects.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.createProject({ name: name.trim(), description: description.trim() || undefined });
      setName('');
      setDescription('');
      load();
    } catch {
      setError('Could not create the project.');
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await api.updateProject(id, { name: editName.trim() });
      setEditingId(null);
      load();
    } catch {
      setError('Could not rename the project.');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteProject(id);
      setProjects((p) => p.filter((x) => x.id !== id));
    } catch {
      setError('Could not delete the project.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
      <p className="mt-2 text-gray-600">Group related prompts into a workspace — each project can pin a default platform.</p>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">New project</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            placeholder="Project name"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
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
      ) : projects.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No projects yet. Create one above to start organizing your prompts.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                {editingId === p.id ? (
                  <input
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(p.id); if (e.key === 'Escape') setEditingId(null); }}
                    onBlur={() => saveRename(p.id)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                  />
                ) : (
                  <>
                    <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-gray-500">{p.description}</p>}
                  </>
                )}
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-3 text-sm">
                <button
                  onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                  className="text-emerald-700 hover:underline"
                >
                  Rename
                </button>
                <button onClick={() => remove(p.id)} className="text-red-600 hover:underline">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
