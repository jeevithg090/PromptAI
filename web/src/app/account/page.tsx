'use client';

import { useState } from 'react';
import { strings } from '@/lib/strings';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';

export default function AccountPage() {
  const { user, signOut } = useRequireAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.user_metadata?.name ?? '');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.accountTitle}</h1>

      <div className="mt-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">{strings.accountEmail}</label>
          <p className="mt-1 text-sm text-gray-900">{user?.email ?? '—'}</p>
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
          <button className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500">
            {strings.accountDeleteData}
          </button>
          <p className="mt-1 text-xs text-gray-500">{strings.accountDeleteHint}</p>
        </div>
      </div>
    </div>
  );
}