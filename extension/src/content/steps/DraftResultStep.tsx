import { useState } from 'react';
import type { DesignedResponse, DesignedNode } from '../../types/overlay';

interface DraftResultStepProps {
  response: DesignedResponse;
  onInsert: (text: string) => void;
  platformId: string;
}

export function DraftResultStep({ response, onInsert }: DraftResultStepProps) {
  const [showNodes, setShowNodes] = useState(false);
  const [copied, setCopied] = useState(false);

  const strength = response.strength;
  const bandClass =
    strength?.band === 'Excellent'
      ? 'pf-band--excellent'
      : strength?.band === 'Strong'
        ? 'pf-band--strong'
        : strength?.band === 'Solid'
          ? 'pf-band--solid'
          : 'pf-band--needs-work';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(response.assembled);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-https contexts
      const ta = document.createElement('textarea');
      ta.value = response.assembled;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="pf-result">
      {/* ── Strength score ── */}
      {strength && (
        <div className={`pf-strength ${bandClass}`}>
          <span className="pf-strength-score">{strength.score}/100</span>
          <span className="pf-strength-band">{strength.band}</span>
        </div>
      )}

      {!strength && (
        <div className="pf-strength pf-band--needs-work">
          <span className="pf-strength-band">Unscored</span>
        </div>
      )}

      {/* ── Assembled prompt ── */}
      <div className="pf-assembled">
        <label className="pf-label">Assembled prompt</label>
        <pre className="pf-prompt-preview">{response.assembled}</pre>
      </div>

      {/* ── Why this works ── */}
      {response.whyThisWorks.length > 0 && (
        <div className="pf-why-works">
          <label className="pf-label">Why this works</label>
          <ul>
            {response.whyThisWorks.map((hint, i) => (
              <li key={i}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Improvement hints ── */}
      {response.improvementHints.length > 0 && (
        <div className="pf-improvements">
          <label className="pf-label">Improvement hints</label>
          <ul>
            {response.improvementHints.map((hint, i) => (
              <li key={i}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Nodes (collapsible) ── */}
      <div className="pf-nodes-toggle">
        <button
          className="pf-btn pf-btn-link"
          onClick={() => setShowNodes(!showNodes)}
        >
          {showNodes ? 'Hide' : 'Show'} prompt anatomy ({response.nodes.length} nodes)
        </button>
      </div>

      {showNodes && (
        <div className="pf-nodes">
          {response.nodes.map((node) => (
            <NodeCard key={node.type + node.position} node={node} />
          ))}
        </div>
      )}

      {/* ── Token report ── */}
      <div className="pf-governor">
        <label className="pf-label">Token usage</label>
        <p>
          {response.governor.tokenCount} / {response.governor.maxPromptTokens} tokens
          {response.governor.nearLimit && ' (near limit)'}
        </p>
      </div>

      {/* ── Actions ── */}
      <div className="pf-result-actions">
        <button className="pf-btn pf-btn-primary" onClick={() => onInsert(response.assembled)}>
          Insert into page
        </button>
        <button className="pf-btn pf-btn-secondary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <a
          className="pf-btn pf-btn-link"
          href={`http://localhost:5173/build?session=${response.platformId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in editor
        </a>
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: DesignedNode }) {
  const [showAlts, setShowAlts] = useState(false);

  return (
    <div className="pf-node-card">
      <div className="pf-node-header">
        <span className="pf-node-label">{node.label}</span>
        {node.defaulted && <span className="pf-node-badge">auto</span>}
      </div>
      <p className="pf-node-value">{node.value}</p>
      {node.rationale && <p className="pf-node-rationale">{node.rationale}</p>}

      {node.alternatives.length > 0 && (
        <div className="pf-node-alts">
          <button
            className="pf-btn pf-btn-link pf-btn-sm"
            onClick={() => setShowAlts(!showAlts)}
          >
            {showAlts ? 'Hide' : 'Show'} alternatives ({node.alternatives.length})
          </button>
          {showAlts && (
            <div className="pf-node-alts-list">
              {node.alternatives.map((alt) => (
                <div key={alt.rank} className="pf-alt-item">
                  <span className="pf-alt-value">{alt.value}</span>
                  <span className="pf-alt-rationale">{alt.rationale}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
