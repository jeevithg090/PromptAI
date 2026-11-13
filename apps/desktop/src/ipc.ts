import type { FlowState } from './flow.ts';

/** IPC channels between the panel's preload and main. */
export const IPC = {
  state: 'promptai:state',
  getState: 'promptai:get-state',
  insert: 'promptai:insert',
  copy: 'promptai:copy',
  answerChip: 'promptai:answer-chip',
  retry: 'promptai:retry',
  dismiss: 'promptai:dismiss',
} as const;

/** What the preload exposes as `window.promptai`. */
export interface PromptAIApi {
  readonly platform: 'desktop';
  /** Calls back with the current state now and on every change; returns an unsubscribe. */
  onState(listener: (state: FlowState) => void): () => void;
  insert(): Promise<void>;
  copy(): Promise<void>;
  answerChip(slotId: string, value: string): Promise<void>;
  retry(): Promise<void>;
  dismiss(): Promise<void>;
}
