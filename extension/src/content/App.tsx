import { useState, useCallback, useRef, useEffect } from 'react';
import { detect } from './detector';
import { ClarifyStep } from './steps/ClarifyStep';
import { DraftResultStep } from './steps/DraftResultStep';
import { RecommendationPanel } from './steps/RecommendationPanel';
import { insertText } from './insertText';
import { SUPPORTED_SHORT_IDS, SHORT_DISPLAY_NAMES, IMAGE_SHORT_IDS, toRegistryId } from '../shared/platformMap';
import type { OverlayStep, ClarifyingQuestion, DesignedResponse } from '../types/overlay';

/** Short ids for the picker — the ten supported sites (see shared/platformMap). */
const ALL_PLATFORMS = SUPPORTED_SHORT_IDS;

interface AppProps {
  onClose: () => void;
  /** F2.3: when set (from the right-click "Enhance with PromptForge"), start in enhance mode. */
  initialEnhanceText?: string;
}

export function App({ onClose, initialEnhanceText }: AppProps) {
  const initialCtx = detect();
  // The detector may report an off-platform id ('generic') or a site we don't
  // draft for yet — fall back to a supported id so the picker + API id are valid.
  const detectedId = ALL_PLATFORMS.includes(initialCtx.platformId) ? initialCtx.platformId : 'chatgpt';
  const [platformId, setPlatformId] = useState(detectedId);
  // Capture the host site's input selectors once so insertion targets the real
  // page input (not the overlay) even after this component re-renders.
  const inputSelectorsRef = useRef<string[]>(initialCtx.inputSelectors);
  const [idea, setIdea] = useState(initialEnhanceText ?? initialCtx.sourceText);
  const [step, setStep] = useState<OverlayStep>({ phase: 'initial' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [enhanceInfo, setEnhanceInfo] = useState<{ before: number; after: number; note: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Web app origin for the "Open in editor" link — configurable via the options
  // page so a deployed extension points at the deployed web app, not localhost.
  const [webOrigin, setWebOrigin] = useState('http://localhost:3000');
  useEffect(() => {
    chrome.storage?.sync.get('webOrigin').then(({ webOrigin: w }) => {
      if (typeof w === 'string' && w) setWebOrigin(w.replace(/\/$/, ''));
    }).catch(() => {});
  }, []);

  // Dictation (F1.3): record in the content UI, transcribe via the background
  // worker (content script stays fetch/credential-free).
  const toggleDictate = useCallback(async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const buf = await blob.arrayBuffer();
        const resp = await chrome.runtime.sendMessage({ type: 'TRANSCRIBE', audio: buf, mimeType: 'audio/webm' });
        const r = resp as { text?: string };
        if (r?.text) setIdea((prev) => (prev ? `${prev} ${r.text}` : (r.text as string)));
      };
      rec.start();
      setRecording(true);
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 60_000);
    } catch {
      setApiError('Microphone access was blocked.');
    }
  }, [recording]);

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
    setAnswers({}); // a new session starts with no answers

    try {
      const { status, data } = await callApi('/draft', {
        platform_id: toRegistryId(platformId),
        idea: idea.trim(),
      });
      if (status === 401) {
        setStep({ phase: 'error', message: 'Sign in to use PromptForge — open the extension options and paste your session token.' });
        return;
      }
      handleDraftResult(data as BackendDraftResponse);
    } catch (err) {
      setStep({ phase: 'error', message: String(err) });
    }
  }, [idea, platformId, callApi]);

  /**
   * Enhance the current input (F1.1) — treat the box's contents as a FINISHED
   * prompt, parse+score+improve it, then let the user replace the input. We omit
   * platform_id (the backend auto-detects a hint) to avoid the extension's short
   * platform ids not matching the registry.
   */
  const handleEnhance = useCallback(async () => {
    if (idea.trim().length < 10) return;
    setStep({ phase: 'drafting' });
    setApiError(null);
    try {
      const { status, data } = await callApi('/enhance', { text: idea.trim() });
      if (status === 401) {
        setStep({ phase: 'error', message: 'Sign in to use PromptForge — open the extension options and paste your session token.' });
        return;
      }
      const res = data as { status?: string; session_id?: string; enhanced?: DesignedResponse; improvement?: { before: number; after: number; note: string }; message?: string; reason?: string };
      if (res.status === 'ok' && res.enhanced) {
        setEnhanceInfo(res.improvement ?? null);
        setStep({ phase: 'result', sessionId: res.session_id ?? '', response: res.enhanced });
      } else {
        setStep({ phase: 'error', message: res.reason ?? res.message ?? 'Could not enhance this prompt.' });
      }
    } catch (err) {
      setStep({ phase: 'error', message: String(err) });
    }
  }, [idea, callApi]);

  // F2.3: if opened from the right-click "Enhance with PromptForge", run it once.
  const autoRan = useRef(false);
  useEffect(() => {
    if (initialEnhanceText && !autoRan.current && idea.trim().length >= 10) {
      autoRan.current = true;
      void handleEnhance();
    }
  }, [initialEnhanceText, idea, handleEnhance]);

  const handleClarify = useCallback(
    async (newAnswers: Record<string, string>, justGenerate: boolean) => {
      const current = step;
      if (current.phase !== 'clarifying') return;

      // The server keeps no answers between calls: send every round's answers,
      // and the task type and entities so the resume doesn't re-run intent.
      const allAnswers = { ...answers, ...newAnswers };
      setAnswers(allAnswers);
      setStep({ phase: 'drafting' });

      try {
        const { data } = await callApi(`/draft/${current.sessionId}/clarify`, {
          platform_id: toRegistryId(platformId),
          idea: idea.trim(),
          clarifications: allAnswers,
          task_type: current.taskType,
          entities: current.entities,
          just_generate: justGenerate,
        });

        handleDraftResult(data as BackendDraftResponse);
      } catch (err) {
        setStep({ phase: 'error', message: String(err) });
      }
    },
    [step, answers, platformId, idea, callApi],
  );

  const handleDraftResult = useCallback(
    (data: BackendDraftResponse) => {
      if (data.status === 'clarifying') {
        setStep({
          phase: 'clarifying',
          sessionId: data.session_id,
          questions: (data.questions ?? []) as ClarifyingQuestion[],
          taskType: data.task_type ?? 'text',
          entities: data.entities ?? {},
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
      } else if (data.status === 'plan_restricted') {
        setStep({ phase: 'error', message: data.message ?? 'This platform requires a paid plan.' });
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
    setEnhanceInfo(null);
  }, []);

  const handleInsert = useCallback(
    async (text: string): Promise<boolean> => {
      const result = insertText(text, inputSelectorsRef.current, true);
      if (result.ok) {
        onClose();
        return true;
      }
      // Couldn't reach the site's input box — copy to clipboard so the draft is
      // never lost. The result step surfaces the fallback notice to the user.
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      return false;
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
                  {SHORT_DISPLAY_NAMES[p] ?? p}
                </option>
              ))}
            </select>

            <div className="pf-label-row">
              <label className="pf-label">What do you want to create?</label>
              <button
                type="button"
                className={`pf-mic-btn${recording ? ' pf-mic-btn-active' : ''}`}
                onClick={toggleDictate}
                aria-pressed={recording}
                title={recording ? 'Stop dictation' : 'Dictate'}
              >
                {recording ? '● Stop' : '🎤 Dictate'}
              </button>
            </div>
            <textarea
              className="pf-textarea"
              rows={4}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your idea..."
            />

            {apiError && <div className="pf-error">{apiError}</div>}

            <RecommendationPanel
              modality={IMAGE_SHORT_IDS.has(platformId) ? 'image' : 'text'}
              onSelectPlatform={(pid) => setPlatformId(pid)}
            />

            <div className="pf-btn-row">
              <button
                className="pf-btn pf-btn-primary"
                disabled={!idea.trim()}
                onClick={handleStart}
              >
                Draft
              </button>
              <button
                className="pf-btn pf-btn-secondary"
                disabled={idea.trim().length < 10}
                onClick={handleEnhance}
                title="Treat the text above as a finished prompt and improve it"
              >
                Enhance current input
              </button>
            </div>
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
          <>
            {enhanceInfo && (
              <div className="pf-enhance-banner">
                {enhanceInfo.note === 'improved'
                  ? `Strength improved ${enhanceInfo.before} → ${enhanceInfo.after}`
                  : 'Already strong — kept as-is'}
              </div>
            )}
            <DraftResultStep
              response={step.response}
              onInsert={handleInsert}
              platformId={platformId}
              callApi={callApi}
              webOrigin={webOrigin}
            />
          </>
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
  entities?: Record<string, string>;
  questions?: ClarifyingQuestion[];
  response?: DesignedResponse;
}
