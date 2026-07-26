'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { DesignedResponse } from '@/lib/api-types';

/**
 * Save the current designed prompt as version 1 (F2.2). Uses the interim
 * nodes_json storage documented in migration 006 (pre-E2EE). After saving,
 * links to the version history.
 */
export default function SavePromptButton({ response }: { response: DesignedResponse }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [promptId, setPromptId] = useState<string | null>(null);

  const save = async () => {
    setState('saving');
    try {
      const rubricScores: Record<string, number> = {};
      for (const d of response.strength?.dimensions ?? []) rubricScores[d.dimension] = d.score;
      const res = await api.promptSave({
        platformId: response.platformId,
        taskType: response.taskType,
        nodes: response.nodes,
        assembled: response.assembled,
        strengthScore: response.strength?.score,
        rubricScores,
      });
      setPromptId(res.prompt_id);
      setState('saved');
    } catch {
      setState('idle');
    }
  };

  if (state === 'saved' && promptId) {
    return (
      <a href={`/prompts/view?id=${promptId}`} className="text-sm font-medium text-green-700 hover:underline">
        {strings.prompts.saved} — {strings.prompts.versionsTitle} →
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={state === 'saving'}
      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {strings.prompts.save}
    </button>
  );
}
