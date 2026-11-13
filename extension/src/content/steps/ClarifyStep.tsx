import { useState } from 'react';
import type { ClarifyingQuestion } from '../../types/overlay';

interface ClarifyStepProps {
  questions: ClarifyingQuestion[];
  taskType: string;
  onComplete: (answers: Record<string, string>, justGenerate: boolean) => void;
}

export function ClarifyStep({ questions, taskType, onComplete }: ClarifyStepProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherInputs, setOtherInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const sorted = [...questions].sort((a, b) => a.priority - b.priority);

  const handleSelect = (qId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleOtherChange = (qId: string, value: string) => {
    setOtherInputs((prev) => ({ ...prev, [qId]: value }));
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = async (justGenerate: boolean) => {
    setSaving(true);
    // Unanswered questions go back as empty answers, which the server won't ask again.
    const skipped = Object.fromEntries(questions.filter((q) => !answers[q.id]?.trim()).map((q) => [q.id, '']));
    onComplete({ ...skipped, ...answers }, justGenerate);
  };

  return (
    <div className="pf-clarify">
      <p className="pf-clarify-hint">
        A few details about your {taskType.replace(/_/g, ' ')} task:
      </p>

      {sorted.map((q) => (
        <div key={q.id} className="pf-question">
          <p className="pf-question-text">{q.text}</p>

          {q.type === 'mcq' && q.options && (
            <div className="pf-chips">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  className={`pf-chip ${answers[q.id] === opt ? 'pf-chip--selected' : ''}`}
                  onClick={() => handleSelect(q.id, opt)}
                >
                  {opt}
                </button>
              ))}
              {q.allow_other && (
                <input
                  className="pf-other-input"
                  placeholder="Other..."
                  value={otherInputs[q.id] ?? ''}
                  onChange={(e) => handleOtherChange(q.id, e.target.value)}
                />
              )}
            </div>
          )}

          {q.type === 'free_text' && (
            <textarea
              className="pf-textarea pf-textarea--sm"
              rows={2}
              value={answers[q.id] ?? ''}
              onChange={(e) => handleSelect(q.id, e.target.value)}
              placeholder="Type your answer..."
            />
          )}
        </div>
      ))}

      <div className="pf-clarify-actions">
        <button
          className="pf-btn pf-btn-primary"
          disabled={saving}
          onClick={() => handleSubmit(false)}
        >
          Generate
        </button>
        <button
          className="pf-btn pf-btn-secondary"
          disabled={saving}
          onClick={() => handleSubmit(true)}
        >
          Just generate now
        </button>
      </div>
    </div>
  );
}
