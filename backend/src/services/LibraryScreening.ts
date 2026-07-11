/**
 * Library submission screening pipeline (§14.2, T7.6).
 * Safety + quality scoring → auto-publish / queue / reject.
 */
import { generate } from './providers';
import { classifyOrFailClosed, ContentSafetyClassifier } from '../guardrails/ContentSafetyClassifier';
import type { PipelineContext } from '../types/Agent';

export interface ScreeningResult {
  approved: boolean;
  moderationStatus: 'approved' | 'pending' | 'rejected';
  reason?: string;
}

const STRENGTH_THRESHOLD_AUTO = 70;
const STRENGTH_THRESHOLD_REJECT = 40;

export async function screenSubmission(
  title: string,
  description: string,
  assembledTemplate: string
): Promise<ScreeningResult> {
  // Safety screening.
  const mockContext = { sessionId: 'library-screening', userId: 'system', platform: { display_name: 'screening' } } as unknown as PipelineContext;
  const safety = await classifyOrFailClosed(new ContentSafetyClassifier(), `${title}\n${description}\n${assembledTemplate}`, mockContext);
  if (!safety.safe) {
    return { approved: false, moderationStatus: 'rejected', reason: safety.reason ?? 'Failed safety screening' };
  }

  // Quality scoring via critic-style generate call.
  try {
    const res = await generate('critic', 'large', {
      systemPrompt: `You are evaluating a prompt template submitted to a community library.
Score 0–100. Score < 40: reject. Score 40–69: needs review. Score ≥ 70: auto-approve.
Respond with ONLY a JSON object: {"strength": <0-100>, "issues": ["<issue>"]}`,
      messages: [{ role: 'user', content: `Title: ${title}\nDescription: ${description}\n\nTemplate:\n${assembledTemplate}` }],
      maxTokens: 500,
      temperature: 0.3,
      responseFormat: 'json',
    });
    const parsed = JSON.parse(res.content) as { strength: number; issues?: string[] };
    const strength = typeof parsed.strength === 'number' ? parsed.strength : 0;
    if (strength >= STRENGTH_THRESHOLD_AUTO) {
      return { approved: true, moderationStatus: 'approved' };
    }
    if (strength >= STRENGTH_THRESHOLD_REJECT) {
      return { approved: false, moderationStatus: 'pending', reason: `Score ${strength} — needs human review` };
    }
    return { approved: false, moderationStatus: 'rejected', reason: `Score ${strength}: ${(parsed.issues ?? ['low quality']).join('; ')}` };
  } catch {
    return { approved: false, moderationStatus: 'pending', reason: 'Scoring unavailable — queued for review' };
  }
}
