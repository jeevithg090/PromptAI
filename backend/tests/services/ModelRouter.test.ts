import { loadRoutingTable, resolveRoute } from '../../src/services/ModelRouter';

describe('ModelRouter (§7.3, §9.1)', () => {
  it('loads and validates the routing table against the schema', () => {
    const table = loadRoutingTable();
    expect(typeof table.default.provider).toBe('string');
    expect(table.default.provider.length).toBeGreaterThan(0);
    expect(table.routes.length).toBeGreaterThan(0);
  });

  it('resolves a configured pipeline step + complexity to exactly its table entry', () => {
    // Model ids in the table are meant to change freely (config-over-code) —
    // assert routing fidelity, not a specific model name.
    const table = loadRoutingTable();
    const entry = table.routes.find((r) => r.pipeline_step === 'drafting' && r.complexity === 'large');
    expect(entry).toBeDefined();
    expect(resolveRoute('drafting', 'large')).toEqual({ provider: entry!.provider, model_id: entry!.model_id });
  });

  it('resolves a small-complexity step to its own table entry', () => {
    const table = loadRoutingTable();
    const entry = table.routes.find((r) => r.pipeline_step === 'intent_classification' && r.complexity === 'small');
    expect(resolveRoute('intent_classification', 'small').model_id).toBe(entry!.model_id);
  });

  it('falls back to the default route for an unknown pipeline step', () => {
    const route = resolveRoute('nonexistent_step', 'large');
    const table = loadRoutingTable();
    expect(route).toEqual(table.default);
  });
});
