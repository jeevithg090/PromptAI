/**
 * PipelineGraph (V1.7) — a small, dependency-free typed graph runtime for
 * orchestrating the drafting pipeline. Replaces the Supervisor's implicit
 * for-loop with an explicit topology: named nodes, unconditional and
 * conditional edges, first-class interrupts (for the clarification pause),
 * per-node retry policy, and a cycle guard so cyclic edges can't run away.
 *
 * See docs/orchestration-review.md for why this is a ~200-line local runtime
 * rather than @langchain/langgraph (Lambda cold-start budget), and the
 * mechanical migration path to it.
 *
 * State is a mutable object threaded through every node (matching how the
 * pipeline mutates its PipelineContext); handlers return an OUTCOME that the
 * runtime uses to decide the next node.
 */
export const END = '__end__' as const;

export type NodeOutcome =
  | { kind: 'continue' } // follow this node's edge(s)
  | { kind: 'goto'; node: string } // jump to a named node (enables cycles)
  | { kind: 'halt'; reason?: string } // terminate the run (failure/blocked)
  | { kind: 'interrupt'; reason?: string }; // suspend for later resume

export const cont = (): NodeOutcome => ({ kind: 'continue' });
export const goTo = (node: string): NodeOutcome => ({ kind: 'goto', node });
export const halt = (reason?: string): NodeOutcome => ({ kind: 'halt', reason });
export const interrupt = (reason?: string): NodeOutcome => ({ kind: 'interrupt', reason });

export type NodeHandler<S> = (state: S) => Promise<NodeOutcome> | NodeOutcome;

interface NodeDef<S> {
  handler: NodeHandler<S>;
  maxAttempts: number;
}

export interface NodeVisit {
  node: string;
  outcome: NodeOutcome['kind'];
  attempts: number;
}

export interface GraphResult<S> {
  state: S;
  /** null when the run reached END normally; otherwise why/where it stopped. */
  halted: { kind: 'halt' | 'interrupt'; node: string; reason?: string } | null;
  visits: NodeVisit[];
}

export class GraphError extends Error {}

export class PipelineGraph<S> {
  private readonly nodes = new Map<string, NodeDef<S>>();
  private readonly edges = new Map<string, string>();
  private readonly condEdges = new Map<string, (state: S) => string>();
  private entry?: string;

  constructor(private readonly maxVisitsPerNode = 25) {}

  addNode(name: string, handler: NodeHandler<S>, opts: { maxAttempts?: number } = {}): this {
    if (name === END) throw new GraphError(`'${END}' is reserved`);
    if (this.nodes.has(name)) throw new GraphError(`duplicate node '${name}'`);
    this.nodes.set(name, { handler, maxAttempts: Math.max(1, opts.maxAttempts ?? 1) });
    return this;
  }

  /** Unconditional edge: after `from` returns continue, go to `to`. */
  addEdge(from: string, to: string): this {
    this.edges.set(from, to);
    return this;
  }

  /** Conditional edge: after `from` returns continue, `router(state)` picks the next node (or END). */
  addConditionalEdge(from: string, router: (state: S) => string): this {
    this.condEdges.set(from, router);
    return this;
  }

  setEntry(name: string): this {
    this.entry = name;
    return this;
  }

  private nextNode(from: string, state: S): string {
    const router = this.condEdges.get(from);
    if (router) return router(state);
    return this.edges.get(from) ?? END;
  }

  async run(state: S): Promise<GraphResult<S>> {
    if (!this.entry) throw new GraphError('no entry node set');
    const visits: NodeVisit[] = [];
    const visitCounts = new Map<string, number>();
    let current = this.entry;

    while (current !== END) {
      const node = this.nodes.get(current);
      if (!node) throw new GraphError(`edge points at unknown node '${current}'`);

      const count = (visitCounts.get(current) ?? 0) + 1;
      visitCounts.set(current, count);
      if (count > this.maxVisitsPerNode) {
        throw new GraphError(`cycle guard tripped: node '${current}' visited > ${this.maxVisitsPerNode} times`);
      }

      // Per-node retry: re-invoke the handler if it THROWS, up to maxAttempts.
      let outcome: NodeOutcome | undefined;
      let attempts = 0;
      let lastError: unknown;
      for (; attempts < node.maxAttempts; attempts++) {
        try {
          outcome = await node.handler(state);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!outcome) {
        // Every attempt threw — surface as a halt so the run terminates cleanly.
        visits.push({ node: current, outcome: 'halt', attempts });
        return {
          state,
          halted: { kind: 'halt', node: current, reason: lastError instanceof Error ? lastError.message : String(lastError) },
          visits,
        };
      }

      visits.push({ node: current, outcome: outcome.kind, attempts: attempts + 1 });

      switch (outcome.kind) {
        case 'continue':
          current = this.nextNode(current, state);
          break;
        case 'goto':
          current = outcome.node;
          break;
        case 'halt':
          return { state, halted: { kind: 'halt', node: current, reason: outcome.reason }, visits };
        case 'interrupt':
          return { state, halted: { kind: 'interrupt', node: current, reason: outcome.reason }, visits };
      }
    }

    return { state, halted: null, visits };
  }
}
