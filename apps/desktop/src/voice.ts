import type { VoiceCommand as SpokenCommand } from '@promptai/core';
import type { VoiceCommand } from './flow.ts';

/**
 * Turn a command core recognised in the locale pack's grammar (blueprint §7
 * "Modes and commands") into an action on the draft on screen. Anything that
 * isn't one of the fixed commands is a Refine instruction for that draft.
 */
export function toFlowCommand(spoken: SpokenCommand): VoiceCommand {
  switch (spoken.kind) {
    case 'insert':
      return { id: 'insert' };
    case 'copy':
      return { id: 'copy' };
    case 'cancel':
      return { id: 'dismiss' };
    case 'just_draft':
      return { id: 'accept_suggestions' };
    case 'refine':
      return { id: 'refine', instruction: spoken.instruction ?? '' };
  }
}
