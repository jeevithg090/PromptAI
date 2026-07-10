'use client';

import { useState, useRef, useEffect } from 'react';
import { strings } from '@/lib/strings';
import type { DesignedNode, NodeAlternative } from '@/lib/api-types';

interface NodeCardProps {
  node: DesignedNode;
  onEditValue: (nodeType: string, newValue: string) => void;
  onToggleLock: (nodeType: string) => void;
  onRegenerate: (nodeType: string) => void;
  onSelectAlternative: (nodeType: string, alt: NodeAlternative) => void;
  isRegenerating: boolean;
}

export default function NodeCard({
  node,
  onEditValue,
  onToggleLock,
  onRegenerate,
  onSelectAlternative,
  isRegenerating,
}: NodeCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.value);
  const [showAlts, setShowAlts] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [isEditing]);

  const handleSaveEdit = () => {
    setIsEditing(false);
    if (editValue !== node.value) {
      onEditValue(node.type, editValue);
    }
  };

  const handleCancelEdit = () => {
    setEditValue(node.value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className={`rounded-lg border p-4 transition ${node.locked ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      {/* Header: badge + label + lock */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {node.type.replace(/_/g, ' ')}
          </span>
          <span className="text-sm font-medium text-gray-900">{node.label}</span>
          {node.defaulted && (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
              {strings.nodeDefaulted}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {node.locked && (
            <span className="mr-1 text-xs text-amber-600">{strings.nodeLocked}</span>
          )}
          <button
            type="button"
            onClick={() => onToggleLock(node.type)}
            aria-label={node.locked ? strings.nodeUnlock : strings.nodeLock}
            aria-pressed={node.locked}
            className={`rounded p-1.5 text-xs transition focus:outline-none focus:ring-2 focus:ring-gray-900 ${
              node.locked
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            {node.locked ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Value */}
      {isEditing ? (
        <div className="mt-2">
          <label htmlFor={`node-edit-${node.type}`} className="sr-only">
            {node.label}
          </label>
          <textarea
            ref={editRef}
            id={`node-edit-${node.type}`}
            rows={2}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="rounded bg-gray-900 px-2.5 py-1 text-xs text-white hover:bg-gray-700"
            >
              {strings.nodeEditSave}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              {strings.nodeEditCancel}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-700">
          {node.value || <span className="italic text-gray-400">{strings.nodeValueEmpty}</span>}
        </p>
      )}

      {/* Rationale (collapsed) */}
      {node.rationale && !isEditing && (
        <p className="mt-1 text-xs text-gray-400">{node.rationale}</p>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            {strings.nodeEdit}
          </button>

          <button
            type="button"
            onClick={() => onRegenerate(node.type)}
            disabled={isRegenerating || node.locked}
            className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {isRegenerating ? strings.nodeRegeneratePending : strings.nodeRegenerate}
          </button>

          {node.alternatives.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAlts(!showAlts)}
              aria-expanded={showAlts}
              className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              {strings.nodeAlternatives} ({node.alternatives.length})
            </button>
          )}
        </div>
      )}

      {/* Alternatives dropdown */}
      {showAlts && !isEditing && (
        <div className="mt-2 space-y-1">
          {node.alternatives.length === 0 ? (
            <p className="text-xs text-gray-400">{strings.nodeAlternativesNone}</p>
          ) : (
            node.alternatives.map((alt) => (
              <button
                key={alt.rank}
                type="button"
                onClick={() => {
                  onSelectAlternative(node.type, alt);
                  setShowAlts(false);
                }}
                className="block w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs transition hover:border-gray-400"
              >
                <span className="font-medium text-gray-700">#{alt.rank}</span>
                <span className="ml-2 text-gray-600">{alt.value}</span>
                {alt.rationale && (
                  <span className="mt-0.5 block text-[10px] text-gray-400">
                    {strings.nodeAlternativesRationale}: {alt.rationale}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
