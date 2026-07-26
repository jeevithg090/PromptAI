import type { KnowledgeChunk } from '../types/Agent';

/**
 * Canonical [P<n>]/[M<n>] numbering for knowledge chunks (V1.6).
 * The DraftingAgent labels chunks this way inside its system prompt, and the
 * Response Design Layer must map the model's citations back to sources — so
 * the numbering lives HERE, in one place, and both sides use it. Keep the
 * slice cap in sync: only the first 8 chunks are ever shown to the model.
 */
export const CHUNK_REF_CAP = 8;

export interface NumberedChunk {
  /** Citation token as it appears in prompts/rationales, e.g. "P1", "M2". */
  ref: string;
  chunk: KnowledgeChunk;
}

export function numberChunks(chunks: KnowledgeChunk[] | undefined): NumberedChunk[] {
  const capped = (chunks ?? []).slice(0, CHUNK_REF_CAP);
  const numbered: NumberedChunk[] = [];
  let p = 0;
  let m = 0;
  for (const chunk of capped) {
    if (chunk.kind === 'pkb') {
      p += 1;
      numbered.push({ ref: `P${p}`, chunk });
    } else {
      m += 1;
      numbered.push({ ref: `M${m}`, chunk });
    }
  }
  return numbered;
}
