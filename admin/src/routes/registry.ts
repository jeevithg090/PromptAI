import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../utils/db.js';
import { logger } from '../utils/logger.js';

const router = new Hono();

router.get('/admin/registry', async (c) => {
  const db = getDb();
  const { data, error } = await db.from('platforms').select('*').order('platform_id');
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.post('/admin/registry/sync', async (c) => {
  const db = getDb();

  let registry: { platforms: unknown[]; schema_version: string; last_verified: string };
  try {
    const configPath = join(process.cwd(), '..', 'config', 'platform-registry.json');
    const raw = readFileSync(configPath, 'utf-8');
    registry = JSON.parse(raw);
  } catch {
    try {
      const raw = readFileSync('/var/task/config/platform-registry.json', 'utf-8');
      registry = JSON.parse(raw);
    } catch (err) {
      logger.error({ err }, 'Failed to read platform-registry.json');
      return c.json({ error: 'Platform registry file not found' }, 500);
    }
  }

  let inserted = 0;
  let updated = 0;

  for (const p of registry.platforms as Record<string, unknown>[]) {
    const row = {
      platform_id: p.platform_id as string,
      display_name: p.display_name as string,
      modalities: p.modalities as string[],
      url_patterns: p.url_patterns as string[],
      dom_fingerprint_selectors: (p.dom_fingerprint_selectors as string[]) ?? [],
      input_selector_candidates: (p.input_selector_candidates as string[]) ?? [],
      docs_url: p.docs_url as string,
      quirks: (p.quirks as string[]) ?? [],
      syntax_rules: (p.syntax_rules as string[]) ?? [],
      max_prompt_tokens: p.max_prompt_tokens as number,
      tos_reviewed: (p.tos_reviewed as boolean) ?? false,
      schema_version: registry.schema_version,
      last_verified: registry.last_verified,
      deprecated: false,
    };

    const { error: upsertError } = await db
      .from('platforms')
      .upsert(row, { onConflict: 'platform_id', ignoreDuplicates: false });

    if (upsertError) {
      logger.error({ error: upsertError, platform_id: p.platform_id }, 'Platform upsert failed');
      continue;
    }

    const existing = await db
      .from('platforms')
      .select('platform_id')
      .eq('platform_id', p.platform_id as string)
      .maybeSingle();

    if (existing.data) {
      updated++;
    } else {
      inserted++;
    }
  }

  return c.json({ inserted, updated });
});

export { router as registryRouter };
