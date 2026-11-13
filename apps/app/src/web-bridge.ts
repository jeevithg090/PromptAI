/**
 * Browser fallback when there is no desktop shell: type the ask, draft it with
 * /v1/forge, copy the brief. No dictation and no insert. Emits the same
 * content-free events as the desktop flow (apps/desktop/src/flow.ts).
 */
import type { EventType } from '@promptai/contract';
import type { ApiClient } from './api/client.ts';
import type { Answers, PanelState, PromptAIBridge } from './bridge.ts';
import type { EventProps } from './events/queue.ts';

interface WebBridgeOptions {
  api: ApiClient;
  track?(type: EventType, props: EventProps): void;
  writeClipboard?(text: string): Promise<void>;
}

/** Never leave a trailing newline that could submit in the target app. */
const forPaste = (text: string) => text.replace(/\s+$/, '');

export function createWebBridge(opts: WebBridgeOptions): PromptAIBridge {
  const writeClipboard = opts.writeClipboard ?? ((text: string) => navigator.clipboard.writeText(text));
  const listeners = new Set<(s: PanelState) => void>();
  let state: PanelState = { phase: 'idle' };
  let session = 0;
  const set = (next: PanelState) => {
    state = next;
    for (const l of listeners) l(state);
  };
  const track = (type: EventType, extra: EventProps = {}) => {
    if (state.phase !== 'ready' && state.phase !== 'done') return;
    opts.track?.(type, { decisionId: state.draft.decisionId ?? null, toolId: state.draft.toolId, surface: 'web', ...extra });
  };

  async function draft(text: string, answers: Answers) {
    const id = ++session;
    set({ phase: 'drafting', target: null, transcript: text, answers });
    try {
      const result = await opts.api.forge({ text, ...(Object.keys(answers).length > 0 ? { answers } : {}) });
      if (id !== session) return;
      set({ phase: 'ready', target: null, transcript: text, draft: result, answers });
      track('brief.shown', { assumptions: result.assumptions.length, unsourced: result.unsourced.length, covered: result.coverage.covered, total: result.coverage.total });
    } catch (err) {
      if (id === session) set({ phase: 'error', target: null, message: `Couldn't draft: ${(err as Error).message ?? String(err)}`, transcript: text, answers, canRetry: true });
    }
  }

  return {
    platform: 'web',
    caps: { insertAtCursor: false, dictation: false },
    onState(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    submit: async (text) => {
      if (text.trim()) await draft(text.trim(), {});
    },
    insert: async () => {},
    async copy() {
      if (state.phase === 'ready' || state.phase === 'done') {
        const { target, transcript, draft: d, answers } = state;
        await writeClipboard(forPaste(d.brief));
        track('brief.copied');
        set({ phase: 'done', target, transcript, draft: d, answers, outcome: 'copied', app: null });
      } else if (state.phase === 'error' && state.transcript) {
        await writeClipboard(state.transcript);
        set({ ...state, copied: true });
      }
    },
    async answerChip(slotId, value) {
      if (state.phase !== 'ready') return;
      const chip = state.draft.assumptions.find((a) => a.slotId === slotId);
      if (!chip || (value !== chip.value && !chip.options.includes(value))) return;
      const answers = { ...state.answers, [slotId]: value };
      if (value === chip.value) set({ ...state, answers });
      else {
        track('chip.flipped', { slotId, kind: chip.kind, option: chip.options.indexOf(value) + 1 });
        await draft(state.transcript, answers);
      }
    },
    async retry() {
      if (state.phase === 'error' && state.canRetry) await draft(state.transcript, state.answers);
    },
    async rate(rating) {
      if (state.phase !== 'done' || state.rated) return;
      track('outcome.rated', { rating, outcome: state.outcome });
      set({ ...state, rated: rating });
    },
    dismiss: async () => {
      if (state.phase === 'ready') track('brief.dismissed');
      session++;
      set({ phase: 'idle' });
    },
  };
}
