'use client';

import { useState, useEffect, useCallback } from 'react';
import { strings, getLocale, setLocale, LOCALES } from '@/lib/strings';
import { launchTour } from '@/components/Tour';
import StyleGuideEditor from '@/components/StyleGuideEditor';
import BillingSection from '@/components/BillingSection';
import { useRequireAuth } from '@/components/AuthProvider';
import { useEncryption } from '@/components/EncryptionProvider';
import { api } from '@/lib/api';
import { decrypt, isUnlocked, encrypt } from '@/lib/crypto';

interface Connection {
  id: string;
  provider: string;
  status: string;
  created_at: string;
}

interface MemoryEntry {
  id: string;
  scope: string;
  source: string;
  status: string;
  statement_ciphertext: string;
  task_type: string | null;
  created_at: string;
  statement?: string;
}

/** Decrypt a stored memory statement (server stores only ciphertext). */
async function decryptStatement(ciphertext: string): Promise<string | undefined> {
  try {
    const raw = await decrypt<unknown>(ciphertext);
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'statement' in raw) return String((raw as { statement: unknown }).statement ?? '');
  } catch {
    return undefined;
  }
  return undefined;
}

export default function AccountPage() {
  const { user, signOut } = useRequireAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.user_metadata?.name ?? '');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState('openai');
  const [newApiKey, setNewApiKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState('');

  const { isReady: encryptionReady } = useEncryption();

  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [addingMemory, setAddingMemory] = useState(false);
  const [confirmResetMemory, setConfirmResetMemory] = useState(false);

  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const res = await api.getConnections();
      setConnections(res.connections ?? []);
    } catch {
      // silently fail — connections are additive
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  const loadMemory = useCallback(async () => {
    try {
      const res = await api.getMemory();
      const entries = res.entries ?? [];
      const decrypted = await Promise.all(
        entries.map(async (e: MemoryEntry) => ({
          ...e,
          statement: isUnlocked() ? await decryptStatement(e.statement_ciphertext) : undefined,
        }))
      );
      setMemory(decrypted);
    } catch {
      // silently fail — memory is additive
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
    loadMemory();
  }, [loadConnections, loadMemory]);

  const handleSaveName = async () => {
    setEditing(false);
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptforge-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(strings.errorServer);
    } finally {
      setExporting(false);
    }
  };

  const handleAddConnection = async () => {
    if (!newApiKey.trim()) return;
    setAdding(true);
    setConnectionError('');
    try {
      await api.createConnection({ provider: newProvider, api_key: newApiKey.trim() });
      setNewApiKey('');
      setShowAddForm(false);
      await loadConnections();
    } catch {
      setConnectionError(strings.errorServer);
    } finally {
      setAdding(false);
    }
  };

  const handleRevokeConnection = async (id: string) => {
    setRevokingId(id);
    try {
      await api.deleteConnection(id);
      setConfirmRevoke(null);
      await loadConnections();
    } catch {
      setConnectionError(strings.errorServer);
    } finally {
      setRevokingId(null);
    }
  };

  const handleAddMemory = async () => {
    if (!newMemoryText.trim()) return;
    if (!isUnlocked()) return; // encryption must be unlocked to store a statement
    setAddingMemory(true);
    try {
      const ciphertext = await encrypt({ statement: newMemoryText.trim() });
      await api.createMemory({ scope: 'global', statement_ciphertext: ciphertext, source: 'user_added', status: 'active' });
      setNewMemoryText('');
      await loadMemory();
    } catch {
      setConnectionError(strings.errorServer);
    } finally {
      setAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await api.deleteMemory(id);
      await loadMemory();
    } catch {
      setConnectionError(strings.errorServer);
    }
  };

  const handleResetMemory = async () => {
    try {
      await api.resetMemory();
      setConfirmResetMemory(false);
      await loadMemory();
    } catch {
      setConnectionError(strings.errorServer);
    }
  };

  const handleDeleteAccount = async () => {
    setAccountDeleting(true);
    try {
      await api.deleteAccount();
      await signOut();
    } catch {
      setAccountDeleting(false);
      setAccountDeleteConfirm(false);
      setConnectionError(strings.errorServer);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.accountTitle}</h1>

      <div className="mt-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">{strings.accountEmail}</label>
          <p className="mt-1 text-sm text-gray-900">{user?.email ?? '—'}</p>
        </div>

        {/* Plan & usage + upgrade (billing) */}
        <BillingSection />

        {/* Language + onboarding (F2.6) */}
        <div>
          <label htmlFor="locale" className="block text-sm font-medium text-gray-700">{strings.locale.label}</label>
          <div className="mt-1 flex items-center gap-3">
            <select
              id="locale"
              defaultValue={getLocale()}
              onChange={(e) => setLocale(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              {Object.entries(LOCALES).map(([code, l]) => (
                <option key={code} value={code}>{l.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">{strings.locale.note}</span>
          </div>
          <button onClick={() => launchTour()} className="mt-3 text-sm text-emerald-600 hover:underline">
            {strings.tour.relaunch}
          </button>
        </div>

        <div className="border-t border-stone-200 pt-6">
          <StyleGuideEditor />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{strings.accountName}</label>
          {editing ? (
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={handleSaveName}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700"
              >
                {strings.accountSave}
              </button>
              <button
                onClick={() => { setEditing(false); setName(user?.user_metadata?.name ?? ''); }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {strings.cancel}
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm text-gray-900">{user?.user_metadata?.name ?? '—'}</p>
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-gray-600 underline hover:text-gray-900"
              >
                {strings.edit}
              </button>
            </div>
          )}
        </div>

        {/* BYOK provider connections */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">{strings.accountConnections}</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-sm text-gray-600 underline hover:text-gray-900"
            >
              {strings.accountConnectionsAdd}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">{strings.accountConnectionsDesc}</p>

          {showAddForm && (
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex gap-2">
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="google">Google Gemini</option>
                </select>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={strings.accountConnectionsApiKeyPlaceholder}
                  className="block flex-1 rounded-md border border-gray-300 px-3 py-1 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
                <button
                  onClick={handleAddConnection}
                  disabled={adding || !newApiKey.trim()}
                  className="rounded-md bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {adding ? strings.loading : strings.accountConnectionsAdd}
                </button>
              </div>
              {connectionError && <p className="mt-1 text-xs text-red-600">{connectionError}</p>}
            </div>
          )}

          {connectionsLoading ? (
            <p className="mt-2 text-sm text-gray-400">{strings.loading}</p>
          ) : connections.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">{strings.accountConnectionsNone}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900 capitalize">{conn.provider}</span>
                    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs ${
                      conn.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {conn.status}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(conn.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    {confirmRevoke === conn.id ? (
                      <div className="flex gap-2">
                        <span className="text-xs text-gray-500">{strings.accountConnectionsDeleteConfirm}</span>
                        <button
                          onClick={() => handleRevokeConnection(conn.id)}
                          disabled={revokingId === conn.id}
                          className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50"
                        >
                          {revokingId === conn.id ? strings.loading : strings.accountConnectionsDelete}
                        </button>
                        <button
                          onClick={() => setConfirmRevoke(null)}
                          className="text-xs text-gray-500 underline hover:text-gray-700"
                        >
                          {strings.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(conn.id)}
                        className="text-xs text-gray-500 underline hover:text-red-600"
                      >
                        {strings.accountConnectionsDelete}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Memory */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">{strings.accountMemory}</h2>
            {memory.length > 0 && (
              <button
                onClick={() => setConfirmResetMemory(true)}
                className="text-xs text-gray-500 underline hover:text-red-600"
              >
                {strings.accountMemoryReset}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">{strings.accountMemoryDesc}</p>

          {!encryptionReady && (
            <p className="mt-2 text-xs text-amber-600">{strings.accountMemoryLocked}</p>
          )}

          {memoryLoading ? (
            <p className="mt-2 text-sm text-gray-400">{strings.loading}</p>
          ) : memory.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">{strings.accountMemoryNone}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {memory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{entry.statement ?? '🔒 encrypted'}</p>
                    <p className="text-xs text-gray-400">
                      {entry.task_type ?? 'general'} · {entry.status} · {new Date(entry.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteMemory(entry.id)}
                    className="ml-3 text-xs text-gray-500 underline hover:text-red-600"
                  >
                    {strings.accountMemoryDelete}
                  </button>
                </div>
              ))}
            </div>
          )}

          {encryptionReady && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder={strings.accountMemoryAddPlaceholder}
                className="block flex-1 rounded-md border border-gray-300 px-3 py-1 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={handleAddMemory}
                disabled={addingMemory || !newMemoryText.trim()}
                className="rounded-md bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {addingMemory ? strings.loading : strings.accountMemoryAdd}
              </button>
            </div>
          )}

          {confirmResetMemory && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700">{strings.accountMemoryResetConfirm}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleResetMemory}
                  className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500"
                >
                  {strings.accountMemoryReset}
                </button>
                <button
                  onClick={() => setConfirmResetMemory(false)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {strings.cancel}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-6">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? strings.loading : strings.accountExportButton}
          </button>
          <p className="mt-1 text-xs text-gray-500">{strings.accountExport}</p>
          {exportError && <p className="mt-1 text-xs text-red-600">{exportError}</p>}
        </div>

        <div className="border-t pt-6">
          <button
            onClick={() => signOut()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {strings.authSignOut}
          </button>
        </div>

        <div className="border-t pt-6">
          {accountDeleteConfirm ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700">{strings.accountDeleteConfirm}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={accountDeleting}
                  className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {accountDeleting ? strings.loading : strings.accountDeleteData}
                </button>
                <button
                  onClick={() => setAccountDeleteConfirm(false)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {strings.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAccountDeleteConfirm(true)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
            >
              {strings.accountDeleteData}
            </button>
          )}
          <p className="mt-1 text-xs text-gray-500">{strings.accountDeleteHint}</p>
        </div>
      </div>
    </div>
  );
}