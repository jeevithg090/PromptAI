/**
 * Shared provider fetch-mock helpers so integration/service tests stay green
 * regardless of which provider a pipeline step is routed to. Tests steer canned
 * responses by a marker string in the system prompt; the routed provider may be
 * OpenAI-compatible (Groq/Cerebras/OpenAI: `messages[]` in, `choices[]` out) or
 * the native Gemini adapter (`systemInstruction`/`contents` in, `candidates[]`
 * out). These helpers read the system prompt and emit a body valid for BOTH.
 */

/** Extract the system-prompt text from a mocked provider request, either shape. */
export function systemPromptOf(init: RequestInit): string {
  const body = JSON.parse(init.body as string) as {
    messages?: Array<{ role: string; content: string }>;
    systemInstruction?: { parts?: Array<{ text?: string }> };
  };
  if (body.messages) {
    return body.messages.find((m) => m.role === 'system')?.content ?? '';
  }
  if (body.systemInstruction?.parts) {
    return body.systemInstruction.parts.map((p) => p.text ?? '').join(' ');
  }
  return '';
}

/** A completion body valid for both OpenAI-compatible AND native Gemini adapters. */
export function dualCompletion(content: unknown): unknown {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return {
    // OpenAI-compatible shape.
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 60, completion_tokens: 40 },
    // Native Gemini shape.
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 40 },
  };
}
