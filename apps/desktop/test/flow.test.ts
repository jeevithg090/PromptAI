import { describe, expect, it, vi } from 'vitest';
import type { ForgeRequest, ForgeResponse } from '@promptai/contract';
import { createAutoPaste } from '../src/auto-paste.ts';
import { createFlow, unresolvedPicks, type FlowPorts, type FlowState, type NativeRequest, type VoiceCommand } from '../src/flow.ts';

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

function setup(
  opts: {
    native?: Partial<Record<NativeRequest['cmd'], Handler>>;
    forge?: (req: ForgeRequest) => Promise<ForgeResponse>;
    /** The mas-lite channel: no auto-paste. */
    noAutoPaste?: boolean;
    matchVoiceCommand?: FlowPorts['matchVoiceCommand'];
  } = {},
) {
  const sent: NativeRequest[] = [];
  const handlers: Record<string, Handler> = {
    frontmost: async () => NOTES,
    'dictation.start': async () => ({}),
    'dictation.stop': async () => ({}),
    paste: async () => ({ result: 'pasted' }),
    ...opts.native,
  };
  const native = {
    request: vi.fn((cmd: NativeRequest) => {
      sent.push(cmd);
      return handlers[cmd.cmd]!(cmd);
    }),
  };
  const tracked: { type: string; props: Record<string, unknown> }[] = [];
  const ports: FlowPorts = {
    native,
    forge: { forge: vi.fn(opts.forge ?? (async () => DRAFT)) },
    panel: { show: vi.fn(), hide: vi.fn() },
    clipboard: { writeText: vi.fn() },
    autoPaste: opts.noAutoPaste ? null : createAutoPaste(native),
    events: { track: (type, props) => void tracked.push({ type, props }) },
    ...(opts.matchVoiceCommand ? { matchVoiceCommand: opts.matchVoiceCommand } : {}),
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
  return { flow, ports, sent, cmds, phases, speak, tracked };
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
    expect(ports.forge.forge).toHaveBeenCalledWith({ text: 'write a launch email', surface: 'desktop', hostApp: 'com.apple.Notes' });
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

  it('cleans the transcript on the Mac before drafting (fillers, "scratch that")', async () => {
    const { ports, speak } = setup();
    await speak('um write a song about my dog, scratch that, about my cat');
    expect(ports.forge.forge).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.not.stringMatching(/\bum\b|scratch that|dog/i) }),
    );
    expect(vi.mocked(ports.forge.forge).mock.calls[0]![0].text).toMatch(/cat/);
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
    expect(ports.forge.forge).toHaveBeenLastCalledWith({ text: 'plan my week', surface: 'desktop', hostApp: 'com.apple.Notes' });
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
      surface: 'desktop',
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

  it('emits content-free events carrying the decisionId, and rates the receipt once', async () => {
    const decisionId = '0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a';
    const { flow, speak, tracked } = setup({ forge: async () => ({ ...DRAFT, decisionId }) });
    await speak('write a launch email');
    await flow.answerChip('length', 'Long'); // a flip redrafts and shows a new brief
    await flow.answerChip('length', 'Short');
    await flow.insert();
    flow.rate('worked');
    flow.rate('didnt_work'); // once per receipt
    expect(state(flow.getState(), 'done').rated).toBe('worked');
    expect(tracked.map((e) => e.type)).toEqual(['brief.shown', 'chip.flipped', 'brief.shown', 'brief.inserted', 'outcome.rated']);
    for (const e of tracked) expect(e.props).toMatchObject({ decisionId, toolId: 'claude', surface: 'desktop' });
    expect(tracked[1]!.props).toMatchObject({ slotId: 'length', kind: 'pick', option: 2 });
    expect(tracked[4]!.props).toMatchObject({ rating: 'worked', outcome: 'pasted' });
    // Nothing the user said rides along.
    expect(JSON.stringify(tracked)).not.toMatch(/launch email/);
  });

  it('records a copy and a dismissal', async () => {
    const { flow, speak, tracked } = setup({ forge: async () => NO_PICKS });
    await speak('write a launch email');
    flow.copy();
    await speak('write it again');
    flow.dismiss();
    expect(tracked.map((e) => [e.type, e.props.via ?? null])).toEqual([
      ['brief.shown', null],
      ['brief.copied', 'copy'],
      ['brief.shown', null],
      ['brief.dismissed', null],
    ]);
  });

  it('keeps Insert off while an issue blocks it', async () => {
    const { flow, cmds, speak } = setup({ forge: async () => ({ ...NO_PICKS, issues: [{ code: 'too_long', message: 'Over the limit', severity: 'block' }] }) });
    await speak('write a launch email');
    await flow.insert();
    expect(cmds()).not.toContain('paste');
    expect(flow.getState().phase).toBe('ready');
  });

  it('mas-lite: Insert copies and never posts ⌘V', async () => {
    const { flow, ports, cmds, speak, tracked } = setup({ forge: async () => NO_PICKS, noAutoPaste: true });
    await speak('write a launch email');
    await flow.insert();
    expect(cmds()).not.toContain('paste');
    expect(ports.clipboard.writeText).toHaveBeenCalledWith('Write a launch email for the beta.');
    const done = state(flow.getState(), 'done');
    expect(done.outcome).toBe('copied');
    expect(done.app).toEqual(NOTES); // the receipt says "Press ⌘V in Notes"
    expect(tracked.at(-1)).toMatchObject({ type: 'brief.copied', props: { via: 'insert' } });
  });

  it('runs a voice command on the open sheet instead of drafting it (the hook W1 plugs into)', async () => {
    const heard: string[] = [];
    const matchVoiceCommand = (t: string): VoiceCommand | null => {
      heard.push(t);
      return t === 'copy it' ? { id: 'copy' } : null;
    };
    const { flow, ports, speak } = setup({ forge: async () => NO_PICKS, matchVoiceCommand });
    await speak('write a launch email');
    await speak('copy it');
    expect(heard).toEqual(['copy it']); // only asked while a sheet was open
    expect(ports.forge.forge).toHaveBeenCalledTimes(1);
    expect(ports.clipboard.writeText).toHaveBeenCalledWith('Write a launch email for the beta.');
    expect(state(flow.getState(), 'done').transcript).toBe('write a launch email');
    await speak('plan my week'); // not a command: drafted as usual
    expect(ports.forge.forge).toHaveBeenCalledTimes(2);
  });

  it('"just draft it" accepts every unanswered pick, so Insert unblocks', async () => {
    const { flow, speak } = setup({ matchVoiceCommand: (t) => (t === 'just draft it' ? { id: 'accept_suggestions' } : null) });
    await speak('write a launch email');
    expect(state(flow.getState(), 'ready').answers).toEqual({});
    await speak('just draft it');
    expect(state(flow.getState(), 'ready').answers).toEqual({ length: 'Short' }); // the pick's suggestion
  });

  it('a spoken instruction redrafts the same words with it, keeping the answers', async () => {
    const { flow, ports, speak } = setup({
      forge: async () => NO_PICKS,
      matchVoiceCommand: (t) => (t === 'make it shorter' ? { id: 'refine', instruction: 'Make it shorter.' } : null),
    });
    await speak('write a launch email');
    await speak('make it shorter');
    expect(vi.mocked(ports.forge.forge).mock.calls.at(-1)![0].text).toBe('write a launch email\nMake it shorter.');
    expect(state(flow.getState(), 'ready').transcript).toBe('write a launch email\nMake it shorter.');
  });
});

describe('voice commands from the locale pack', () => {
  it('maps the grammar onto actions on the open draft', async () => {
    const { toFlowCommand } = await import('../src/voice.ts');
    expect(toFlowCommand({ kind: 'insert' })).toEqual({ id: 'insert' });
    expect(toFlowCommand({ kind: 'cancel' })).toEqual({ id: 'dismiss' });
    expect(toFlowCommand({ kind: 'just_draft' })).toEqual({ id: 'accept_suggestions' });
    expect(toFlowCommand({ kind: 'refine', instruction: 'Change the tone to formal.' })).toEqual({ id: 'refine', instruction: 'Change the tone to formal.' });
  });
});
