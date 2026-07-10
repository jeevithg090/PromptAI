'use client';

import { useState } from 'react';
import { strings } from '@/lib/strings';
import type { StrengthPresentation } from '@/lib/api-types';

interface StrengthPanelProps {
  strength: StrengthPresentation;
  whyThisWorks?: string[];
  improvementHints?: string[];
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function dimBarWidth(dimScore: 1 | 2 | 3): string {
  if (dimScore === 3) return 'w-full';
  if (dimScore === 2) return 'w-2/3';
  return 'w-1/3';
}

function dimBarColor(dimScore: 1 | 2 | 3): string {
  if (dimScore === 3) return 'bg-emerald-400';
  if (dimScore === 2) return 'bg-amber-400';
  return 'bg-red-400';
}

export default function StrengthPanel({ strength, whyThisWorks = [], improvementHints = [] }: StrengthPanelProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [showImprove, setShowImprove] = useState(false);

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 flex-shrink-0">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              strokeWidth="6"
              strokeDasharray={`${(strength.score / 100) * 213.6} 213.6`}
              strokeLinecap="round"
              className={scoreColor(strength.score).replace('text-', 'stroke-')}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${scoreColor(strength.score)}`}>
            {strength.score}
          </span>
        </div>
        <div>
          <p className={`text-lg font-semibold ${scoreColor(strength.score)}`}>{strength.band}</p>
          <p className="text-xs text-gray-400">{strings.resultStrength}</p>
        </div>
      </div>

      {/* Dimension breakdown */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{strings.strengthSubScores}</h3>
        <div className="space-y-1.5">
          {strength.dimensions.map((d) => (
            <div key={d.dimension} className="flex items-center gap-2">
              <span className="w-36 text-xs text-gray-600" title={strings.strengthDimensionInfo}>
                {d.label}
              </span>
              <div className="flex-1">
                <div className="h-2 w-full rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${dimBarColor(d.score)} ${dimBarWidth(d.score)}`} />
                </div>
              </div>
              <span className="w-6 text-center text-xs font-medium text-gray-700">{d.score}</span>
              <span className="w-10 text-right text-[10px] text-gray-400">{d.weight}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Why this works — expandable */}
      {whyThisWorks.length > 0 && (
        <div className="rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setShowWhy(!showWhy)}
            aria-expanded={showWhy}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {strings.strengthWhyWorks}
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${showWhy ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showWhy && (
            <ul className="space-y-2 border-t border-gray-100 px-4 py-3">
              {whyThisWorks.map((lesson, i) => (
                <li key={i} className="text-xs leading-relaxed text-gray-600">
                  {lesson}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* How to improve — expandable */}
      {improvementHints.length > 0 && (
        <div className="rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setShowImprove(!showImprove)}
            aria-expanded={showImprove}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {strings.strengthHowToImprove}
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${showImprove ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showImprove && (
            <ul className="space-y-2 border-t border-gray-100 px-4 py-3">
              {improvementHints.map((hint, i) => (
                <li key={i} className="text-xs leading-relaxed text-gray-600">
                  {hint}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
