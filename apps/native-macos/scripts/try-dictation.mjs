// Manual dictation check (not run by tests: it uses the microphone, and the first run may show the
// macOS microphone prompt). Starts dictation, prints transcripts for 5 s, then stops.
// Usage: node scripts/try-dictation.mjs [locale=en-US] [contextual string ...]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const [locale = 'en-US', ...contextualStrings] = process.argv.slice(2);
const helper = spawn(fileURLToPath(new URL('../bin/pf-native', import.meta.url)), [], { stdio: ['pipe', 'pipe', 'inherit'] });
const send = (cmd) => helper.stdin.write(JSON.stringify(cmd) + '\n');
const fail = (what, error) => {
  console.error(`${what} failed: ${error}`);
  process.exitCode = 1;
  helper.stdin.end();
};

createInterface({ input: helper.stdout }).on('line', (line) => {
  const e = JSON.parse(line);
  if (e.event === 'ready') {
    console.log(`ready (axTrusted=${e.axTrusted}); starting ${locale} dictation`);
    send({ cmd: 'dictation.start', id: 'start', locale, contextualStrings });
  } else if (e.event === 'transcript') {
    console.log(e.final ? `final: ${e.text}` : `  ... ${e.text}`);
  } else if (e.event === 'reply' && e.id === 'start') {
    if (!e.ok) return fail('dictation.start', e.error);
    console.log('listening for 5 s, speak now');
    setTimeout(() => send({ cmd: 'dictation.stop', id: 'stop' }), 5000);
  } else if (e.event === 'reply' && e.id === 'stop') {
    if (!e.ok) return fail('dictation.stop', e.error);
    helper.stdin.end();
  } else {
    console.log(line);
  }
});
