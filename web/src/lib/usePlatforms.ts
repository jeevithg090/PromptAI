'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Platform } from './api-types';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Loads the platform registry once, exposing load status and a retry so
 *  pages can show a skeleton / error instead of an empty dropdown. */
export function usePlatforms() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.platforms()
      .then((res) => { if (!cancelled) { setPlatforms(res.platforms); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => { setStatus('loading'); setAttempt((n) => n + 1); }, []);
  return { platforms, status, retry };
}
