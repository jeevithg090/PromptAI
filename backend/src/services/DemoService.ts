import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';

/**
 * Curated demo examples for the anonymous "try it now" flow (§28.1, T4.3).
 * Config over code (§32.3): the examples live in config/demo-examples.json, not
 * inline — one source of truth for both GET /demo/examples and POST /demo/draft.
 */
const demoExampleSchema = z.object({
  example_id: z.string(),
  platform_id: z.string(),
  idea: z.string(),
  modality: z.string(),
  just_generate: z.boolean().default(true),
});
export type DemoExample = z.infer<typeof demoExampleSchema>;

let cached: DemoExample[] | null = null;

function demoExamplesPath(): string {
  // backend/src/services → repo root is three levels up (same depth from dist/).
  return config.DEMO_EXAMPLES_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'demo-examples.json');
}

export function loadDemoExamples(): DemoExample[] {
  if (cached) return cached;
  cached = z.array(demoExampleSchema).parse(JSON.parse(fs.readFileSync(demoExamplesPath(), 'utf-8')));
  return cached;
}

export function getDemoExample(exampleId: string): DemoExample | undefined {
  return loadDemoExamples().find((e) => e.example_id === exampleId);
}

/** Public-facing list (no full idea text — that's revealed only on run). */
export function listDemoExamples(): Array<{ example_id: string; platform_id: string; modality: string }> {
  return loadDemoExamples().map(({ example_id, platform_id, modality }) => ({ example_id, platform_id, modality }));
}
