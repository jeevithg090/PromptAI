'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { Platform, DraftResponse, ClarifyingQuestion, TaskType, DesignedResponse } from '@/lib/api-types';
import QuestionCard from '@/components/QuestionCard';
import MicButton from '@/components/MicButton';
import NodeEditor from '@/components/NodeEditor';
import StrengthPanel from '@/components/StrengthPanel';
import FeedbackDialog from '@/components/FeedbackDialog';
import SavePromptButton from '@/components/SavePromptButton';
import PreviewLine from '@/components/PreviewLine';
import { VisualPreview } from '@/components/VisualPreview';
import RecommendationPanel, { guessModality } from '@/components/RecommendationPanel';
import ModeSuggestion from '@/components/ModeSuggestion';
import CustomPlatformPanel from '@/components/CustomPlatformPanel';
import ChatDraft from '@/components/ChatDraft';
import ResultTools from '@/components/ResultTools';
import { listCustomPlatforms, customPlatformPayload } from '@/lib/customPlatforms';

type Phase = 'input' | 'clarifying' | 'generating' | 'result' | 'error';

/** Sentinel option value that opens the custom-platform intake panel (V1.1). */
const ADD_CUSTOM = '__add_custom__';

/**
 * Heuristic (F1.1): does this input look like a FINISHED prompt (better suited
 * to /enhance) rather than a rough idea? Long text with multiple sentences or
 * finished-prompt cues (imperatives, formatting words). Deliberately lenient —
 * it only surfaces a dismissible nudge, never blocks drafting.
 */
function looksLikeFinishedPrompt(text: string): boolean {
  const t = text.trim();
  if (t.length < 200) return false;
  const sentenceCount = (t.match(/[.!?]\s/g) ?? []).length;
  const cueWords = /\b(you are|act as|your task|step by step|format|output|constraints?|do not|include|respond with|in the style of|--ar|--v|negative prompt)\b/i;
  return sentenceCount >= 2 || cueWords.test(t);
}

function BuildContent() {
  const searchParams = useSearchParams();
  const [idea, setIdea] = useState(searchParams.get('idea') ?? '');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState(searchParams.get('platform') ?? '');
  const [phase, setPhase] = useState<Phase>('input');

  const [sessionId, setSessionId] = useState('');
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [result, setResult] = useState<DraftResponse | null>(null);
  const [designedResponse, setDesignedResponse] = useState<DesignedResponse | null>(null);
  const [error, setError] = useState('');
  const [carriedPreferences, setCarriedPreferences] = useState<Record<string, string>>({});
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const [customPlatforms, setCustomPlatforms] = useState<ReturnType<typeof listCustomPlatforms>>([]);
  const [buildMode, setBuildMode] = useState<'guided' | 'chat'>('guided');

  useEffect(() => {
    api.platforms().then((res) => setPlatforms(res.platforms)).catch(() => {});
    setCustomPlatforms(listCustomPlatforms());
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('pf_build_mode');
      if (saved === 'chat' || saved === 'guided') setBuildMode(saved);
    }
  }, []);

  const switchMode = (mode: 'guided' | 'chat') => {
    setBuildMode(mode);
    if (typeof localStorage !== 'undefined') localStorage.setItem('pf_build_mode', mode);
  };

  const answeredCount = Object.values(answers).filter((v) => v.length > 0).length;
  const hasAnswers = answeredCount > 0;

  const handleAnswerChange = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const submitClarifications = async (justGenerate: boolean) => {
    if (!selectedPlatform || !idea) return;
    setPhase('generating');
    setError('');
    setCarriedPreferences({}); // fresh draft cycle
    // F2.1: the resume leg is the slow one (3–7s) and we know the session id,
    // so poll for the true pipeline step. Falls back silently to the spinner.
    const stop = startProgressPolling(sessionId);
    try {
      const res: DraftResponse = await api.clarify(sessionId, {
        platform_id: selectedPlatform,
        idea,
        clarifications: justGenerate ? {} : answers,
        just_generate: justGenerate,
        ...customPlatformPayload(selectedPlatform),
      });
      handleDraftResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.errorNetwork);
      setPhase('error');
    } finally {
      stop();
      setProgressLabel(null);
    }
  };

  /** Poll GET /draft/:id/status every 650ms; returns a stop() function. */
  const startProgressPolling = (sid: string): (() => void) => {
    if (!sid) return () => {};
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const s = await api.draftStatus(sid);
        if (active && s.state) setProgressLabel(strings.progressStates[s.state] ?? null);
      } catch {
        // 404 / not-yet / cross-instance → keep the generic spinner.
      }
      if (active) setTimeout(() => void tick(), 650);
    };
    void tick();
    return () => { active = false; };
  };

  const handleDraftResult = (res: DraftResponse) => {
    const status = (res as { status?: string }).status;

    if (status === 'clarifying' && 'session_id' in res) {
      const clarifying = res as Extract<DraftResponse, { status: 'clarifying' }>;
      setSessionId(clarifying.session_id);
      setTaskType(clarifying.task_type);
      setQuestions(clarifying.questions);
      setAnswers({});
      setPhase('clarifying');
    } else if (status === 'ok' && 'response' in res) {
      setResult(res);
      setDesignedResponse(res.response);
      setPhase('result');
    } else if (status === 'blocked') {
      setError((res as { reason?: string }).reason ?? strings.error);
      setPhase('error');
    } else if (status === 'budget_exceeded') {
      setError(strings.errorBudgetExceeded);
      setPhase('error');
    } else if (status === 'plan_restricted') {
      setError((res as { message?: string }).message ?? strings.errorPlanRestricted);
      setPhase('error');
    } else if (status === 'rate_limited') {
      setError((res as { message?: string }).message ?? strings.tryRateLimited);
      setPhase('error');
    } else if (status === 'error') {
      setError((res as { message?: string }).message ?? strings.errorServer);
      setPhase('error');
    } else {
      setError(strings.errorServer);
      setPhase('error');
    }
  };

  const handleInitialDraft = async (justGenerate: boolean) => {
    if (!selectedPlatform || !idea) return;
    setPhase('generating');
    setError('');
    try {
      // If we have an existing session + carried preferences, use /again
      const hasCarry = Object.keys(carriedPreferences).length > 0;
      if (sessionId && hasCarry) {
        const res: DraftResponse = await api.draftAgain(sessionId, {
          platform_id: selectedPlatform,
          idea,
          carried_preferences: carriedPreferences,
        });
        setCarriedPreferences({});
        handleDraftResult(res);
      } else {
        const res: DraftResponse = await api.draft({
          platform_id: selectedPlatform,
          idea,
          just_generate: justGenerate,
          ...customPlatformPayload(selectedPlatform),
        });
        handleDraftResult(res);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.errorNetwork);
      setPhase('error');
    }
  };

  const handleDraftAgain = async () => {
    if (!selectedPlatform || !designedResponse) return;
    // Collect style-ish preferences: only style/lighting/composition/setting,
    // never subject/action — selective carry per §17.4.
    const styleishTypes = ['style_aesthetic', 'lighting_mood', 'composition_camera', 'setting_context'];
    const carried: Record<string, string> = {};
    for (const node of designedResponse.nodes) {
      if (styleishTypes.includes(node.type) && node.value.length > 0) {
        carried[node.type] = node.value;
      }
    }
    setCarriedPreferences(carried);
    setPhase('input');
    setIdea('');
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setDesignedResponse(null);
    setError('');
  };

  const resetToInput = () => {
    setPhase('input');
    setSessionId('');
    setTaskType(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setDesignedResponse(null);
    setError('');
  };

  const canSubmit = selectedPlatform && selectedPlatform !== ADD_CUSTOM && idea && !['generating'].includes(phase);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{strings.buildTitle}</h1>
        {phase === 'input' && (
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5" role="tablist" aria-label="Build mode">
            {(['guided', 'chat'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={buildMode === m}
                onClick={() => switchMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  buildMode === m ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {m === 'guided' ? strings.chatDraft.modeGuided : strings.chatDraft.modeChat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat mode: platform picker + conversational drafting */}
      {phase === 'input' && buildMode === 'chat' && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="platform-chat" className="block text-sm font-medium text-gray-700">
              {strings.buildPlatformLabel}
            </label>
            <select
              id="platform-chat"
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Select…</option>
              {platforms.map((p) => (
                <option key={p.platform_id} value={p.platform_id}>{p.display_name}</option>
              ))}
              {customPlatforms.map((entry) => (
                <option key={entry.platform.platform_id} value={entry.platform.platform_id}>
                  {entry.platform.display_name} ({strings.customPlatform.badge})
                </option>
              ))}
            </select>
          </div>
          <ChatDraft
            platformId={selectedPlatform === ADD_CUSTOM ? '' : selectedPlatform}
            onOpenDraft={(response) => {
              setDesignedResponse(response);
              setResult({ status: 'ok' } as DraftResponse);
              setPhase('result');
            }}
          />
        </div>
      )}

      {/* Input phase (guided form) */}
      {((phase === 'input' && buildMode === 'guided') || phase === 'clarifying') && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="platform" className="block text-sm font-medium text-gray-700">
              {strings.buildPlatformLabel}
            </label>
            <select
              id="platform"
              data-tour="platform-picker"
              value={selectedPlatform}
              onChange={(e) => {
                setSelectedPlatform(e.target.value);
                // Reset session so a platform change starts fresh
                setSessionId('');
                setQuestions([]);
                setAnswers({});
              }}
              disabled={phase === 'clarifying'}
              className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
            >
              <option value="">Select…</option>
              {platforms.map((p) => (
                <option key={p.platform_id} value={p.platform_id}>
                  {p.display_name}
                  {p.max_prompt_tokens ? ` — ${strings.tokenMeter.contextSize(new Intl.NumberFormat().format(p.max_prompt_tokens))}` : ''}
                </option>
              ))}
              {customPlatforms.map((entry) => (
                <option key={entry.platform.platform_id} value={entry.platform.platform_id}>
                  {entry.platform.display_name} ({strings.customPlatform.badge})
                </option>
              ))}
              <option value={ADD_CUSTOM}>{strings.customPlatform.optionLabel}</option>
            </select>
          </div>

          {/* Custom platform intake (V1.1) */}
          {phase === 'input' && selectedPlatform === ADD_CUSTOM && (
            <CustomPlatformPanel
              onCreated={(platformId) => {
                setCustomPlatforms(listCustomPlatforms());
                setSelectedPlatform(platformId);
              }}
            />
          )}

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="idea" className="block text-sm font-medium text-gray-700">
                {strings.buildIdeaLabel}
              </label>
              {phase === 'input' && (
                <MicButton onText={(t) => setIdea((prev) => (prev ? `${prev} ${t}` : t))} />
              )}
            </div>
            <textarea
              id="idea"
              data-tour="idea-box"
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={strings.buildIdeaPlaceholder}
              disabled={phase === 'clarifying'}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
            />
          </div>

          {phase === 'input' && looksLikeFinishedPrompt(idea) && !nudgeDismissed && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm" role="note">
              <p className="font-medium text-emerald-900">{strings.enhance.nudgeTitle}</p>
              <p className="mt-1 text-emerald-800">{strings.enhance.nudgeBody}</p>
              <div className="mt-2 flex gap-3">
                <Link
                  href={`/enhance?text=${encodeURIComponent(idea)}${selectedPlatform ? `&platform=${selectedPlatform}` : ''}`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {strings.enhance.nudgeAction}
                </Link>
                <button
                  type="button"
                  onClick={() => setNudgeDismissed(true)}
                  className="text-emerald-600 hover:underline"
                >
                  {strings.enhance.nudgeDismiss}
                </button>
              </div>
            </div>
          )}

          {phase === 'input' && (
            <>
              <RecommendationPanel idea={idea} platforms={platforms} onSelectPlatform={setSelectedPlatform} />
              {selectedPlatform && idea.trim() && (
                <ModeSuggestion
                  platformId={selectedPlatform}
                  idea={idea}
                  taskType={taskType ?? (guessModality(idea) === 'image' ? 'text_to_image' : guessModality(idea) === 'video' ? 'text_to_video' : guessModality(idea) === 'code' ? 'reasoning_code' : 'long_form_writing')}
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => handleInitialDraft(false)}
                  disabled={!canSubmit}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {strings.buildHelpRefine}
                </button>
                <button
                  onClick={() => handleInitialDraft(true)}
                  disabled={!canSubmit}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {strings.buildJustGenerate}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Generating state — shows the true pipeline step when available (F2.1). */}
      {phase === 'generating' && (
        <div className="mt-6 flex items-center gap-2 text-sm text-gray-600" aria-live="polite">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          {progressLabel ?? strings.buildGenerating}
        </div>
      )}

      {/* Clarification questions */}
      {phase === 'clarifying' && (
        <div className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {taskType && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 mr-2">
                  {taskType.replace(/_/g, ' ')}
                </span>
              )}
              {strings.buildClarifyProgress(answeredCount, questions.length)}
            </p>
          </div>

          <div className="space-y-3">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                value={answers[q.id] ?? ''}
                onChange={handleAnswerChange}
                index={i}
              />
            ))}
          </div>

          <PreviewLine
            platformId={selectedPlatform}
            taskType={taskType ?? 'text_to_image'}
            known={answers}
            sessionId={sessionId}
          />

          <VisualPreview
            platformId={selectedPlatform}
            assembled={''}
            sessionId={sessionId}
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => submitClarifications(false)}
              disabled={!hasAnswers}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {strings.buildClarifySubmit}
            </button>
            <button
              onClick={() => submitClarifications(true)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {strings.buildClarifyJustGenerate}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={resetToInput}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {strings.back}
          </button>
        </div>
      )}

      {/* Result — node editor */}
      {phase === 'result' && designedResponse && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Result</h2>
            <div className="flex items-center gap-4">
              <SavePromptButton response={designedResponse} />
              <button
                onClick={handleDraftAgain}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {strings.resultDraftAnother}
              </button>
            </div>
          </div>

          {designedResponse.strength && (
            <div className="mb-4" data-tour="strength-panel">
              <StrengthPanel
                strength={designedResponse.strength}
                whyThisWorks={designedResponse.whyThisWorks}
                improvementHints={designedResponse.improvementHints}
                grounding={designedResponse.grounding}
              />
            </div>
          )}

          <div data-tour="node-editor">
          <NodeEditor
            response={designedResponse}
            onUpdate={(updated) => setDesignedResponse(updated)}
          />
          </div>

          <ResultTools
            response={designedResponse}
            platforms={platforms}
            onReplace={(updated) => setDesignedResponse(updated)}
          />

          <div className="mt-4">
            <PreviewLine
              platformId={designedResponse.platformId}
              taskType={designedResponse.taskType}
              known={Object.fromEntries(
                designedResponse.nodes
                  .filter((n) => !n.defaulted && n.value.length > 0)
                  .map((n) => [n.type, n.value])
              )}
              sessionId={sessionId}
            />
            <VisualPreview
              platformId={designedResponse.platformId}
              assembled={designedResponse.assembled}
              sessionId={sessionId}
            />
          </div>

          <div className="mt-6">
            <FeedbackDialog
              taskType={designedResponse.taskType}
              platformId={designedResponse.platformId}
              onClose={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuildPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-8"><p className="text-sm text-gray-600">{strings.loading}</p></div>}>
      <BuildContent />
    </Suspense>
  );
}
