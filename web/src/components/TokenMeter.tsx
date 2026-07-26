'use client';

import { useState } from 'react';
import { strings } from '@/lib/strings';
import { formatTokens } from '@/lib/tokens';

export interface TokenMeterData {
  tokenCount: number;
  maxPromptTokens: number;
  withinLimit: boolean;
  nearLimit: boolean;
  suggestions: string[];
}

interface TokenMeterProps {
  governor: TokenMeterData;
  /** True when tokenCount is a client-side estimate awaiting a server refresh. */
  estimated?: boolean;
}

/**
 * Token/context meter (V1.5) — makes the backend's governor report visible:
 * how many tokens the assembled prompt costs vs the platform's practical
 * ceiling, with the governor's trimming suggestions when close/over.
 */
export default function TokenMeter({ governor, estimated = false }: TokenMeterProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { tokenCount, maxPromptTokens, withinLimit, nearLimit, suggestions } = governor;
  if (maxPromptTokens <= 0) return null;

  const pct = Math.min(100, Math.round((tokenCount / maxPromptTokens) * 100));
  const over = !withinLimit;
  const barColor = over ? 'bg-red-500' : nearLimit || pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = over ? 'text-red-700' : nearLimit || pct >= 80 ? 'text-amber-700' : 'text-gray-500';

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-gray-600">{strings.tokenMeter.label}</span>
        <span className={`text-xs font-medium tabular-nums ${textColor}`}>
          {estimated ? '≈' : ''}{formatTokens(tokenCount)} / {formatTokens(maxPromptTokens)} ({pct}%)
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100" role="meter" aria-valuenow={tokenCount} aria-valuemin={0} aria-valuemax={maxPromptTokens} aria-label={strings.tokenMeter.label}>
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {(over || nearLimit) && suggestions.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            aria-expanded={showSuggestions}
            className={`text-xs font-medium ${over ? 'text-red-700' : 'text-amber-700'} hover:underline`}
          >
            {over ? strings.tokenMeter.overLimit : strings.tokenMeter.nearLimit}
          </button>
          {showSuggestions && (
            <ul className="mt-1 space-y-0.5">
              {suggestions.map((s, i) => (
                <li key={i} className="text-xs text-gray-600">• {s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
