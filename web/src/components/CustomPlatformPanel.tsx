'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { saveCustomPlatform, type CustomPlatformEntry } from '@/lib/customPlatforms';

interface CustomPlatformPanelProps {
  /** Called with the new platform id once analysis succeeds and the entry is stored. */
  onCreated: (platformId: string) => void;
}

/**
 * Custom platform intake (V1.1): user pastes a docs URL, the backend fetches
 * the docs (SSRF-guarded) and profiles the platform; we persist the profile
 * client-side (localStorage) and select it in the platform picker.
 */
export default function CustomPlatformPanel({ onCreated }: CustomPlatformPanelProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const analyze = async () => {
    const docsUrl = url.trim();
    if (!docsUrl || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.createCustomPlatform({ docs_url: docsUrl, name: name.trim() || undefined });
      const entry = { platform: res.platform, chunks: res.chunks } as unknown as CustomPlatformEntry;
      saveCustomPlatform(entry);
      setSuccess(strings.customPlatform.success(entry.platform.display_name, res.pages_fetched));
      onCreated(entry.platform.platform_id);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.customPlatform.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">{strings.customPlatform.title}</h3>
      <p className="mt-0.5 text-xs text-gray-500">{strings.customPlatform.subtitle}</p>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="custom-docs-url" className="block text-xs font-medium text-gray-700">
            {strings.customPlatform.urlLabel}
          </label>
          <input
            id="custom-docs-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={strings.customPlatform.urlPlaceholder}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="custom-name" className="block text-xs font-medium text-gray-700">
            {strings.customPlatform.nameLabel}
          </label>
          <input
            id="custom-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={strings.customPlatform.namePlaceholder}
            disabled={busy}
            className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
          />
        </div>

        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy || !url.trim()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {strings.customPlatform.analyze}
        </button>

        {busy && (
          <div className="flex items-center gap-2 text-sm text-gray-600" aria-live="polite">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            {strings.customPlatform.analyzing}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-800">{success}</p>
          </div>
        )}
      </div>
    </div>
  );
}
