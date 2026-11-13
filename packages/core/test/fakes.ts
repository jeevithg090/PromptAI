/** Test doubles for forge(): virtual time, a scripted LLM port and an IntentFrame builder. */
import { intentFrameSchema, type IntentFrame } from '@promptai/contract';
import type { Clock, LlmPort, RepairInput, UnderstandInput } from '../src/forge.ts';

/** Virtual time: a timer fires only once every promise is waiting, earliest due first. */
export function fakeClock(): Clock & { block(ms: number): void } {
  let t = 1_000;
  const timers: Array<{ due: number; fire: () => void; live: boolean }> = [];
  let pending = false;
  const schedule = () => { if (!pending) { pending = true; setImmediate(tick); } };
  const tick = () => {
    pending = false;
    timers.sort((a, b) => a.due - b.due);
    const next = timers.shift();
    if (next?.live) { t = Math.max(t, next.due); next.fire(); }
    if (timers.length) schedule();
  };
  return {
    now: () => t,
    block: (ms) => { t += ms; },
    after(ms) {
      let fire!: () => void;
      const promise = new Promise<void>((r) => { fire = r; });
      const timer = { due: t + ms, fire, live: true };
      timers.push(timer);
      schedule();
      return { promise, cancel: () => { timer.live = false; } };
    },
  };
}

export type Behavior =
  | { kind: 'throw' } | { kind: 'reject' } | { kind: 'hang' }
  | { kind: 'value'; value: unknown }
  | { kind: 'slow'; ms: number; value: unknown }     // waits on the clock, like a slow network
  | { kind: 'block'; ms: number; value: unknown }    // eats time synchronously
  | { kind: 'echo' };                                // an adversarial understand: every memory it was given goes into the goal

export type FakeLlm = LlmPort & { calls: number; understood: UnderstandInput[]; repaired: RepairInput[] };

export function fakeLlm(clock: ReturnType<typeof fakeClock>, behaviors: Behavior[]): FakeLlm {
  let i = 0;
  const act = (input: UnderstandInput | RepairInput): Promise<unknown> => {
    const b = behaviors[i++ % behaviors.length]!;
    switch (b.kind) {
      case 'throw': throw new Error('port blew up');
      case 'reject': return Promise.reject(new Error('port rejected'));
      case 'hang': return new Promise(() => {});
      case 'value': return Promise.resolve(b.value);
      case 'slow': return clock.after(b.ms).promise.then(() => b.value);
      case 'block': clock.block(b.ms); return Promise.resolve(b.value);
      case 'echo': {
        const mem = 'memories' in input ? input.memories.map((m) => m.text).join('; ') : '';
        return Promise.resolve(frame({ goal: `${'text' in input ? input.text : input.goal} ${mem}`.trim().slice(0, 2_000) }));
      }
    }
  };
  const port: FakeLlm = {
    calls: 0, understood: [], repaired: [],
    understand: (input) => { port.calls++; port.understood.push(input); return act(input); },
    repair: (input) => { port.calls++; port.repaired.push(input); return act(input); },
  };
  return port;
}

export const value = (v: unknown): Behavior => ({ kind: 'value', value: v });

/** A valid contract IntentFrame, with the given fields. */
export function frame(over: Partial<IntentFrame> = {}): IntentFrame {
  return intentFrameSchema.parse({
    family: 'generic', target: { toolId: null, source: 'none' }, goal: '', deliverable: '', successCriteria: [],
    slots: [], coveredForYou: [], unsure: [], language: { spoken: ['en'] }, risk: 'none', ...over,
  });
}
