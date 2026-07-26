'use client';

import { useEffect, useState } from 'react';

/**
 * PWA install prompt chip (F2.6). Appears on browsers that fire
 * beforeinstallprompt (Chrome/Edge, mobile especially). Dismissible; never
 * shown once installed.
 */
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }>; }

export default function InstallChip() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!evt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-lg">
      <span className="text-sm text-gray-700">Install PromptForge</span>
      <button
        onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}
        className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Install
      </button>
      <button onClick={() => setDismissed(true)} className="text-gray-400" aria-label="Dismiss">×</button>
    </div>
  );
}
