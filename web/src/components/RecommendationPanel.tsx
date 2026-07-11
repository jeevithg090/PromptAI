'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { Recommendation, Platform } from '@/lib/api-types';

interface RecommendationPanelProps {
  idea: string;
  platforms: Platform[];
  onSelectPlatform: (platformId: string) => void;
}

const MODALITIES = [
  { id: 'text_to_image', label: 'Text to Image' },
  { id: 'text_to_video', label: 'Text to Video' },
  { id: 'chat_persona', label: 'Chat Persona' },
  { id: 'reasoning_code', label: 'Reasoning & Code' },
  { id: 'extraction_classification', label: 'Extraction & Classification' },
  { id: 'long_form_writing', label: 'Long Form Writing' },
];

function costTierLabel(tier: number): string {
  return '$'.repeat(tier) || '$';
}

function latencyTierLabel(tier: number): string {
  if (tier <= 1) return 'Fast';
  if (tier === 2) return 'Medium';
  return 'Slow';
}

function scoreBadgeColor(score: number): string {
  if (score >= 90) return 'bg-emerald-100 text-emerald-800';
  if (score >= 70) return 'bg-blue-100 text-blue-800';
  if (score >= 40) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export default function RecommendationPanel({ idea, platforms, onSelectPlatform }: RecommendationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [modality, setModality] = useState('text_to_image');
  const [prioritizeQuality, setPrioritizeQuality] = useState(0.5);
  const [prioritizeCost, setPrioritizeCost] = useState(0.5);
  const [prioritizeLatency, setPrioritizeLatency] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState('');
  const [resultsShown, setResultsShown] = useState(false);

  const handleFind = async () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError('');
    setResultsShown(false);
    try {
      const result = await api.recommend({
        modality,
        prioritizeQuality,
        prioritizeCost,
        prioritizeLatency,
      });
      setRecommendations(result.recommendations.slice(0, 4));
      setResultsShown(true);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.errorNetwork);
    } finally {
      setLoading(false);
    }
  };

  const findPlatformId = (provider: string, modelId: string): string => {
    const match = platforms.find(
      (p) => p.display_name.toLowerCase() === provider.toLowerCase()
    );
    return match?.platform_id ?? modelId;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {strings.recommendation.title}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Modality</label>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              {MODALITIES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quality</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={prioritizeQuality}
                onChange={(e) => setPrioritizeQuality(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={prioritizeCost}
                onChange={(e) => setPrioritizeCost(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Speed</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={prioritizeLatency}
                onChange={(e) => setPrioritizeLatency(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleFind}
            disabled={!idea.trim() || loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {strings.recommendation.findButton}
          </button>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
              {strings.recommendation.loading}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {resultsShown && recommendations.length === 0 && !error && (
            <p className="text-sm text-gray-500">{strings.recommendation.empty}</p>
          )}

          {recommendations.length > 0 && (
            <div className="space-y-3">
              {recommendations.map((rec) => {
                const displayName = rec.model.display_name;
                const platformId = findPlatformId(rec.model.provider, rec.model.model_id);
                return (
                  <div
                    key={rec.model.model_id}
                    className="rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{rec.model.provider}</p>
                        <p className="text-xs text-gray-500">{displayName}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadgeColor(rec.score)}`}>
                        {rec.score}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 mb-2">
                      {strings.recommendation.tradeoff.replace('{tradeoff}', rec.tradeoff)}
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                      <span>{strings.recommendation.costTier.replace('{tier}', costTierLabel(rec.model.cost_tier))}</span>
                      <span>{strings.recommendation.latencyTier.replace('{tier}', latencyTierLabel(rec.model.latency_tier))}</span>
                      <span>{strings.recommendation.contextWindow.replace('{tokens}', String(rec.model.context_window))}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectPlatform(platformId)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      {strings.recommendation.draftFor.replace('{platform}', rec.model.provider)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
