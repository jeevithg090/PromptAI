/**
 * The one code path that posts ⌘V into another app (pf-native's `paste`).
 * The mas-lite channel forbids it: main only reaches this module behind the
 * build-time channel flag, and scripts/build.mjs fails a mas-lite bundle
 * that still contains it.
 */
import type { NativeRequest } from './flow.ts';

export function createAutoPaste(native: { request(cmd: NativeRequest): Promise<Record<string, unknown>> }) {
  return async (text: string): Promise<'pasted' | 'copied'> => ((await native.request({ cmd: 'paste', text })).result === 'pasted' ? 'pasted' : 'copied');
}
