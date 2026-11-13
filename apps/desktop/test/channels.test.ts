import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { bundleOptions } from '../scripts/build.mjs';
import { assertChannel, channelFrom } from '../scripts/channels.mjs';

const AUTO_PASTE = 'src/auto-paste.ts';
const bytesOf = (metafile: { outputs: Record<string, { inputs: Record<string, { bytesInOutput: number }> }> }) =>
  Object.values(metafile.outputs).reduce((n, o) => n + (o.inputs[AUTO_PASTE]?.bytesInOutput ?? 0), 0);

describe('channel profiles', () => {
  it('ships auto-paste in direct and drops it from mas-lite', async () => {
    const direct = await build({ ...bundleOptions('direct'), write: false as const, logLevel: 'silent' });
    expect(bytesOf(direct.metafile)).toBeGreaterThan(0);
    const lite = await build({ ...bundleOptions('mas-lite'), write: false as const, logLevel: 'silent' });
    expect(bytesOf(lite.metafile)).toBe(0);
    expect(() => assertChannel(lite.metafile, 'mas-lite')).not.toThrow();
    const preload = lite.outputFiles!.find((f) => f.path.endsWith('preload.cjs'))!.text;
    expect(preload).toMatch(/insertAtCursor: (false|!1)/);
  });

  it('fails a mas-lite build that can reach a forbidden module', () => {
    const leaky = { outputs: { 'dist/main.cjs': { inputs: { [AUTO_PASTE]: { bytesInOutput: 120 } } } } };
    expect(() => assertChannel(leaky, 'mas-lite')).toThrow(/forbids src\/auto-paste.ts/);
    expect(() => assertChannel(leaky, 'direct')).not.toThrow();
  });

  it('refuses an unknown channel', () => {
    expect(channelFrom({})).toBe('direct');
    expect(channelFrom({ PROMPTAI_CHANNEL: 'mas-lite' })).toBe('mas-lite');
    expect(() => channelFrom({ PROMPTAI_CHANNEL: 'store' })).toThrow(/not one of/);
  });
});
