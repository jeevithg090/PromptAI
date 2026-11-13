#!/usr/bin/env node
// A stand-in for pf-native that speaks the stdio protocol (packages/contract/src/native.ts)
// and touches nothing on the machine: no hotkey, no mic, no clipboard, no key events.
// With FAKE_NATIVE_CONTROL=<port> it connects to a test's TCP control socket: every command
// it receives is forwarded there, and every JSON line the test sends is emitted as an event.
import { connect } from 'node:net';
import { createInterface } from 'node:readline';

const FRONTMOST = { bundleId: 'com.apple.Notes', name: 'Notes', pid: 4242 };
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const reply = (id, data) => emit({ event: 'reply', id, ok: true, ...(data ? { data } : {}) });

let control = null;
let lastTranscript = '';
if (process.env.FAKE_NATIVE_CONTROL) {
  control = connect(Number(process.env.FAKE_NATIVE_CONTROL), '127.0.0.1');
  createInterface({ input: control }).on('line', (line) => {
    const event = JSON.parse(line);
    if (event.event === 'transcript') lastTranscript = event.text;
    emit(event);
  });
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const cmd = JSON.parse(line);
  control?.write(`${JSON.stringify(cmd)}\n`);
  switch (cmd.cmd) {
    case 'frontmost':
      return reply(cmd.id, FRONTMOST);
    case 'dictation.stop':
      // The final transcript precedes the reply, as the real helper does.
      emit({ event: 'transcript', text: lastTranscript, final: true });
      return reply(cmd.id);
    case 'paste':
      return reply(cmd.id, { result: 'pasted' });
    case 'quit':
      reply(cmd.id);
      return process.exit(0);
    default:
      return reply(cmd.id);
  }
});

emit({ event: 'ready', version: '0.0.0-fake', axTrusted: true });
