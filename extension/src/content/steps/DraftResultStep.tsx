import { useState } from 'react';
import { toRegistryId } from '../../shared/platformMap';
import type { DesignedResponse, DesignedNode } from '../../types/overlay';

type CallApi = (path: string, body: unknown) => Promise<{ status: number; data: unknown }>;

interface DraftResultStepProps {
  response: DesignedResponse;
  onInsert: (text: string) => void;
  platformId: string;
  callApi: CallApi;
}

interface RefineTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function DraftResultStep({ response: initialResponse, onInsert, platformId, callApi }: DraftResultStepProps) {
  const [showNodes, setShowNodes] = useState(false);
  const [copied, setCopied] = useState(false);

  // The result is now editable in place (finalplan B3, two-way loop): chat-refine
  // and per-node redraft replace the displayed response; feedback tunes future drafts.
  const [response, setResponse] = useState<DesignedResponse>(initialResponse);
  const [refineInput, setRefineInput] = useState('');
  const [refineHistory, setRefineHistory] = useState<RefineTurn[]>([]);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<null | 'worked' | 'didnt_work'>(null);

  const registryId = toRegistryId(platformId);
  const nodePayload = () => response.nodes.map((n) => ({ type: n.type, value: n.value, locked: n.locked }));

  const handleRefine = async () => {
    const text = refineInput.trim();
    if (!text || refining) return;
    setRefining(true);
    setRefineError(null);
    const nextHistory: RefineTurn[] = [...refineHistory, { role: 'user', content: text }];
    setRefineHistory(nextHistory);
    setRefineInput('');
    try {
      const { data } = await callApi('/chat-refine', {
        platform_id: registryId,
        task_type: response.taskType,
        nodes: nodePayload(),
        messages: nextHistory,
      });
      const res = data as { status?: string; type?: string; message?: string; nodes?: DesignedNode[]; assembled?: string; error?: string };
      if (res.type === 'prompt' && res.assembled && res.nodes) {
        setResponse({ ...response, assembled: res.assembled, nodes: res.nodes });
        setRefineHistory([...nextHistory, { role: 'assistant', content: res.message ?? 'Updated the prompt.' }]);
      } else if (res.type === 'question' && res.message) {
        setRefineHistory([...nextHistory, { role: 'assistant', content: res.message }]);
      } else {
        setRefineError(res.error ?? 'Could not refine — try rephrasing.');
      }
    } catch (err) {
      setRefineError(String(err));
    } finally {
      setRefining(false);
    }
  };

  const handleRedraftNode = async (nodeType: string, instruction?: string) => {
    try {
      const { data } = await callApi('/redraft-node', {
        platform_id: registryId,
        task_type: response.taskType,
        nodes: nodePayload(),
        target_node_type: nodeType,
        instruction,
      });
      const res = data as { value?: string; rationale?: string; alternatives?: DesignedNode['alternatives'] };
      if (!res.value) return;
      const nodes = response.nodes.map((n) =>
        n.type === nodeType ? { ...n, value: res.value!, rationale: res.rationale ?? n.rationale, alternatives: res.alternatives ?? n.alternatives } : n,
      );
      // Reassemble via the backend serializer so `assembled` stays in sync with the edited nodes.
      let assembled = response.assembled;
      try {
        const ser = await callApi('/serialize', { platform_id: registryId, nodes: nodes.map((n) => ({ type: n.type, value: n.value })) });
        const s = ser.data as { assembled?: string };
        if (s.assembled) assembled = s.assembled;
      } catch {
        // Keep the previous assembled if reserialization fails.
      }
      setResponse({ ...response, nodes, assembled });
    } catch {
      // Non-fatal: leave the node as-is.
    }
  };

  const handleFeedback = async (outcome: 'worked' | 'didnt_work') => {
    setFeedbackSent(outcome);
    try {
      await callApi('/feedback', { task_type: response.taskType, platform_id: registryId, outcome });
    } catch {
      // Feedback is best-effort; the UI already acknowledged.
    }
  };

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

      {/* ── Refine chat (two-way, finalplan B3) ── */}
      <div className="pf-refine">
        <label className="pf-label">Refine it</label>
        {refineHistory.length > 0 && (
          <div className="pf-refine-history">
            {refineHistory.map((t, i) => (
              <div key={i} className={`pf-refine-turn pf-refine-${t.role}`}>
                <span className="pf-refine-role">{t.role === 'user' ? 'You' : 'PromptForge'}</span>
                <span className="pf-refine-text">{t.content}</span>
              </div>
            ))}
          </div>
        )}
        <div className="pf-refine-input-row">
          <input
            className="pf-input"
            type="text"
            value={refineInput}
            placeholder='e.g. "make it more formal" or "add a 150-word limit"'
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleRefine(); }}
            disabled={refining}
          />
          <button className="pf-btn pf-btn-secondary" onClick={() => void handleRefine()} disabled={refining || !refineInput.trim()}>
            {refining ? '…' : 'Refine'}
          </button>
        </div>
        {refineError && <div className="pf-error">{refineError}</div>}
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
            <NodeCard key={node.type + node.position} node={node} onRedraft={(instr) => handleRedraftNode(node.type, instr)} />
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
          href={`http://localhost:3000/build?platform=${response.platformId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in editor
        </a>
      </div>

      {/* ── Feedback (tunes future drafts, finalplan B3) ── */}
      <div className="pf-feedback">
        {feedbackSent ? (
          <span className="pf-feedback-thanks">Thanks — noted.</span>
        ) : (
          <>
            <span className="pf-feedback-label">Did this work?</span>
            <button className="pf-btn pf-btn-link pf-btn-sm" onClick={() => void handleFeedback('worked')}>👍 Worked</button>
            <button className="pf-btn pf-btn-link pf-btn-sm" onClick={() => void handleFeedback('didnt_work')}>👎 Didn’t</button>
          </>
        )}
      </div>
    </div>
  );
}

function NodeCard({ node, onRedraft }: { node: DesignedNode; onRedraft: (instruction?: string) => void }) {
  const [showAlts, setShowAlts] = useState(false);
  const [redrafting, setRedrafting] = useState(false);

  const doRedraft = async () => {
    setRedrafting(true);
    await Promise.resolve(onRedraft());
    setRedrafting(false);
  };

  return (
    <div className="pf-node-card">
      <div className="pf-node-header">
        <span className="pf-node-label">{node.label}</span>
        {node.defaulted && <span className="pf-node-badge">auto</span>}
        <button className="pf-btn pf-btn-link pf-btn-sm pf-node-redraft" onClick={() => void doRedraft()} disabled={redrafting} title="Regenerate just this part">
          {redrafting ? '…' : '↻ Redo'}
        </button>
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
