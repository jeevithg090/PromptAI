import { useState, useEffect } from 'react';

interface CapabilityEntry {
  model_id: string;
  display_name: string;
  provider: string;
  platform_id?: string;
  modalities: string[];
  context_window: number;
  cost_tier: number;
  latency_tier: number;
  strengths: string[];
}

interface RecommendationPanelProps {
  modality: string;
  onSelectPlatform?: (platformId: string) => void;
}

const MODALITY_OPTIONS = ['text', 'code', 'image', 'video'];

export function RecommendationPanel({ modality, onSelectPlatform }: RecommendationPanelProps) {
  const [open, setOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastVerified, setLastVerified] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    chrome.runtime.sendMessage(
      {
        type: 'API_REQUEST',
        method: 'GET',
        path: '/capabilities',
      },
      (response: { status: number; data: { status: string; capabilities: CapabilityEntry[]; last_verified: string } }) => {
        if (response.data?.capabilities) {
          setCapabilities(response.data.capabilities);
          setLastVerified(response.data.last_verified ?? null);
        }
        setLoading(false);
      },
    );
  }, [open]);

  const filtered = capabilities.filter((m) => m.modalities.includes(modality));
  const sorted = [...filtered].sort((a, b) => {
    const scoreA = (6 - a.cost_tier) + (6 - a.latency_tier);
    const scoreB = (6 - b.cost_tier) + (6 - b.latency_tier);
    return scoreB - scoreA;
  });
  const top4 = sorted.slice(0, 4);

  const daysSinceVerified = lastVerified
    ? Math.floor(
        (Date.now() - new Date(lastVerified).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="pf-recommend">
      <button className="pf-btn pf-btn-link pf-rec-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Which model fits this task?'}
      </button>

      {open && (
        <div className="pf-rec-body">
          {loading && (
            <div className="pf-loading">
              <div className="pf-spinner" />
              Loading capabilities...
            </div>
          )}

          {!loading && top4.length === 0 && (
            <p className="pf-rec-empty">No models found for {modality} tasks.</p>
          )}

          {!loading && top4.length > 0 && (
            <>
              <div className="pf-rec-list">
                {top4.map((m) => (
                  <div key={m.model_id} className="pf-rec-card">
                    <div className="pf-rec-card-header">
                      <span className="pf-rec-name">{m.display_name}</span>
                      {m.platform_id && (
                        <button
                          className="pf-rec-draft-link"
                          onClick={() => onSelectPlatform?.(m.platform_id!)}
                        >
                          Draft on {m.provider}
                        </button>
                      )}
                    </div>
                    <div className="pf-rec-dots">
                      <span title="Cost" className="pf-dot-group">
                        {[1, 2, 3, 4, 5].map((t) => (
                          <span
                            key={t}
                            className={`pf-dot ${t <= m.cost_tier ? 'pf-dot--filled' : ''} pf-dot--cost`}
                          />
                        ))}
                        <span className="pf-dot-label">cost</span>
                      </span>
                      <span title="Speed" className="pf-dot-group">
                        {[1, 2, 3, 4, 5].map((t) => (
                          <span
                            key={t}
                            className={`pf-dot ${t <= m.latency_tier ? 'pf-dot--filled' : ''} pf-dot--speed`}
                          />
                        ))}
                        <span className="pf-dot-label">speed</span>
                      </span>
                    </div>
                    <p className="pf-rec-strengths">
                      {m.strengths.slice(0, 3).join(', ')}
                    </p>
                    {m.context_window > 0 && (
                      <p className="pf-rec-ctx">
                        {(m.context_window / 1000).toFixed(0)}K context
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {daysSinceVerified !== null && daysSinceVerified > 60 && (
                <p className="pf-rec-stale">
                  &#9888; Capability data last verified {daysSinceVerified} days ago
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
