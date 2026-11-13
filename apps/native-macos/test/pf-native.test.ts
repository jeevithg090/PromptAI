// Integration test: spawns bin/pf-native and checks every stdout line against the contract.
// Safe on a live desktop: no dictation (mic prompt), no key presses, and paste only when the helper
// is NOT trusted for Accessibility (so it can only copy, never post ⌘V).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nativeEventSchema, type NativeCommand, type NativeEvent } from '@promptai/contract';

const bin = fileURLToPath(new URL('../bin/pf-native', import.meta.url));
type Event<K extends NativeEvent['event']> = Extract<NativeEvent, { event: K }>;

class Helper {
  readonly proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  readonly exited = new Promise<number | null>((resolve) => this.proc.on('exit', resolve));
  /** Lines that are not JSON or fail nativeEventSchema. */
  readonly invalid: string[] = [];
  private unread: NativeEvent[] = [];
  private onEvent = new Set<() => void>();

  constructor() {
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      let parsed;
      try {
        parsed = nativeEventSchema.safeParse(JSON.parse(line));
      } catch {}
      if (parsed?.success) this.unread.push(parsed.data);
      else this.invalid.push(line);
      for (const notify of this.onEvent) notify();
    });
  }

  /** Resolves with the first unread event of this kind that matches, waiting for it if needed. */
  take<K extends NativeEvent['event']>(kind: K, match: (e: Event<K>) => boolean = () => true, ms = 5000): Promise<Event<K>> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const i = this.unread.findIndex((e) => e.event === kind && match(e as Event<K>));
        if (i < 0) return;
        this.onEvent.delete(check);
        clearTimeout(timer);
        resolve(this.unread.splice(i, 1)[0] as Event<K>);
      };
      const timer = setTimeout(() => {
        this.onEvent.delete(check);
        reject(new Error(`timed out waiting for a ${kind} event`));
      }, ms);
      this.onEvent.add(check);
      check();
    });
  }

  send(cmd: NativeCommand): Promise<Event<'reply'>> {
    this.proc.stdin.write(JSON.stringify(cmd) + '\n');
    return this.take('reply', (e) => e.id === cmd.id);
  }
}

describe.skipIf(process.platform !== 'darwin')('pf-native', () => {
  let helper: Helper;
  let ready: Event<'ready'>;

  beforeAll(async () => {
    expect(existsSync(bin), `${bin} is missing: run pnpm --filter @promptai/native-macos build`).toBe(true);
    helper = new Helper();
    ready = await helper.take('ready');
  });
  afterAll(() => {
    helper?.proc.kill();
  });

  it('announces ready with its version and Accessibility trust', () => {
    expect(ready).toEqual({ event: 'ready', version: '0.1.0', axTrusted: expect.any(Boolean) });
  });

  it('reports an invalid line as an error and stays alive', async () => {
    helper.proc.stdin.write('not json\n');
    expect((await helper.take('error')).message).toBeTruthy();
    expect(await helper.send({ cmd: 'frontmost', id: 'alive' })).toMatchObject({ ok: true });
    expect(helper.proc.exitCode).toBeNull();
  });

  it('reports the frontmost app', async () => {
    const r = await helper.send({ cmd: 'frontmost', id: 'front' });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ bundleId: expect.any(String), pid: expect.any(Number) });
  });

  it('registers ⌃⌥⇧F19, and registering again replaces it', async () => {
    const register = (id: string): NativeCommand => ({ cmd: 'hotkey.register', id, keyCode: 80, modifiers: ['control', 'option', 'shift'] });
    expect(await helper.send(register('hotkey-1'))).toMatchObject({ ok: true });
    expect(await helper.send(register('hotkey-2'))).toMatchObject({ ok: true });
  });

  it('copies to the clipboard when not trusted for Accessibility', async (ctx) => {
    ctx.skip(ready.axTrusted, 'trusted for Accessibility: paste would post ⌘V into the real frontmost app');
    const saved = execFileSync('pbpaste', { encoding: 'utf8' });
    try {
      const r = await helper.send({ cmd: 'paste', id: 'paste', text: 'pf-native test\n\n', restoreClipboard: true });
      expect(r).toMatchObject({ ok: true, data: { result: 'copied' } });
      expect(execFileSync('pbpaste', { encoding: 'utf8' })).toBe('pf-native test');  // trailing newlines stripped
    } finally {
      execFileSync('pbcopy', { input: saved });
    }
  });

  it('replies to quit, then exits 0', async () => {
    const other = new Helper();
    await other.take('ready');
    expect(await other.send({ cmd: 'quit', id: 'quit' })).toMatchObject({ ok: true });
    expect(await other.exited).toBe(0);
    expect(other.invalid).toEqual([]);
  });

  it('exits when stdin closes, having written only valid events', async () => {
    helper.proc.stdin.end();
    expect(await helper.exited).toBe(0);
    expect(helper.invalid).toEqual([]);
  });
});
