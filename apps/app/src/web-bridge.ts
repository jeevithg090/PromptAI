/**
 * Browser fallback when there is no desktop shell: type the ask, draft it with
 * /v1/forge, copy the brief. No dictation and no insert.
 */
import { forgeResponseSchema, type ForgeRequest } from '@promptai/contract';
import type { Answers, PanelState, PromptAIBridge } from './bridge.ts';

interface WebBridgeOptions {
  serverUrl: string;
  fetch?: typeof fetch;
  writeClipboard?(text: string): Promise<void>;
}

export function createWebBridge(opts: WebBridgeOptions): PromptAIBridge {
  const fetchImpl = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const writeClipboard = opts.writeClipboard ?? ((text: string) => navigator.clipboard.writeText(text));
  const listeners = new Set<(s: PanelState) => void>();
  let state: PanelState = { phase: 'idle' };
  let session = 0;
  const set = (next: PanelState) => {
    state = next;
    for (const l of listeners) l(state);
  };

  async function draft(text: string, answers: Answers) {
    const id = ++session;
    set({ phase: 'drafting', target: null, transcript: text, answers });
    const req: ForgeRequest = { text, ...(Object.keys(answers).length > 0 ? { answers } : {}) };
    try {
      const res = await fetchImpl(new URL('/v1/forge', opts.serverUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const parsed = forgeResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error('the server sent a draft this page cannot read');
      if (id === session) set({ phase: 'ready', target: null, transcript: text, draft: parsed.data, answers });
    } catch (err) {
      const message = err instanceof TypeError ? `couldn't reach the PromptAI server at ${opts.serverUrl}` : String((err as Error).message ?? err);
      if (id === session) set({ phase: 'error', target: null, message: `Couldn't draft: ${message}`, transcript: text, answers, canRetry: true });
    }
  }

  return {
    platform: 'web',
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
        await writeClipboard(d.brief.replace(/\s+$/, ''));
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
      else await draft(state.transcript, answers);
    },
    async retry() {
      if (state.phase === 'error' && state.canRetry) await draft(state.transcript, state.answers);
    },
    dismiss: async () => {
      session++;
      set({ phase: 'idle' });
    },
  };
}
