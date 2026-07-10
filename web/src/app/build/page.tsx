'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { Platform, DraftResponse, ClarifyingQuestion, TaskType, DesignedResponse } from '@/lib/api-types';
import QuestionCard from '@/components/QuestionCard';
import NodeEditor from '@/components/NodeEditor';
import StrengthPanel from '@/components/StrengthPanel';
import FeedbackDialog from '@/components/FeedbackDialog';

type Phase = 'input' | 'clarifying' | 'generating' | 'result' | 'error';

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

  useEffect(() => {
    api.platforms().then((res) => setPlatforms(res.platforms)).catch(() => {});
  }, []);

  const answeredCount = Object.values(answers).filter((v) => v.length > 0).length;
  const hasAnswers = answeredCount > 0;

  const handleAnswerChange = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const submitClarifications = async (justGenerate: boolean) => {
    if (!selectedPlatform || !idea) return;
    setPhase('generating');
    setError('');
    try {
      const res: DraftResponse = await api.clarify(sessionId, {
        platform_id: selectedPlatform,
        idea,
        clarifications: justGenerate ? {} : answers,
        just_generate: justGenerate,
      });
      handleDraftResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.errorNetwork);
      setPhase('error');
    }
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
      const res: DraftResponse = await api.draft({
        platform_id: selectedPlatform,
        idea,
        just_generate: justGenerate,
      });
      handleDraftResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? strings.errorNetwork);
      setPhase('error');
    }
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

  const canSubmit = selectedPlatform && idea && !['generating'].includes(phase);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{strings.buildTitle}</h1>

      {/* Input phase */}
      {(phase === 'input' || phase === 'clarifying') && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="platform" className="block text-sm font-medium text-gray-700">
              {strings.buildPlatformLabel}
            </label>
            <select
              id="platform"
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
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="idea" className="block text-sm font-medium text-gray-700">
              {strings.buildIdeaLabel}
            </label>
            <textarea
              id="idea"
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={strings.buildIdeaPlaceholder}
              disabled={phase === 'clarifying'}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
            />
          </div>

          {phase === 'input' && (
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
          )}
        </div>
      )}

      {/* Generating state */}
      {phase === 'generating' && (
        <div className="mt-6 flex items-center gap-2 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          {strings.buildGenerating}
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
            <button
              onClick={resetToInput}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {strings.resultDraftAnother}
            </button>
          </div>

          {designedResponse.strength && (
            <div className="mb-4">
              <StrengthPanel
                strength={designedResponse.strength}
                whyThisWorks={designedResponse.whyThisWorks}
                improvementHints={designedResponse.improvementHints}
              />
            </div>
          )}

          <NodeEditor
            response={designedResponse}
            onUpdate={(updated) => setDesignedResponse(updated)}
          />

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
