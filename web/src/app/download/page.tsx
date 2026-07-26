'use client';

import { useEffect, useState } from 'react';
import { strings } from '@/lib/strings';

type OS = 'mac' | 'windows' | 'other';

const RELEASES = 'https://github.com/jeevithg090/PromptAI/releases/latest';

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const p = navigator.platform.toLowerCase() + ' ' + navigator.userAgent.toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'windows';
  return 'other';
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS>('other');
  useEffect(() => setOs(detectOS()), []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">{strings.download.title}</h1>
      <p className="mt-2 text-gray-600">{strings.download.subtitle}</p>

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={RELEASES}
          className="rounded-lg bg-emerald-600 px-6 py-3 text-center font-medium text-white hover:bg-emerald-700"
        >
          {os === 'mac' ? strings.download.mac : os === 'windows' ? strings.download.windows : strings.download.generic}
        </a>
        <a href={RELEASES} className="text-center text-sm text-emerald-600 hover:underline">
          {strings.download.allPlatforms}
        </a>
      </div>

      <div className="mt-10 space-y-6 text-sm text-gray-600">
        <div>
          <h2 className="font-semibold text-gray-800">{strings.download.macNoteTitle}</h2>
          <p className="mt-1">{strings.download.macNote}</p>
        </div>
        <div>
          <h2 className="font-semibold text-gray-800">{strings.download.winNoteTitle}</h2>
          <p className="mt-1">{strings.download.winNote}</p>
        </div>
      </div>
    </main>
  );
}
