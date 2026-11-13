/**
 * Client for pf-native, the macOS Swift helper (packages/contract/src/native.ts):
 * JSON lines over stdio, replies correlated by id, one restart if it dies.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { nativeCommandSchema, nativeEventSchema, type NativeEvent } from '@promptai/contract';
import type { NativeRequest } from './flow.ts';

/** The slice of ChildProcess the client uses, so tests can fake it. */
export interface HelperProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill(): boolean;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

export interface NativeClientOptions {
  bin: string;
  /** Every event except replies: ready, hotkey, transcript, error. */
  onEvent(event: NativeEvent): void;
  log?(message: string): void;
  timeoutMs?: number;
  spawn?(bin: string): HelperProcess;
}

interface Pending {
  resolve(data: Record<string, unknown>): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_RESTARTS = 1;

export function createNativeClient(opts: NativeClientOptions) {
  const log = opts.log ?? ((m: string) => console.error(`[pf-native] ${m}`));
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const spawn = opts.spawn ?? ((bin: string) => nodeSpawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] }));
  const pending = new Map<string, Pending>();
  let child: HelperProcess | null = null;
  let nextId = 0;
  let restarts = 0;
  let closing = false;

  function failAll(message: string) {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
      pending.delete(id);
    }
  }

  function onLine(line: string) {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      log(`ignored a line that is not JSON: ${line.slice(0, 200)}`);
      return;
    }
    const parsed = nativeEventSchema.safeParse(json);
    if (!parsed.success) {
      log(`ignored an unknown event: ${line.slice(0, 200)}`);
      return;
    }
    const event = parsed.data;
    if (event.event !== 'reply') {
      opts.onEvent(event);
      return;
    }
    const p = pending.get(event.id);
    if (!p) return;
    pending.delete(event.id);
    clearTimeout(p.timer);
    if (event.ok) p.resolve(event.data ?? {});
    else p.reject(new Error(event.error ?? 'pf-native refused the command'));
  }

  function start() {
    const proc = spawn(opts.bin);
    child = proc;
    let gone = false;
    const onGone = (why: string) => {
      if (gone) return;
      gone = true;
      if (child === proc) child = null;
      failAll(`pf-native ${why}`);
      if (closing) return;
      if (restarts < MAX_RESTARTS) {
        restarts++;
        log(`${why}; restarting`);
        start();
      } else {
        log(`${why}; giving up`);
        opts.onEvent({ event: 'error', message: `pf-native ${why}` });
      }
    };
    proc.on('error', (err) => onGone(`could not run (${opts.bin}): ${err.message}`));
    proc.on('exit', (code, signal) => onGone(`exited (${signal ?? `code ${code}`})`));
    proc.stdin.on('error', () => {}); // EPIPE after exit is reported by 'exit'
    createInterface({ input: proc.stdout }).on('line', onLine);
    createInterface({ input: proc.stderr }).on('line', (l) => log(l));
  }

  function request(cmd: NativeRequest, timeout = timeoutMs): Promise<Record<string, unknown>> {
    const id = `${++nextId}`;
    const line = JSON.stringify(nativeCommandSchema.parse({ ...cmd, id }));
    return new Promise((resolve, reject) => {
      if (!child) {
        reject(new Error('pf-native is not running'));
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`pf-native did not answer ${cmd.cmd} within ${timeout} ms`));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${line}\n`);
    });
  }

  /** Ask the helper to quit, then make sure it does. */
  function close() {
    closing = true;
    const proc = child;
    if (!proc) return;
    request({ cmd: 'quit' }, 1_000)
      .catch(() => {})
      .finally(() => proc.kill());
  }

  start();
  return { request, close };
}

export type NativeClient = ReturnType<typeof createNativeClient>;
