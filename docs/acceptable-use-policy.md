# PromptForge Acceptable Use Policy — v1.0 (draft)

> **Spec reference:** §33.5. This is the legal/policy companion to the technical guardrails (§33.1–33.3). Categories here map 1:1 to the Content Safety Classifier's categories so enforcement and policy never drift apart. Have counsel review before public launch.

## What PromptForge is for

PromptForge helps you write better prompts for AI platforms. We support creative expression, satire, educational content, professional work, and discussion of sensitive or controversial topics. The rules below exist to stop genuine abuse — not to police legitimate creativity.

## Prohibited uses

You may not use PromptForge to create or optimize prompts that:

1. **Bypass safety systems** ("jailbreaks") — attempt to circumvent the safety guidelines of PromptForge or any target AI platform (e.g. "ignore your instructions," "unrestricted mode" framings). *(Classifier category: `jailbreak`)*
2. **Facilitate serious illegal activity** — solicit instructions for synthesizing controlled substances, building weapons, committing fraud, or unauthorized computer access. *(Category: `illegal_instruction`)*
3. **Harm children** — request, describe, or facilitate child sexual abuse material, grooming, or exploitation in any form. Zero tolerance; reported to relevant authorities where required by law. *(Category: `csam`)*
4. **Target real people or groups** — defame, harass, or incite violence against identifiable individuals or groups, or create intimate/sexual imagery of real people without consent. *(Categories: `targeted_harassment`, `intimate_deepfake`)*
5. **Deceive at scale** — generate disinformation intended to mislead (fabricated news, impersonation of real people or organizations for deception). *(Categories: `disinformation`, `impersonation`)*
6. **Create malicious code** — malware, credential theft, or unauthorized-access tooling. *(Category: `malicious_code`)*

## What is explicitly allowed

- Fiction involving dark themes, violence, or strong language (a dark fantasy novel is not a threat).
- Satire and parody.
- Educational and harm-reduction content about sensitive topics.
- Prompts about controversial subjects (politics, religion, social issues) — PromptForge does not have an opinion.
- Security research framed as such for systems you're authorized to test.

## Enforcement

PromptForge automatically screens prompts (before drafting, after drafting, and before library publishing). If a violation is detected:

1. The prompt is blocked and never sent to a target platform.
2. You're told which policy category was triggered and can appeal.
3. Repeated deliberate violations may lead to account suspension. CSAM leads to immediate termination and, where required, reporting.
4. If our safety system is unavailable, generation pauses rather than proceeding unchecked (**fail closed**).

## Appeals

Automated classifiers make mistakes. If your prompt was blocked and you believe it's legitimate:

- File an appeal from the block notice, with optional context.
- A human reviews the blocked prompt (your appeal authorizes review of that specific prompt), the classifier's reasoning, and your note — target turnaround: 24 hours.
- If we got it wrong, the block is lifted and the classifier is corrected to reduce that false positive class. If the appeal is denied, we explain why.

## Reporting

Report content you believe violates this policy (e.g. a library template) to **safety@[domain]**. Reports are logged and reviewed.

## Changes

We version this policy and announce material changes. Continued use after a change constitutes acceptance.
