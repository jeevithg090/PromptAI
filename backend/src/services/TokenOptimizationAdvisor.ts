import { estimateTokens } from '../guardrails/TokenGovernor';
import type { Platform } from '../types/Platform';

/**
 * Token-reduction advisor — spec §16, TA.3 (FA-3).
 * Deterministic, NEVER an LLM call. Beyond raw token counting (the Governor),
 * this tells the user HOW to spend fewer tokens for the same result: detect
 * verbosity/redundancy and suggest concrete trims + format conversions
 * (PDF→Markdown, prose tables→CSV, boilerplate→reference), each with the why
 * and an estimated saving where it can be computed.
 */
export interface OptimizationSuggestion {
  kind:
    | 'pdf_to_markdown'
    | 'table_to_csv'
    | 'remove_redundancy'
    | 'trim_filler'
    | 'deduplicate_lines'
    | 'shorten_whitespace';
  message: string;
  /** Rough token saving if applied, when estimable. */
  estimatedTokenSaving?: number;
}

export interface OptimizationReport {
  tokenCount: number;
  suggestions: OptimizationSuggestion[];
  /** Sum of estimable savings — a headline "you could save ~N tokens". */
  totalEstimatedSaving: number;
}

/** Filler phrases that add tokens without adding instruction value. */
const FILLER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(please|kindly)\b/gi, label: 'politeness filler' },
  { re: /\b(i would like you to|i want you to|i need you to|can you please|could you please)\b/gi, label: 'verbose request framing' },
  { re: /\b(as an ai language model|in order to|due to the fact that|at this point in time|for the purpose of)\b/gi, label: 'wordy phrasing' },
  { re: /\b(basically|essentially|actually|really|very|just|simply|kind of|sort of)\b/gi, label: 'weak intensifier' },
];

const WORD = /\b\w+\b/;

export function analyzeTokenUsage(
  text: string,
  opts: { platform?: Platform; hasPdfAttachment?: boolean } = {}
): OptimizationReport {
  const tokenCount = estimateTokens(text);
  const suggestions: OptimizationSuggestion[] = [];

  // 1. PDF → Markdown (explicit flag, or the text mentions an attached PDF/doc).
  if (opts.hasPdfAttachment || /\b(attached|pasted|following)\b.{0,40}\b(pdf|docx?|document)\b/i.test(text) || /\bpdf\b/i.test(text)) {
    suggestions.push({
      kind: 'pdf_to_markdown',
      message:
        "Convert PDFs/Word docs to Markdown before pasting — the extracted text of a PDF carries layout noise and costs noticeably more tokens; Markdown is ~30–50% leaner and models parse its structure more reliably.",
    });
  }

  // 2. Prose that looks like a table → CSV/pipe rows.
  const rowLikeLines = text.split('\n').filter((l) => (l.match(/[:\-–]/g)?.length ?? 0) >= 1 && WORD.test(l));
  if (rowLikeLines.length >= 4 && /\b(column|row|table|field|value)\b/i.test(text)) {
    suggestions.push({
      kind: 'table_to_csv',
      message: 'Tabular data is cheaper as CSV or pipe-delimited rows than as prose sentences — drop the repeated "the X is Y" framing and send just the rows with a header.',
    });
  }

  // 3. Duplicate lines (copy-paste boilerplate).
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  let duplicateChars = 0;
  for (const l of lines) {
    if (l.length > 20 && seen.has(l)) duplicateChars += l.length;
    seen.add(l);
  }
  if (duplicateChars > 0) {
    suggestions.push({
      kind: 'deduplicate_lines',
      message: 'Repeated identical lines detected — state shared context once (or move it to a system prompt / project rules) instead of re-sending it.',
      estimatedTokenSaving: estimateTokens('x'.repeat(duplicateChars)),
    });
  }

  // 4. Filler words/phrases.
  let fillerChars = 0;
  const foundLabels = new Set<string>();
  for (const { re, label } of FILLER_PATTERNS) {
    const matches = text.match(re);
    if (matches) {
      fillerChars += matches.join('').length;
      foundLabels.add(label);
    }
  }
  if (fillerChars > 0) {
    suggestions.push({
      kind: 'trim_filler',
      message: `Trim low-value wording (${[...foundLabels].join(', ')}) — it adds tokens without changing the instruction. Prefer direct imperatives ("Summarize X" over "I would like you to please summarize X").`,
      estimatedTokenSaving: estimateTokens('x'.repeat(fillerChars)),
    });
  }

  // 5. Excess whitespace / blank-line runs.
  const collapsed = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  if (collapsed.length < text.length) {
    suggestions.push({
      kind: 'shorten_whitespace',
      message: 'Collapse repeated spaces and blank lines — whitespace is tokenized too.',
      estimatedTokenSaving: estimateTokens('x'.repeat(text.length - collapsed.length)),
    });
  }

  const totalEstimatedSaving = suggestions.reduce((sum, s) => sum + (s.estimatedTokenSaving ?? 0), 0);
  return { tokenCount, suggestions, totalEstimatedSaving };
}
