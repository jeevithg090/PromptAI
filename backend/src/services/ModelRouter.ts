import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';
import { routingTableSchema, type ModelRoute, type ModelComplexity, type RoutingTable } from '../types/Provider';

/**
 * Model routing — spec §7.3, §9.1. Reads config/model-routing.json so
 * swapping a model for a pipeline step is a config edit, not a code change.
 */
let cached: RoutingTable | null = null;

function routingPath(): string {
  // backend/src/services → repo root is three levels up (same depth from dist/).
  return config.MODEL_ROUTING_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'model-routing.json');
}

export function loadRoutingTable(): RoutingTable {
  if (cached) return cached;
  const raw = fs.readFileSync(routingPath(), 'utf-8');
  cached = routingTableSchema.parse(JSON.parse(raw));
  return cached;
}

export function resolveRoute(pipelineStep: string, complexity: ModelComplexity): ModelRoute {
  const table = loadRoutingTable();
  const match = table.routes.find((r) => r.pipeline_step === pipelineStep && r.complexity === complexity);
  const route = match ?? table.default;
  return { provider: route.provider, model_id: route.model_id };
}
