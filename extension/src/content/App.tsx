import { useState, useCallback } from 'react';
import { detect } from './detector';
import { ClarifyStep } from './steps/ClarifyStep';
import { DraftResultStep } from './steps/DraftResultStep';
import { RecommendationPanel } from './steps/RecommendationPanel';
import { insertText } from './insertText';
import type { OverlayStep, ClarifyingQuestion, DesignedResponse } from '../types/overlay';

const ALL_PLATFORMS = [
  'chatgpt', 'claude', 'gemini', 'perplexity', 'groq',
  'mistral', 'huggingface', 'midjourney', 'stability',
];

interface AppProps {
  onClose: () => void;
}

export function App({ onClose }: AppProps) {
  const initialCtx = detect();
  const [platformId, setPlatformId] = useState(initialCtx.platformId);
  const [idea, setIdea] = useState(initialCtx.sourceText);
  const [step, setStep] = useState<OverlayStep>({ phase: 'initial' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const callApi = useCallback(
    async (path: string, body: unknown): Promise<{ status: number; data: unknown }> => {
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        method: 'POST',
        path,
        body,
      });
      return response as { status: number; data: unknown };
    },
    [],
  );

  const handleStart = useCallback(async () => {
    if (!idea.trim()) return;
    setStep({ phase: 'drafting' });
    setApiError(null);

    try {
      const { data } = await callApi('/draft', {
        platform_id: platformId,
        idea: idea.trim(),
      });

      handleDraftResult(data as BackendDraftResponse);
    } catch (err) {
      setStep({ phase: 'error', message: String(err) });
    }
  }, [idea, platformId, callApi]);

  const handleClarify = useCallback(
    async (newAnswers: Record<string, string>, justGenerate: boolean) => {
      const current = step;
      if (current.phase !== 'clarifying') return;

      setAnswers(newAnswers);
      setStep({ phase: 'drafting' });

      try {
        const { data } = await callApi(`/draft/${current.sessionId}/clarify`, {
          platform_id: platformId,
          idea: idea.trim(),
          clarifications: justGenerate ? {} : newAnswers,
          just_generate: justGenerate,
        });

        handleDraftResult(data as BackendDraftResponse);
      } catch (err) {
        setStep({ phase: 'error', message: String(err) });
      }
    },
    [step, platformId, idea, callApi],
  );

  const handleDraftResult = useCallback(
    (data: BackendDraftResponse) => {
      if (data.status === 'clarifying') {
        setStep({
          phase: 'clarifying',
          sessionId: data.session_id,
          questions: (data.questions ?? []) as ClarifyingQuestion[],
          taskType: data.task_type ?? 'text',
        });
      } else if (data.status === 'ok') {
        setStep({
          phase: 'result',
          sessionId: data.session_id,
          response: data.response as DesignedResponse,
        });
      } else if (data.status === 'error') {
        setStep({ phase: 'error', message: data.message ?? 'Pipeline error' });
        if (data.degraded && (data as BackendDraftResponse & { response?: DesignedResponse }).response) {
          setStep({
            phase: 'result',
            sessionId: data.session_id,
            response: (data as BackendDraftResponse & { response: DesignedResponse }).response,
          });
        }
      } else if (data.status === 'blocked') {
        setStep({ phase: 'error', message: data.reason ?? 'Request blocked' });
      } else if (data.status === 'budget_exceeded') {
        setStep({ phase: 'error', message: data.message ?? 'Budget exceeded' });
      } else if (data.status === 'rate_limited') {
        setStep({ phase: 'error', message: data.message ?? 'Rate limited' });
      } else {
        setStep({ phase: 'error', message: 'Unexpected response from server' });
      }
    },
    [],
  );

  const handleRetry = useCallback(() => {
    setStep({ phase: 'initial' });
    setApiError(null);
  }, []);

  const handleInsert = useCallback(
    (text: string) => {
      insertText(text, [], true); // TODO: pass platform selectors + ToS gate
      onClose();
    },
    [onClose],
  );

  return (
    <div className="pf-overlay">
      <div className="pf-header">
        <span>
          <span className="pf-header-logo">&#9889;</span>
          PromptForge
        </span>
        <button className="pf-close-btn" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="pf-body">
        {/* ── Initial input ── */}
        {step.phase === 'initial' && (
          <div className="pf-initial">
            <label className="pf-label">Platform</label>
            <select
              className="pf-select"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
            >
              {ALL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>

            <label className="pf-label">What do you want to create?</label>
            <textarea
              className="pf-textarea"
              rows={4}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your idea..."
            />

            {apiError && <div className="pf-error">{apiError}</div>}

            <RecommendationPanel
              modality={platformId === 'midjourney' || platformId === 'stability' ? 'image' : platformId === 'gemini' ? 'text' : 'text'}
              onSelectPlatform={(pid) => setPlatformId(pid)}
            />

            <button
              className="pf-btn pf-btn-primary"
              disabled={!idea.trim()}
              onClick={handleStart}
            >
              Draft
            </button>
          </div>
        )}

        {/* ── Drafting (loading) ── */}
        {step.phase === 'drafting' && (
          <div className="pf-loading">
            <div className="pf-spinner" />
            Drafting suggestions...
          </div>
        )}

        {/* ── Clarifying ── */}
        {step.phase === 'clarifying' && (
          <ClarifyStep
            questions={step.questions}
            taskType={step.taskType}
            onComplete={handleClarify}
          />
        )}

        {/* ── Result ── */}
        {step.phase === 'result' && (
          <DraftResultStep
            response={step.response}
            onInsert={handleInsert}
            platformId={platformId}
          />
        )}

        {/* ── Error ── */}
        {step.phase === 'error' && (
          <div className="pf-error-step">
            <div className="pf-error">{step.message}</div>
            <button className="pf-btn pf-btn-secondary" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Minimal type for the backend draft response (discriminated union)
interface BackendDraftResponse {
  status: string;
  session_id: string;
  message?: string;
  reason?: string;
  degraded?: boolean;
  task_type?: string;
  questions?: ClarifyingQuestion[];
  response?: DesignedResponse;
}
