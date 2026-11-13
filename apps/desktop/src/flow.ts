/**
 * The hold-to-talk flow (blueprint §3, §5 "Insertion rules", §7 Capture), as a
 * pure state machine: no Electron, no I/O of its own. Main wires the ports to
 * pf-native, /v1/forge, the panel window and the clipboard.
 *
 *   idle → listening → drafting → ready → inserting → done
 *                 ↘          ↘        ↘ (target changed: ready + confirmApp)
 *                  error ←────┴────────┘ (retry → drafting)
 */
import type { Assumption, EventType, ForgeRequest, ForgeResponse, NativeCommand, NativeEvent } from '@promptai/contract';
import { cleanTranscript } from '@promptai/core';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A pf-native command before the client assigns its id. */
export type NativeRequest = DistributiveOmit<NativeCommand, 'id'>;

export interface AppRef {
  bundleId: string;
  name: string;
  pid?: number;
}

/** Content-free event props (apps/app/src/events/queue.ts checks them). */
export type EventProps = Record<string, string | number | boolean | null>;
export type Rating = 'worked' | 'didnt_work';

/** A command spoken while the Draft sheet is open. */
export type VoiceCommand = { id: 'insert' } | { id: 'copy' } | { id: 'dismiss' } | { id: 'pick'; slotId: string; value: string };

export interface FlowPorts {
  /** Resolves with the reply's data; rejects on ok:false, timeout or helper exit. */
  native: { request(cmd: NativeRequest): Promise<Record<string, unknown>> };
  forge: { forge(req: ForgeRequest): Promise<ForgeResponse> };
  /** show() must not take focus from the user's app. */
  panel: { show(): void; hide(): void };
  clipboard: { writeText(text: string): void };
  /**
   * Clipboard + ⌘V into the user's app (src/auto-paste.ts). null in a channel
   * that forbids it (mas-lite): Insert then copies and the user presses ⌘V.
   */
  autoPaste: ((text: string) => Promise<'pasted' | 'copied'>) | null;
  /** The main-process events queue. */
  events?: { track(type: EventType, props: EventProps): void };
  /**
   * VOICE COMMANDS HOOK. W1's `matchVoiceCommand` (packages/core) plugs in
   * here; the lead wires it in main.ts after merge. It gets the cleaned
   * transcript of a capture that began while the sheet showed a draft, and
   * returns a command to run on that draft, or null to draft the words as usual.
   */
  matchVoiceCommand?(transcript: string, sheet: { draft: ForgeResponse; answers: Answers }): VoiceCommand | null;
}

/** ⌃⌥Space: kVK_Space with control + option. */
export const HOTKEY = { keyCode: 49, modifiers: ['control', 'option'] } as const;
export const LOCALE = 'en-US';

type Answers = Record<string, string>;
interface Drafted {
  target: AppRef | null;
  transcript: string;
  draft: ForgeResponse;
  answers: Answers;
}

export type FlowState =
  | { phase: 'idle' }
  | { phase: 'listening'; target: AppRef | null; partial: string }
  | { phase: 'drafting'; target: AppRef | null; transcript: string; answers: Answers }
  /** confirmApp: the frontmost app changed since capture; Insert again means "insert there". */
  | ({ phase: 'ready'; confirmApp?: AppRef } & Drafted)
  | ({ phase: 'inserting' } & Drafted)
  | ({ phase: 'done'; outcome: 'pasted' | 'copied'; app: AppRef | null; rated?: Rating } & Drafted)
  | {
      phase: 'error';
      target: AppRef | null;
      message: string;
      /** Kept so nothing the user said is lost. */
      transcript: string;
      answers: Answers;
      canRetry: boolean;
      copied?: boolean;
    };

/** A pick must be answered before Insert; an assumption needn't be. */
export function unresolvedPicks(draft: ForgeResponse, answers: Answers): Assumption[] {
  return draft.assumptions.filter((a) => a.kind === 'pick' && answers[a.slotId] === undefined);
}

/** An issue the checks marked `block` keeps Insert off (Copy still works). */
const blocked = (draft: ForgeResponse) => (draft.issues ?? []).some((i) => i.severity === 'block');

function toAppRef(data: Record<string, unknown>): AppRef | null {
  if (typeof data.bundleId !== 'string' || typeof data.name !== 'string') return null;
  return { bundleId: data.bundleId, name: data.name, ...(typeof data.pid === 'number' ? { pid: data.pid } : {}) };
}

function sameApp(a: AppRef | null, b: AppRef | null): boolean {
  if (!a || !b) return false;
  return a.bundleId === b.bundleId && (a.pid === undefined || b.pid === undefined || a.pid === b.pid);
}

/** Never leave a trailing newline that could submit in the target app. */
const forInsert = (brief: string) => brief.replace(/\s+$/, '');

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createFlow(ports: FlowPorts) {
  let state: FlowState = { phase: 'idle' };
  const listeners = new Set<(s: FlowState) => void>();
  /** Bumped by every new capture, retry, redraft and dismiss; stale async results check it. */
  let session = 0;
  let capture: {
    target: Promise<AppRef | null>;
    started: Promise<boolean>;
    stopping: boolean;
    final: string | null;
    /** The draft on screen when the capture began, for a voice command. */
    sheet: Extract<FlowState, { phase: 'ready' | 'done' }> | null;
  } | null = null;

  const current = (): FlowState => state;
  const set = (next: FlowState) => {
    state = next;
    for (const l of listeners) l(state);
  };
  const track = (type: EventType, s: Drafted, extra: EventProps = {}) =>
    ports.events?.track(type, { decisionId: s.draft.decisionId ?? null, toolId: s.draft.toolId, surface: 'desktop', ...extra });

  async function hotkeyDown() {
    if (state.phase === 'listening' || state.phase === 'drafting' || state.phase === 'inserting') return;
    const sheet = ports.matchVoiceCommand && (state.phase === 'ready' || state.phase === 'done') ? state : null;
    const id = ++session;
    // Order matters: record the capture target first, then show the panel, then open the mic.
    const target = ports.native.request({ cmd: 'frontmost' }).then(toAppRef, () => null);
    ports.panel.show();
    set({ phase: 'listening', target: null, partial: '' });
    const started = ports.native.request({ cmd: 'dictation.start', locale: LOCALE }).then(
      () => true,
      (err: unknown) => {
        if (id === session) {
          session++;
          set({ phase: 'error', target: null, message: `Dictation didn't start: ${reason(err)}`, transcript: '', answers: {}, canRetry: false });
        }
        return false;
      },
    );
    capture = { target, started, stopping: false, final: null, sheet };
    const app = await target;
    const now = current(); // re-read: `state` changed while we waited
    if (id === session && now.phase === 'listening') set({ ...now, target: app });
  }

  async function hotkeyUp() {
    const c = capture;
    if (state.phase !== 'listening' || !c || c.stopping) return;
    c.stopping = true;
    const id = session;
    // A release can arrive before dictation.start has been answered; stop only after it.
    if (!(await c.started) || id !== session) return;
    try {
      await ports.native.request({ cmd: 'dictation.stop' });
    } catch (err) {
      if (id !== session) return;
      const kept = (c.final ?? (state.phase === 'listening' ? state.partial : '')).trim();
      session++;
      set({ phase: 'error', target: await c.target, message: `Dictation failed: ${reason(err)}`, transcript: kept, answers: {}, canRetry: kept !== '' });
      return;
    }
    if (id !== session || state.phase !== 'listening') return;
    // The final transcript event arrives before the stop reply. Rules cleanup runs
    // on the Mac (blueprint §4: the client imports redaction, tool regex and rules).
    const transcript = cleanTranscript((c.final ?? state.partial).trim(), 'en-US').trim();
    const target = await c.target;
    if (id !== session) return;
    if (!transcript) {
      set({ phase: 'error', target, message: "Didn't catch anything. Hold ⌃⌥Space and speak.", transcript: '', answers: {}, canRetry: false });
      return;
    }
    const command = c.sheet ? ports.matchVoiceCommand?.(transcript, c.sheet) : null;
    if (command && c.sheet) {
      set(c.sheet);
      await runVoiceCommand(command);
      return;
    }
    await draft(id, transcript, target, {});
  }

  async function runVoiceCommand(command: VoiceCommand) {
    switch (command.id) {
      case 'insert':
        return insert();
      case 'copy':
        return copy();
      case 'dismiss':
        return dismiss();
      case 'pick':
        return answerChip(command.slotId, command.value);
    }
  }

  async function draft(id: number, transcript: string, target: AppRef | null, answers: Answers) {
    set({ phase: 'drafting', target, transcript, answers });
    const req: ForgeRequest = {
      text: transcript,
      surface: 'desktop',
      ...(target ? { hostApp: target.bundleId } : {}),
      ...(Object.keys(answers).length > 0 ? { answers } : {}),
    };
    try {
      const result = await ports.forge.forge(req);
      if (id !== session) return;
      const ready: Drafted = { target, transcript, draft: result, answers };
      set({ phase: 'ready', ...ready });
      track('brief.shown', ready, { assumptions: result.assumptions.length, unsourced: result.unsourced.length, covered: result.coverage.covered, total: result.coverage.total });
    } catch (err) {
      if (id === session) set({ phase: 'error', target, message: `Couldn't draft: ${reason(err)}`, transcript, answers, canRetry: true });
    }
  }

  async function paste(s: Drafted, app: AppRef, autoPaste: (text: string) => Promise<'pasted' | 'copied'>) {
    const id = session;
    const text = forInsert(s.draft.brief);
    set({ phase: 'inserting', ...s });
    // Hide first so the user's app, not our panel, holds the key window when ⌘V lands.
    ports.panel.hide();
    let outcome: 'pasted' | 'copied';
    try {
      outcome = await autoPaste(text);
    } catch {
      ports.clipboard.writeText(text);
      outcome = 'copied';
    }
    if (id !== session) return;
    set({ phase: 'done', ...s, outcome, app });
    track(outcome === 'pasted' ? 'brief.inserted' : 'brief.copied', s, { via: 'insert' });
    ports.panel.show();
  }

  async function insert() {
    if (state.phase !== 'ready' || unresolvedPicks(state.draft, state.answers).length > 0 || blocked(state.draft)) return;
    const s = state;
    const { target, transcript, draft: d, answers } = s;
    const drafted: Drafted = { target, transcript, draft: d, answers };
    const autoPaste = ports.autoPaste;
    if (!autoPaste) {
      // This channel never posts ⌘V: copy, and the receipt says to press it.
      ports.clipboard.writeText(forInsert(d.brief));
      set({ phase: 'done', ...drafted, outcome: 'copied', app: target });
      track('brief.copied', drafted, { via: 'insert' });
      return;
    }
    const now = await ports.native.request({ cmd: 'frontmost' }).then(toAppRef, () => null);
    if (state !== s) return;
    if (!now) {
      // Can't tell where ⌘V would land: copy instead of guessing.
      ports.clipboard.writeText(forInsert(d.brief));
      set({ phase: 'done', ...drafted, outcome: 'copied', app: target });
      track('brief.copied', drafted, { via: 'insert' });
      return;
    }
    if (sameApp(now, target) || sameApp(now, s.confirmApp ?? null)) return paste(drafted, now, autoPaste);
    set({ ...s, confirmApp: now });
  }

  function copy() {
    if (state.phase === 'ready' || state.phase === 'done') {
      const { target, transcript, draft: d, answers } = state;
      ports.clipboard.writeText(forInsert(d.brief));
      set({ phase: 'done', target, transcript, draft: d, answers, outcome: 'copied', app: target });
      track('brief.copied', { target, transcript, draft: d, answers }, { via: 'copy' });
    } else if (state.phase === 'error' && state.transcript) {
      ports.clipboard.writeText(state.transcript);
      set({ ...state, copied: true });
    }
  }

  async function answerChip(slotId: string, value: string) {
    if (state.phase !== 'ready') return;
    const chip = state.draft.assumptions.find((a) => a.slotId === slotId);
    if (!chip || (value !== chip.value && !chip.options.includes(value))) return;
    const answers = { ...state.answers, [slotId]: value };
    // The brief already uses the suggested value, so accepting it needs no redraft.
    if (value === chip.value) {
      const { confirmApp: _, ...rest } = state;
      set({ ...rest, answers });
      return;
    }
    track('chip.flipped', state, { slotId, kind: chip.kind, option: chip.options.indexOf(value) + 1 });
    await draft(++session, state.transcript, state.target, answers);
  }

  function rate(rating: string) {
    if (state.phase !== 'done' || state.rated || (rating !== 'worked' && rating !== 'didnt_work')) return;
    track('outcome.rated', state, { rating, outcome: state.outcome });
    set({ ...state, rated: rating });
  }

  async function retry() {
    if (state.phase !== 'error' || !state.canRetry) return;
    await draft(++session, state.transcript, state.target, state.answers);
  }

  function dismiss() {
    const wasListening = state.phase === 'listening';
    if (state.phase === 'ready') track('brief.dismissed', state);
    session++;
    capture = null;
    ports.panel.hide();
    set({ phase: 'idle' });
    // Never leave the mic open behind a hidden panel.
    if (wasListening) ports.native.request({ cmd: 'dictation.stop' }).catch(() => {});
  }

  function handleNative(event: NativeEvent): Promise<void> | void {
    switch (event.event) {
      case 'hotkey':
        return event.state === 'down' ? hotkeyDown() : hotkeyUp();
      case 'transcript':
        if (state.phase !== 'listening' || !capture) return;
        if (event.final) capture.final = event.text;
        set({ ...state, partial: event.text });
        return;
      case 'error':
        if (state.phase !== 'listening') return;
        session++;
        set({
          phase: 'error',
          target: state.target,
          message: `Dictation failed: ${event.message}`,
          transcript: state.partial.trim(),
          answers: {},
          canRetry: state.partial.trim() !== '',
        });
        return;
      default:
        return;
    }
  }

  return {
    getState: () => state,
    subscribe(listener: (s: FlowState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handleNative,
    insert,
    copy,
    answerChip,
    retry,
    rate,
    dismiss,
  };
}

export type Flow = ReturnType<typeof createFlow>;
