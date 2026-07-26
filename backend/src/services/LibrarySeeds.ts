import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';

/**
 * Curated library seeds (V1.3) — the DB-degraded fallback for GET /library,
 * and the guaranteed baseline content so the public library is never empty.
 * Source of truth: config/library-seeds.json (mirrored in web/src/data).
 */
const seedEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  niche: z.string(),
  modality: z.string(),
  platform_id: z.string(),
  idea: z.string(),
  template: z.string(),
});
export type LibrarySeedEntry = z.infer<typeof seedEntrySchema>;

const seedsFileSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  entries: z.array(seedEntrySchema).min(1),
});

let cached: LibrarySeedEntry[] | null = null;

function seedsPath(): string {
  // backend/src/services → repo root is three levels up (same depth from dist/).
  return config.LIBRARY_SEEDS_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'library-seeds.json');
}

export function loadLibrarySeeds(): LibrarySeedEntry[] {
  if (cached) return cached;
  cached = seedsFileSchema.parse(JSON.parse(fs.readFileSync(seedsPath(), 'utf-8'))).entries;
  return cached;
}
