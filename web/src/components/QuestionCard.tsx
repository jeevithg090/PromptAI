'use client';

import { useState, useRef, useEffect } from 'react';
import { strings } from '@/lib/strings';
import type { ClarifyingQuestion } from '@/lib/api-types';

interface QuestionCardProps {
  question: ClarifyingQuestion;
  value: string;
  onChange: (questionId: string, value: string) => void;
  index: number;
}

export default function QuestionCard({ question, value, onChange, index }: QuestionCardProps) {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');
  const freeTextRef = useRef<HTMLInputElement>(null);
  const chipGroupRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const isOtherSelected = question.allow_other && showOther;

  useEffect(() => {
    if (showOther && otherInputRef.current) {
      otherInputRef.current.focus();
    }
  }, [showOther]);

  const handleChipSelect = (option: string) => {
    setShowOther(false);
    setOtherText('');
    onChange(question.id, option);
  };

  const handleOtherSelect = () => {
    setShowOther(true);
    onChange(question.id, '');
  };

  const handleOtherSubmit = () => {
    if (otherText.trim()) {
      onChange(question.id, otherText.trim());
    }
  };

  const handleFreeTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(question.id, e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && showOther && otherText.trim()) {
      e.preventDefault();
      handleOtherSubmit();
    }
  };

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      role="group"
      aria-labelledby={`question-${question.id}-label`}
    >
      <p
        id={`question-${question.id}-label`}
        className="text-sm font-medium text-gray-900"
      >
        {index + 1}. {question.text}
      </p>

      {question.type === 'mcq' && question.options && (
        <div
          ref={chipGroupRef}
          className="mt-3 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={question.text}
        >
          {question.options.map((option) => {
            const isSelected = value === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleChipSelect(option)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
                  isSelected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                {option}
              </button>
            );
          })}

          {question.allow_other && (
            <button
              type="button"
              role="radio"
              aria-checked={isOtherSelected}
              onClick={handleOtherSelect}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 ${
                isOtherSelected
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {strings.buildClarifyOther}
            </button>
          )}
        </div>
      )}

      {question.type === 'mcq' && showOther && (
        <div className="mt-3">
          <label htmlFor={`other-${question.id}`} className="sr-only">
            {strings.buildClarifyOtherPlaceholder}
          </label>
          <input
            ref={otherInputRef}
            id={`other-${question.id}`}
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleOtherSubmit}
            placeholder={strings.buildClarifyOtherPlaceholder}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      )}

      {question.type === 'free_text' && (
        <div className="mt-3">
          <label htmlFor={`freetext-${question.id}`} className="sr-only">
            {question.text}
          </label>
          <input
            ref={freeTextRef}
            id={`freetext-${question.id}`}
            type="text"
            value={value}
            onChange={handleFreeTextChange}
            placeholder={strings.buildClarifyOtherPlaceholder}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      )}
    </div>
  );
}
