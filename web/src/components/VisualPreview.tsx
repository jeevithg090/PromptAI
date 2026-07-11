'use client';

import { useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface VisualPreviewProps {
  platformId: string;
  assembled: string;
  sessionId: string;
}

export function VisualPreview({ platformId, assembled, sessionId }: VisualPreviewProps) {
  const [enabled, setEnabled] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mime, setMime] = useState('image/png');
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastAssembledRef = useRef('');

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      await generatePreview();
    } else {
      setImageBase64(null);
      setDisclaimer('');
      setError('');
    }
  };

  const generatePreview = useCallback(async () => {
    if (!assembled || assembled === lastAssembledRef.current) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.visualPreview(sessionId, { platform_id: platformId, assembled });
      setImageBase64(res.imageBase64);
      setMime(res.mime);
      setDisclaimer(res.disclaimer);
      lastAssembledRef.current = assembled;
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      if (err.status === 429) {
        setError('Visual preview limit reached for this session.');
      } else if (err.status === 404) {
        setError('Visual preview is disabled.');
      } else {
        setError(err.message ?? 'Visual preview failed.');
      }
    } finally {
      setLoading(false);
    }
  }, [assembled, platformId, sessionId]);

  const unchanged = assembled === lastAssembledRef.current;
  const hasPreview = imageBase64 && disclaimer;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
        />
        <span className="text-xs text-gray-500">Enable visual preview (uses extra quota)</span>
      </label>

      {enabled && loading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          Generating visual preview…
        </div>
      )}

      {enabled && error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      {enabled && hasPreview && (
        <div className="mt-2 space-y-1">
          <img
            src={`data:${mime};base64,${imageBase64}`}
            alt="Visual preview"
            className="max-w-full rounded border border-gray-200"
          />
          <p className="text-xs text-gray-400 italic">{disclaimer}</p>
          {!unchanged && (
            <button
              onClick={generatePreview}
              disabled={loading}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              Regenerate preview
            </button>
          )}
        </div>
      )}
    </div>
  );
}
