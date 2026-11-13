/**
 * Channel profiles (blueprint §5): build-time configuration that fixes caps.
 * Pick one with PROMPTAI_CHANNEL when building.
 *
 * - direct: notarized outside the Mac App Store; Insert pastes with ⌘V.
 * - mas-lite: a Mac App Store "Lite" build. No posted key events: Insert
 *   copies and the user presses ⌘V, so src/auto-paste.ts must not ship.
 */
export const CHANNELS = {
  direct: { caps: { insertAtCursor: true }, forbidden: [] },
  'mas-lite': { caps: { insertAtCursor: false }, forbidden: ['src/auto-paste.ts'] },
};

export function channelFrom(env) {
  const name = env.PROMPTAI_CHANNEL || 'direct';
  if (!Object.hasOwn(CHANNELS, name)) throw new Error(`PROMPTAI_CHANNEL=${name} is not one of ${Object.keys(CHANNELS).join(', ')}`);
  return name;
}

/** esbuild `define`s, so the code a channel forbids is dead and tree-shaken, not merely switched off. */
export function channelDefines(name) {
  return {
    __PROMPTAI_CHANNEL__: JSON.stringify(name),
    __PROMPTAI_AUTO_PASTE__: String(CHANNELS[name].caps.insertAtCursor),
  };
}

/** Fails the build when a module the channel forbids contributes bytes to any output (esbuild metafile, paths relative to apps/desktop). */
export function assertChannel(metafile, name) {
  const forbidden = CHANNELS[name].forbidden;
  for (const [output, { inputs }] of Object.entries(metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(inputs)) {
      if (bytesInOutput > 0 && forbidden.includes(input)) {
        throw new Error(`The ${name} channel forbids ${input}, but it is reachable from ${output}.`);
      }
    }
  }
}
