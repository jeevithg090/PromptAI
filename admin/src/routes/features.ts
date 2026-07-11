import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../utils/db.js';

const router = new Hono();

const upsertSchema = z.object({
  flag: z.string().min(1),
  enabled: z.boolean(),
});

router.get('/admin/features', async (c) => {
  const db = getDb();
  const { data, error } = await db.from('feature_flags').select('*').order('key');
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.put('/admin/features', async (c) => {
  const body = await c.req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);

  const { flag, enabled } = parsed.data;
  const db = getDb();

  const { data, error } = await db
    .from('feature_flags')
    .upsert({ key: flag, value: enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    flag: data.key,
    enabled: data.value,
    updated_at: data.updated_at,
  });
});

export { router as featuresRouter };
