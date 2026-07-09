import { PKBService } from '../services/PKBService';
import { logger } from '../utils/logger';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Doc Retrieval Agent — spec §6, §10.2, §31.3 Step 13.
 * Builds a retrieval query from classified intent + entities + platform,
 * pulls the top-k PKB/MPKB chunks via pgvector, and hands them to the
 * pipeline (Supervisor merges them into context.pkbChunks).
 *
 * Degrades gracefully (§29.7): retrieval failure returns `partial` with
 * zero chunks — drafting proceeds ungrounded rather than not at all.
 */
export class DocRetrievalAgent implements Agent {
  name = 'DocRetrievalAgent';

  constructor(private readonly pkb: PKBService = new PKBService()) {}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;
    const query = [
      context.taskType ?? 'general prompt',
      ...Object.values(context.entities ?? {}),
      `on ${context.platform.display_name}`,
    ].join(' ');

    try {
      const chunks = await this.pkb.retrieve(query, { platform_id: context.platform.platform_id }, 5);
      return { status: 'success', data: { chunks }, tokensUsed: 0 };
    } catch (error) {
      logger.warn({
        type: 'agent:retrieval_degraded',
        agent: this.name,
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Ungrounded drafting beats no drafting — never fail the pipeline here.
      return { status: 'partial', data: { chunks: [] }, tokensUsed: 0 };
    }
  }
}
