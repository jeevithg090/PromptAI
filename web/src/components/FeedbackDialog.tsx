'use client';

import { useState } from 'react';
import { strings } from '@/lib/strings';
import { api } from '@/lib/api';

interface FeedbackDialogProps {
  taskType: string;
  platformId: string;
  onClose: () => void;
}

export default function FeedbackDialog({ taskType, platformId, onClose }: FeedbackDialogProps) {
  const [outcome, setOutcome] = useState<'worked' | 'didnt_work' | 'mixed' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (value: 'worked' | 'didnt_work' | 'mixed') => {
    setOutcome(value);
    setError('');
    try {
      const res = await api.feedback({
        task_type: taskType,
        platform_id: platformId,
        outcome: value,
      });
      if (res.status === 'ok') {
        setSubmitted(true);
      } else {
        setError(strings.feedbackError);
      }
    } catch {
      setError(strings.feedbackError);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-medium text-gray-900">{strings.feedbackDialogTitle}</h3>

      {submitted ? (
        <p className="mt-2 text-sm text-emerald-600">{strings.feedbackThanks}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleSubmit('worked')}
            disabled={outcome !== null}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
              outcome === 'worked'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            } disabled:opacity-60`}
          >
            {strings.feedbackWorked}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('didnt_work')}
            disabled={outcome !== null}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
              outcome === 'didnt_work'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            } disabled:opacity-60`}
          >
            {strings.feedbackDidnt}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('mixed')}
            disabled={outcome !== null}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
              outcome === 'mixed'
                ? 'border-amber-500 bg-amber-50 text-amber-700'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            } disabled:opacity-60`}
          >
            {strings.feedbackMixed}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
