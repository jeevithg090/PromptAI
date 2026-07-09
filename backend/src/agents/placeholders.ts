import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Placeholder agents — spec §31.3 Step 11.
 * Each conforms to the standard Agent contract (§32.2) and echoes a
 * placeholder payload so the Supervisor's full state machine can be traced
 * end to end before real agent logic lands (tasks T2.5–T2.11 replace these
 * one by one; the Supervisor never changes when they do).
 */
function placeholder(name: string): Agent {
  return {
    name,
    async execute(input: AgentInput): Promise<AgentOutput> {
      return {
        status: 'success',
        data: { agent_placeholder: name, receivedIdeaLength: input.context.userIdea.length },
        tokensUsed: 0,
      };
    },
  };
}

// IntentClassificationAgent is real now — see IntentClassificationAgent.ts (T2.5 ✅)
// DocRetrievalAgent is real now — see DocRetrievalAgent.ts (T2.6 ✅)
// ClarifyingQuestionAgent is real now — see ClarifyingQuestionAgent.ts (T2.7 ✅)
// DraftingAgent is real now — see DraftingAgent.ts (T2.8 ✅)
// CriticAgent is real now — see CriticAgent.ts (T2.9 ✅)
export const AlternativesAgent = placeholder('AlternativesAgent'); // → T6.3
// MemoryExtractionAgent is real now — see MemoryExtractionAgent.ts (T2.11 ✅)
