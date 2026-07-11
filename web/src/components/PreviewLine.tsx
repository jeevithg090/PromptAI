'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';

interface PreviewLineProps {
  platformId: string;
  taskType: string;
  known: Record<string, string>;
  sessionId?: string;
}

export default function PreviewLine({ platformId, taskType, known, sessionId }: PreviewLineProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const knownEntries = Object.entries(known).filter(([, v]) => v.length > 0);
    if (!platformId || !taskType || knownEntries.length === 0) {
      setPreview(null);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.preview({
          platform_id: platformId,
          task_type: taskType,
          known: Object.fromEntries(knownEntries),
          session_id: sessionId,
        });
        setPreview(res.preview ?? null);
      } catch {
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [platformId, taskType, known, sessionId]);

  if (loading) {
    return (
      <div className="mt-3 text-xs text-gray-400 italic">
        {strings.previewLoading}
      </div>
    );
  }

  if (preview === null) return null;

  return (
    <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <span className="text-xs font-medium text-gray-500">{strings.previewLabel}</span>
      <p className="mt-0.5 text-sm text-gray-700">{preview}</p>
    </div>
  );
}
