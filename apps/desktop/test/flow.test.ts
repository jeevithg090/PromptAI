import { describe, expect, it, vi } from 'vitest';
import type { ForgeRequest, ForgeResponse } from '@promptai/contract';
import { createFlow, unresolvedPicks, type FlowPorts, type FlowState, type NativeRequest } from '../src/flow.ts';

const NOTES = { bundleId: 'com.apple.Notes', name: 'Notes', pid: 41 };
const SLACK = { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack', pid: 77 };

const DRAFT: ForgeResponse = {
  toolId: 'claude',
  toolName: 'Claude',
  brief: 'Write a launch email for the beta.\n',
  assumptions: [
    { slotId: 'tone', label: 'Tone', value: 'Friendly', source: 'default', kind: 'assumption', options: ['Formal', 'Playful'] },
    { slotId: 'length', label: 'Length', value: 'Short', source: 'inferred', kind: 'pick', options: ['Medium', 'Long'] },
  ],
  unsourced: ['the beta'],
  coverage: { covered: 3, total: 5 },
  usage: { llmCalls: 1, ms: 900 },
};
const NO_PICKS: ForgeResponse = { ...DRAFT, assumptions: [DRAFT.assumptions[0]!] };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Handler = (cmd: NativeRequest) => Promise<Record<string, unknown>>;

function setup(opts: { native?: Partial<Record<NativeRequest['cmd'], Handler>>; forge?: (req: ForgeRequest) => Promise<ForgeResponse> } = {}) {
  const sent: NativeRequest[] = [];
  const handlers: Record<string, Handler> = {
    frontmost: async () => NOTES,
    'dictation.start': async () => ({}),
    'dictation.stop': async () => ({}),
    paste: async () => ({ result: 'pasted' }),
    ...opts.native,
  };
  const ports: FlowPorts = {
    native: {
      request: vi.fn((cmd: NativeRequest) => {
        sent.push(cmd);
        return handlers[cmd.cmd]!(cmd);
      }),
    },
    forge: { forge: vi.fn(opts.forge ?? (async () => DRAFT)) },
    panel: { show: vi.fn(), hide: vi.fn() },
    clipboard: { writeText: vi.fn() },
  };
  const flow = createFlow(ports);
  const phases: FlowState['phase'][] = [];
  flow.subscribe((s) => {
    if (phases.at(-1) !== s.phase) phases.push(s.phase);
  });
  const cmds = () => sent.map((c) => c.cmd);
  /** Hold the hotkey, say `words` (final transcript), release. */
  async function speak(words: string) {
    await flow.handleNative({ event: 'hotkey', state: 'down' });
    flow.handleNative({ event: 'transcript', text: words, final: true });
    await flow.handleNative({ event: 'hotkey', state: 'up' });
  }
  return { flow, ports, sent, cmds, phases, speak };
}

const state = <P extends FlowState['phase']>(s: FlowState, phase: P) => {
  expect(s.phase).toBe(phase);
  return s as Extract<FlowState, { phase: P }>;
};

describe('flow', () => {
  it('runs idle → listening → drafting → ready → inserting → done and pastes the brief', async () => {
    const { flow, ports, sent, cmds, phases } = setup();
    expect(flow.getState()).toEqual({ phase: 'idle' });

    await flow.handleNative({ event: 'hotkey', state: 'down' });
    expect(cmds()).toEqual(['frontmost', 'dictation.start']);
    expect(sent[1]).toEqual({ cmd: 'dictation.start', locale: 'en-US' });
    expect(ports.panel.show).toHaveBeenCalledTimes(1);
    expect(state(flow.getState(), 'listening').target).toEqual(NOTES);

    flow.handleNative({ event: 'transcript', text: 'write a launch', final: false });
    expect(state(flow.getState(), 'listening').partial).toBe('write a launch');
    flow.handleNative({ event: 'transcript', text: 'write a launch email', final: true });

    await flow.handleNative({ event: 'hotkey', state: 'up' });
    expect(ports.forge.forge).toHaveBeenCalledWith({ text: 'write a launch email', hostApp: 'com.apple.Notes' });
    const ready = state(flow.getState(), 'ready');
    expect(ready.draft).toEqual(DRAFT);

    await flow.answerChip('length', 'Short'); // one tap accepts the suggested pick
    await flow.insert();
    expect(cmds()).toEqual(['frontmost', 'dictation.start', 'dictation.stop', 'frontmost', 'paste']);
    expect(sent.at(-1)).toEqual({ cmd: 'paste', text: 'Write a launch email for the beta.' }); // no trailing newline
    expect(ports.panel.hide).toHaveBeenCalledTimes(1); // hidden before ⌘V so the user's app has the key window
    const done = state(flow.getState(), 'done');
    expect(done.outcome).toBe('pasted');
    expect(done.app).toEqual(NOTES);
    expect(phases).toEqual(['listening', 'drafting', 'ready', 'inserting', 'done']);
  });

  it('waits for dictation.start before stopping when the key comes up early', async () => {
    const start = deferred<Record<string, unknown>>();
    const { flow, cmds } = setup({ native: { 'dictation.start': () => start.promise } });
    const down = flow.handleNative({ event: 'hotkey', state: 'down' });
    const up = flow.handleNative({ event: 'hotkey', state: 'up' });
    await Promise.resolve();
    expect(cmds()).toEqual(['frontmost', 'dictation.start']);
    flow.handleNative({ event: 'transcript', text: 'hi there', final: true });
    start.resolve({});
    await Promise.all([down, up]);
    expect(cmds()).toEqual(['frontmost', 'dictation.start', 'dictation.stop']);
    expect(flow.getState().phase).toBe('ready');
  });

  it('ignores a repeated key-up while stopping', async () => {
    const { flow, cmds } = setup();
    await flow.handleNative({ event: 'hotkey', state: 'down' });
    flow.handleNative({ event: 'transcript', text: 'hello', final: true });
    await Promise.all([flow.handleNative({ event: 'hotkey', state: 'up' }), flow.handleNative({ event: 'hotkey', state: 'up' })]);
    expect(cmds().filter((c) => c === 'dictation.stop')).toHaveLength(1);
  });

  it('says so when nothing was heard, and does not draft', async () => {
    const { flow, ports, speak } = setup();
    await speak('   ');
    const err = state(flow.getState(), 'error');
    expect(err.message).toMatch(/Didn't catch anything/);
    expect(err.canRetry).toBe(false);
    expect(ports.forge.forge).not.toHaveBeenCalled();
  });

  it('keeps the transcript when drafting fails, and retries it', async () => {
    let calls = 0;
    const { flow, ports, speak } = setup({
      forge: async () => {
        if (++calls === 1) throw new Error('the server answered 503');
        return DRAFT;
      },
    });
    await speak('plan my week');
    const err = state(flow.getState(), 'error');
    expect(err.transcript).toBe('plan my week');
    expect(err.canRetry).toBe(true);
    expect(err.message).toMatch(/503/);

    flow.copy();
    expect(ports.clipboard.writeText).toHaveBeenCalledWith('plan my week');
    expect(state(flow.getState(), 'error').copied).toBe(true);

    await flow.retry();
    expect(flow.getState().phase).toBe('ready');
    expect(ports.forge.forge).toHaveBeenLastCalledWith({ text: 'plan my week', hostApp: 'com.apple.Notes' });
  });

  it('reports a failed dictation.start', async () => {
    const { flow } = setup({ native: { 'dictation.start': async () => Promise.reject(new Error('microphone denied')) } });
    await flow.handleNative({ event: 'hotkey', state: 'down' });
    await Promise.resolve();
    expect(state(flow.getState(), 'error').message).toMatch(/microphone denied/);
    await flow.handleNative({ event: 'hotkey', state: 'up' });
    expect(flow.getState().phase).toBe('error');
  });

  it('keeps the partial transcript when the helper reports an error mid-dictation', async () => {
    const { flow } = setup();
    await flow.handleNative({ event: 'hotkey', state: 'down' });
    flow.handleNative({ event: 'transcript', text: 'draft a reply to', final: false });
    flow.handleNative({ event: 'error', message: 'audio engine stopped' });
    const err = state(flow.getState(), 'error');
    expect(err.transcript).toBe('draft a reply to');
    expect(err.canRetry).toBe(true);
  });

  it('blocks Insert until every pick is resolved', async () => {
    const { flow, cmds, speak } = setup();
    await speak('write a launch email');
    const ready = state(flow.getState(), 'ready');
    expect(unresolvedPicks(ready.draft, ready.answers).map((a) => a.slotId)).toEqual(['length']);
    await flow.insert();
    expect(cmds()).not.toContain('paste');
    expect(flow.getState().phase).toBe('ready');
  });

  it('redrafts with the answers when a chip changes to another option', async () => {
    const { flow, ports, speak } = setup();
    await speak('write a launch email');
    await flow.answerChip('length', 'Long');
    expect(ports.forge.forge).toHaveBeenLastCalledWith({
      text: 'write a launch email',
      hostApp: 'com.apple.Notes',
      answers: { length: 'Long' },
    });
    const ready = state(flow.getState(), 'ready');
    expect(ready.answers).toEqual({ length: 'Long' });
    expect(unresolvedPicks(ready.draft, ready.answers)).toEqual([]);
  });

  it('ignores a chip value the draft did not offer', async () => {
    const { flow, ports, speak } = setup();
    await speak('write a launch email');
    await flow.answerChip('length', 'Enormous');
    await flow.answerChip('nope', 'Short');
    expect(ports.forge.forge).toHaveBeenCalledTimes(1);
    expect(state(flow.getState(), 'ready').answers).toEqual({});
  });

  it('asks before inserting when the frontmost app changed, then inserts there', async () => {
    const apps = [NOTES, SLACK, SLACK];
    const { flow, cmds, sent, speak } = setup({ forge: async () => NO_PICKS, native: { frontmost: async () => apps.shift()! } });
    await speak('write a launch email');
    await flow.insert();
    expect(cmds()).not.toContain('paste');
    expect(state(flow.getState(), 'ready').confirmApp).toEqual(SLACK);
    await flow.insert();
    expect(sent.at(-1)?.cmd).toBe('paste');
    expect(state(flow.getState(), 'done').app).toEqual(SLACK);
  });

  it('copies instead when the target changed and the user picks Copy', async () => {
    const apps = [NOTES, SLACK];
    const { flow, ports, cmds, speak } = setup({ forge: async () => NO_PICKS, native: { frontmost: async () => apps.shift()! } });
    await speak('write a launch email');
    await flow.insert();
    flow.copy();
    expect(ports.clipboard.writeText).toHaveBeenCalledWith('Write a launch email for the beta.');
    expect(state(flow.getState(), 'done').outcome).toBe('copied');
    expect(cmds()).not.toContain('paste');
  });

  it("reports 'copied' when the helper could only copy (no Accessibility)", async () => {
    const { flow, speak } = setup({ forge: async () => NO_PICKS, native: { paste: async () => ({ result: 'copied' }) } });
    await speak('write a launch email');
    await flow.insert();
    expect(state(flow.getState(), 'done').outcome).toBe('copied');
  });

  it('falls back to the clipboard when paste fails', async () => {
    const { flow, ports, speak } = setup({ forge: async () => NO_PICKS, native: { paste: async () => Promise.reject(new Error('timeout')) } });
    await speak('write a launch email');
    await flow.insert();
    expect(ports.clipboard.writeText).toHaveBeenCalledWith('Write a launch email for the beta.');
    expect(state(flow.getState(), 'done').outcome).toBe('copied');
  });

  it('copy works even with an unresolved pick', async () => {
    const { flow, ports, speak } = setup();
    await speak('write a launch email');
    flow.copy();
    expect(ports.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(state(flow.getState(), 'done').outcome).toBe('copied');
  });

  it('dismiss hides the panel, closes the mic and drops a late draft', async () => {
    const forge = deferred<ForgeResponse>();
    const { flow, ports, cmds, speak } = setup({ forge: () => forge.promise });
    await flow.handleNative({ event: 'hotkey', state: 'down' });
    flow.dismiss();
    expect(ports.panel.hide).toHaveBeenCalled();
    expect(cmds().at(-1)).toBe('dictation.stop');
    expect(flow.getState()).toEqual({ phase: 'idle' });

    const pending = speak('write a launch email');
    await vi.waitFor(() => expect(flow.getState().phase).toBe('drafting'));
    flow.dismiss();
    forge.resolve(DRAFT);
    await pending;
    expect(flow.getState()).toEqual({ phase: 'idle' });
  });
});
