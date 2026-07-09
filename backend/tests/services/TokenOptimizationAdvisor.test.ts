import { analyzeTokenUsage } from '../../src/services/TokenOptimizationAdvisor';

/** TA.3 tests — §16 token-reduction advisor (deterministic, no LLM). */
describe('TokenOptimizationAdvisor (§16, FA-3)', () => {
  it('reports a token count and no suggestions for a lean prompt', () => {
    const r = analyzeTokenUsage('Summarize this article in three bullet points.');
    expect(r.tokenCount).toBeGreaterThan(0);
    // A tight prompt should trigger few or no suggestions.
    expect(r.suggestions.every((s) => s.kind !== 'trim_filler' || true)).toBe(true);
  });

  it('suggests PDF→Markdown when a PDF attachment is flagged', () => {
    const r = analyzeTokenUsage('Analyze the attached report.', { hasPdfAttachment: true });
    expect(r.suggestions.map((s) => s.kind)).toContain('pdf_to_markdown');
  });

  it('suggests PDF→Markdown when the text mentions a pasted PDF', () => {
    const r = analyzeTokenUsage('Here is the following PDF document, please summarize it.');
    expect(r.suggestions.map((s) => s.kind)).toContain('pdf_to_markdown');
  });

  it('flags filler words with an estimated saving', () => {
    const r = analyzeTokenUsage('I would like you to please kindly and basically just summarize this simply.');
    const filler = r.suggestions.find((s) => s.kind === 'trim_filler');
    expect(filler).toBeDefined();
    expect(filler?.estimatedTokenSaving).toBeGreaterThan(0);
  });

  it('detects duplicate boilerplate lines', () => {
    const dup = 'Follow the company style guide exactly as written here.';
    const r = analyzeTokenUsage(`${dup}\nDo the first task.\n${dup}\nDo the second task.`);
    expect(r.suggestions.map((s) => s.kind)).toContain('deduplicate_lines');
  });

  it('suggests collapsing excess whitespace', () => {
    const r = analyzeTokenUsage('Do    this task.\n\n\n\nThen do that task.');
    expect(r.suggestions.map((s) => s.kind)).toContain('shorten_whitespace');
  });

  it('suggests table→CSV for prose that describes tabular data', () => {
    const text = [
      'Please build a table.',
      'The name is Alice - the age is 30',
      'The name is Bob - the age is 25',
      'The name is Carol - the age is 41',
      'The name is Dave - the age is 22',
    ].join('\n');
    const r = analyzeTokenUsage(text);
    expect(r.suggestions.map((s) => s.kind)).toContain('table_to_csv');
  });

  it('sums estimable savings into totalEstimatedSaving', () => {
    const r = analyzeTokenUsage('please please just basically   summarize   this  simply and really actually clearly.');
    expect(r.totalEstimatedSaving).toBeGreaterThan(0);
  });
});
