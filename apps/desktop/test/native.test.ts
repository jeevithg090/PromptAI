import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativeEvent } from '@promptai/contract';
import { createNativeClient, type HelperProcess } from '../src/native.ts';

/** An in-memory pf-native: records command lines, lets the test write event lines. */
class FakeHelper extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  commands: Record<string, unknown>[] = [];
  constructor() {
    super();
    createInterface({ input: this.stdin }).on('line', (l) => this.commands.push(JSON.parse(l)));
  }
  emitLine(obj: unknown) {
    this.stdout.write(`${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n`);
  }
  kill() {
    this.emit('exit', null, 'SIGTERM');
    return true;
  }
  /** Waits for the nth command line (1-based). */
  async command(n: number) {
    await vi.waitFor(() => expect(this.commands.length).toBeGreaterThanOrEqual(n));
    return this.commands[n - 1]!;
  }
}

function setup(timeoutMs = 1_000) {
  const helpers: FakeHelper[] = [];
  const events: NativeEvent[] = [];
  const logs: string[] = [];
  const client = createNativeClient({
    bin: '/fake/pf-native',
    timeoutMs,
    onEvent: (e) => events.push(e),
    log: (m) => logs.push(m),
    spawn: () => {
      const h = new FakeHelper();
      helpers.push(h);
      return h as unknown as HelperProcess;
    },
  });
  return { client, helpers, events, logs, helper: () => helpers.at(-1)! };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('native client', () => {
  it('sends JSON lines with ids and schema defaults, and matches replies by id', async () => {
    const { client, helper } = setup();
    const a = client.request({ cmd: 'frontmost' });
    const b = client.request({ cmd: 'paste', text: 'hi' });
    const first = await helper().command(1);
    const second = await helper().command(2);
    expect(first).toEqual({ cmd: 'frontmost', id: '1' });
    expect(second).toEqual({ cmd: 'paste', id: '2', text: 'hi', restoreClipboard: true });
    helper().emitLine({ event: 'reply', id: '2', ok: true, data: { result: 'pasted' } });
    helper().emitLine({ event: 'reply', id: '1', ok: true, data: { bundleId: 'com.apple.Notes', name: 'Notes', pid: 4 } });
    await expect(b).resolves.toEqual({ result: 'pasted' });
    await expect(a).resolves.toEqual({ bundleId: 'com.apple.Notes', name: 'Notes', pid: 4 });
  });

  it('rejects when the helper refuses a command', async () => {
    const { client, helper } = setup();
    const p = client.request({ cmd: 'dictation.start', locale: 'en-US' });
    const cmd = await helper().command(1);
    helper().emitLine({ event: 'reply', id: cmd.id, ok: false, error: 'microphone denied' });
    await expect(p).rejects.toThrow('microphone denied');
  });

  it('times out a command that gets no reply', async () => {
    const { client } = setup(30);
    await expect(client.request({ cmd: 'frontmost' })).rejects.toThrow(/did not answer frontmost within 30 ms/);
  });

  it('forwards events and ignores lines it cannot parse', async () => {
    const { helper, events, logs } = setup();
    helper().emitLine('not json');
    helper().emitLine({ event: 'hotkey', state: 'sideways' });
    helper().emitLine({ event: 'ready', version: '0.1.0', axTrusted: false });
    helper().emitLine({ event: 'hotkey', state: 'down' });
    helper().emitLine({ event: 'transcript', text: 'hello', final: false });
    await vi.waitFor(() => expect(events).toHaveLength(3));
    expect(events.map((e) => e.event)).toEqual(['ready', 'hotkey', 'transcript']);
    expect(logs.filter((l) => l.startsWith('ignored'))).toHaveLength(2);
  });

  it('restarts the helper once, failing what was in flight, then gives up', async () => {
    const { client, helpers, events } = setup();
    const inFlight = client.request({ cmd: 'frontmost' });
    await helpers[0]!.command(1);
    helpers[0]!.emit('exit', 1, null);
    await expect(inFlight).rejects.toThrow(/pf-native exited/);
    expect(helpers).toHaveLength(2);

    const again = client.request({ cmd: 'frontmost' });
    const cmd = await helpers[1]!.command(1);
    helpers[1]!.emitLine({ event: 'reply', id: cmd.id, ok: true, data: {} });
    await expect(again).resolves.toEqual({});

    helpers[1]!.emit('exit', null, 'SIGKILL');
    expect(helpers).toHaveLength(2);
    expect(events.at(-1)).toEqual({ event: 'error', message: 'pf-native exited (SIGKILL)' });
    await expect(client.request({ cmd: 'frontmost' })).rejects.toThrow('pf-native is not running');
  });

  it('does not restart after close()', async () => {
    const { client, helpers } = setup(20);
    client.close();
    await helpers[0]!.command(1);
    expect(helpers[0]!.commands[0]).toMatchObject({ cmd: 'quit' });
    await vi.waitFor(() => expect(helpers).toHaveLength(1));
  });
});
