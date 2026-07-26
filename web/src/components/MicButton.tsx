'use client';

import { useDictation } from '@/lib/useDictation';
import { strings } from '@/lib/strings';

interface MicButtonProps {
  /** Called with recognized text — the caller inserts at cursor (never replaces). */
  onText: (text: string) => void;
  className?: string;
}

/**
 * Dictation mic button (F1.3). Idle / listening (slow pulse) / processing
 * states; keyboard-operable; respects prefers-reduced-motion (no pulse).
 * Hidden by the caller when the server reports STT disabled.
 */
export default function MicButton({ onText, className }: MicButtonProps) {
  const { state, interim, error, start, stop } = useDictation(onText);
  const active = state === 'listening';

  if (state === 'unsupported') return null;

  const label =
    state === 'listening' ? strings.mic.listening :
    state === 'processing' ? strings.mic.processing :
    strings.mic.start;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={active ? stop : () => void start()}
        aria-pressed={active}
        aria-label={label}
        title={label}
        disabled={state === 'processing'}
        className={
          className ??
          `inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
            active
              ? 'border-red-400 bg-red-50 text-red-600 motion-safe:animate-pulse'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          } disabled:opacity-50`
        }
      >
        {/* Simple mic glyph */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="17" x2="12" y2="22" />
        </svg>
      </button>
      {interim && <span className="text-xs italic text-gray-400" aria-live="polite">{interim}</span>}
      {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
    </span>
  );
}
