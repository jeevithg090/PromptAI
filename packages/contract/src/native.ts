import { z } from 'zod';

/**
 * Protocol between the Electron main process and `pf-native`, the macOS Swift
 * helper (blueprint §5, §7). One JSON object per line: commands on the
 * helper's stdin, events on its stdout. Every command carries an `id`, and the
 * helper answers each with exactly one `reply` carrying the same id.
 */
export const modifierSchema = z.enum(['cmd', 'option', 'control', 'shift']);

export const nativeCommandSchema = z.discriminatedUnion('cmd', [
  /** Register the hold-to-talk combo with Carbon RegisterEventHotKey (press and release, no Accessibility grant). */
  z.object({ cmd: z.literal('hotkey.register'), id: z.string(), keyCode: z.number().int().nonnegative(), modifiers: z.array(modifierSchema) }),
  /** Start on-device dictation from the default microphone with Apple SpeechAnalyzer. */
  z.object({
    cmd: z.literal('dictation.start'),
    id: z.string(),
    locale: z.string().max(35),
    contextualStrings: z.array(z.string().max(100)).max(100).default([]),
  }),
  /** Stop dictation; the final transcript arrives as a `transcript` event with final: true before the reply. */
  z.object({ cmd: z.literal('dictation.stop'), id: z.string() }),
  /**
   * Insert text into the frontmost app: clipboard + ⌘V via CGEvent when the
   * process is trusted for Accessibility, else clipboard only. The reply's
   * data.result is 'pasted' or 'copied'. Never presses Enter.
   */
  z.object({ cmd: z.literal('paste'), id: z.string(), text: z.string(), restoreClipboard: z.boolean().default(true) }),
  /** Report the frontmost app: reply data { bundleId, name, pid }. */
  z.object({ cmd: z.literal('frontmost'), id: z.string() }),
  z.object({ cmd: z.literal('quit'), id: z.string() }),
]);
export type NativeCommand = z.input<typeof nativeCommandSchema>;

export const nativeEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('ready'), version: z.string(), axTrusted: z.boolean() }),
  z.object({
    event: z.literal('reply'),
    id: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({ event: z.literal('hotkey'), state: z.enum(['down', 'up']) }),
  z.object({ event: z.literal('transcript'), text: z.string(), final: z.boolean() }),
  z.object({ event: z.literal('error'), message: z.string() }),
]);
export type NativeEvent = z.infer<typeof nativeEventSchema>;
