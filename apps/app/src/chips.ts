import type { Assumption, ForgeResponse } from '@promptai/contract';
import type { Answers } from './bridge.ts';

/** A pick must be answered before Insert; an assumption needn't be. */
export function unresolvedPicks(draft: ForgeResponse, answers: Answers): Assumption[] {
  return draft.assumptions.filter((a) => a.kind === 'pick' && answers[a.slotId] === undefined);
}

/** The suggestion first (one tap, or key 1, accepts it), then the other options. */
export function chipOptions(chip: Assumption): string[] {
  return [chip.value, ...chip.options.filter((o) => o !== chip.value)];
}

/** Issues the checks marked `block`: Insert stays off while any is present (Copy still works). */
export function blockingIssues(draft: ForgeResponse) {
  return (draft.issues ?? []).filter((i) => i.severity === 'block');
}

/** Splits the brief so specifics that trace to nothing the user said can be marked. */
export function markUnsourced(brief: string, unsourced: string[]): { text: string; unsourced: boolean }[] {
  const terms = unsourced.filter((t) => t.trim()).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [{ text: brief, unsourced: false }];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return brief
    .split(re)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, unsourced: terms.includes(part) }));
}
