import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';
import { platformRegistrySchema, type Platform, type PlatformRegistry } from '../types/Platform';

/**
 * Platform Registry access — spec §5.1.
 * v1 reads the versioned JSON file; T1.3 moves the source of truth into
 * Postgres (seeded from the same file) and T5.5 puts reads behind the
 * Cloudflare KV edge cache. Consumers only ever call this service.
 */
let cached: PlatformRegistry | null = null;

function registryPath(): string {
  // backend/src/services → repo root is three levels up (same depth from dist/).
  return config.PLATFORM_REGISTRY_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'platform-registry.json');
}

export function loadRegistry(): PlatformRegistry {
  if (cached) return cached;
  const raw = fs.readFileSync(registryPath(), 'utf-8');
  cached = platformRegistrySchema.parse(JSON.parse(raw));
  return cached;
}

export function listPlatforms(): Platform[] {
  return loadRegistry().platforms;
}

export function getPlatform(platformId: string): Platform | undefined {
  return loadRegistry().platforms.find((p) => p.platform_id === platformId);
}
