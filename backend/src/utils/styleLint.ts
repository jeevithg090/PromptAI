import { estimateTokens } from '../guardrails/TokenGovernor';

/**
 * Deterministic style-rule checks (V2.8) — pure functions, exhaustively
 * testable, no LLM. The `tone` rule is the only one that needs a model and is
 * handled separately in StyleLinterService.
 */
export type RuleKind = 'banned_term' | 'required_term' | 'max_length_tokens' | 'tone' | 'required_node';

export interface StyleRule {
  kind: RuleKind;
  value: string;
}

export interface Violation {
  rule: StyleRule;
  severity: 'high' | 'medium' | 'low';
  where: string; // node_type or 'prompt'
  fix_hint: string;
}

export interface LintTarget {
  assembled: string;
  nodeTypes: string[]; // present node types (for required_node)
}

/** Runs every non-tone rule deterministically. Returns violations (empty = clean). */
export function lintDeterministic(target: LintTarget, rules: StyleRule[]): Violation[] {
  const violations: Violation[] = [];
  const haystack = target.assembled.toLowerCase();

  for (const rule of rules) {
    const term = rule.value.trim();
    switch (rule.kind) {
      case 'banned_term': {
        if (term && haystack.includes(term.toLowerCase())) {
          violations.push({ rule, severity: 'high', where: 'prompt', fix_hint: `Remove or replace “${term}”.` });
        }
        break;
      }
      case 'required_term': {
        if (term && !haystack.includes(term.toLowerCase())) {
          violations.push({ rule, severity: 'medium', where: 'prompt', fix_hint: `Add “${term}” to the prompt.` });
        }
        break;
      }
      case 'max_length_tokens': {
        const max = Number(term);
        if (Number.isFinite(max) && max > 0) {
          const tokens = estimateTokens(target.assembled);
          if (tokens > max) {
            violations.push({ rule, severity: 'medium', where: 'prompt', fix_hint: `Prompt is ~${tokens} tokens; trim to under ${max}.` });
          }
        }
        break;
      }
      case 'required_node': {
        if (term && !target.nodeTypes.includes(term)) {
          violations.push({ rule, severity: 'medium', where: term, fix_hint: `Add a “${term.replace(/_/g, ' ')}” node.` });
        }
        break;
      }
      case 'tone':
        // Handled by the LLM path in StyleLinterService — skip here.
        break;
    }
  }
  return violations;
}
