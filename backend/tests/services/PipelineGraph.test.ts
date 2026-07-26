import { PipelineGraph, END, cont, goTo, halt, interrupt, GraphError } from '../../src/services/PipelineGraph';

/** V1.7 — the graph runtime that orchestrates the pipeline. */

interface S {
  log: string[];
  counter: number;
  attemptsSeen: number;
}

const fresh = (): S => ({ log: [], counter: 0, attemptsSeen: 0 });

describe('PipelineGraph (V1.7)', () => {
  it('runs a linear topology to END and records visits in order', async () => {
    const g = new PipelineGraph<S>();
    g.addNode('a', (s) => { s.log.push('a'); return cont(); });
    g.addNode('b', (s) => { s.log.push('b'); return cont(); });
    g.addNode('c', (s) => { s.log.push('c'); return cont(); });
    g.setEntry('a').addEdge('a', 'b').addEdge('b', 'c').addEdge('c', END);

    const res = await g.run(fresh());
    expect(res.halted).toBeNull();
    expect(res.state.log).toEqual(['a', 'b', 'c']);
    expect(res.visits.map((v) => v.node)).toEqual(['a', 'b', 'c']);
  });

  it('routes on a conditional edge', async () => {
    const g = new PipelineGraph<S>();
    g.addNode('start', (s) => { s.counter = 5; return cont(); });
    g.addNode('big', (s) => { s.log.push('big'); return cont(); });
    g.addNode('small', (s) => { s.log.push('small'); return cont(); });
    g.setEntry('start');
    g.addConditionalEdge('start', (s) => (s.counter > 3 ? 'big' : 'small'));
    g.addEdge('big', END).addEdge('small', END);

    const res = await g.run(fresh());
    expect(res.state.log).toEqual(['big']);
  });

  it('halts and reports the reason and node', async () => {
    const g = new PipelineGraph<S>();
    g.addNode('a', () => cont());
    g.addNode('b', () => halt('boom'));
    g.addNode('c', (s) => { s.log.push('should-not-run'); return cont(); });
    g.setEntry('a').addEdge('a', 'b').addEdge('b', 'c').addEdge('c', END);

    const res = await g.run(fresh());
    expect(res.halted).toEqual({ kind: 'halt', node: 'b', reason: 'boom' });
    expect(res.state.log).toEqual([]);
  });

  it('suspends on an interrupt for later resume', async () => {
    const g = new PipelineGraph<S>();
    g.addNode('ask', () => interrupt('awaiting_input'));
    g.addNode('after', (s) => { s.log.push('after'); return cont(); });
    g.setEntry('ask').addEdge('ask', 'after').addEdge('after', END);

    const res = await g.run(fresh());
    expect(res.halted).toEqual({ kind: 'interrupt', node: 'ask', reason: 'awaiting_input' });
    expect(res.state.log).toEqual([]);
  });

  it('supports cycles via goto and bounds them with the cycle guard', async () => {
    const g = new PipelineGraph<S>(3); // max 3 visits per node
    g.addNode('loop', (s) => {
      s.counter++;
      return s.counter < 2 ? goTo('loop') : cont();
    });
    g.setEntry('loop').addEdge('loop', END);

    // Terminates within the guard.
    const ok = await g.run(fresh());
    expect(ok.halted).toBeNull();
    expect(ok.state.counter).toBe(2);

    // A runaway cycle trips the guard.
    const runaway = new PipelineGraph<S>(3);
    runaway.addNode('spin', () => goTo('spin'));
    runaway.setEntry('spin');
    await expect(runaway.run(fresh())).rejects.toBeInstanceOf(GraphError);
  });

  it('retries a throwing node up to maxAttempts, then halts', async () => {
    const g = new PipelineGraph<S>();
    let calls = 0;
    g.addNode('flaky', (s) => {
      calls++;
      if (calls < 3) throw new Error('transient');
      s.log.push('recovered');
      return cont();
    }, { maxAttempts: 3 });
    g.setEntry('flaky').addEdge('flaky', END);

    const res = await g.run(fresh());
    expect(res.halted).toBeNull();
    expect(res.state.log).toEqual(['recovered']);
    expect(res.visits[0]!.attempts).toBe(3);
  });

  it('halts when every attempt throws', async () => {
    const g = new PipelineGraph<S>();
    g.addNode('always-fails', () => { throw new Error('down'); }, { maxAttempts: 2 });
    g.setEntry('always-fails').addEdge('always-fails', END);

    const res = await g.run(fresh());
    expect(res.halted?.kind).toBe('halt');
    expect(res.halted?.reason).toBe('down');
  });

  it('rejects a graph with no entry', async () => {
    const g = new PipelineGraph<S>();
    g.addNode('a', () => cont());
    await expect(g.run(fresh())).rejects.toBeInstanceOf(GraphError);
  });

  it('rejects duplicate node names', () => {
    const g = new PipelineGraph<S>();
    g.addNode('a', () => cont());
    expect(() => g.addNode('a', () => cont())).toThrow(GraphError);
  });
});
