import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import { logger } from '../utils/logger.js';

const router = new Hono();

const moderateSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().optional(),
});

router.get('/admin/library/pending', async (c) => {
  const db = getDb();
  const { data, error } = await db
    .from('library_entries')
    .select('*')
    .eq('moderation_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.post('/admin/library/:id/moderate', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = moderateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);

  const { action, note } = parsed.data;
  const db = getDb();
  const adminUser = c.get('adminUser');

  const moderationStatus = action === 'approve' ? 'approved' : 'rejected';

  const { error: updateError } = await db
    .from('library_entries')
    .update({
      moderation_status: moderationStatus,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    })
    .eq('id', id);

  if (updateError) return c.json({ error: updateError.message }, 500);

  const { error: auditError } = await db.from('audit_log').insert({
    actor: adminUser.id,
    action: `library_${action}`,
    status: 'completed',
    detail: { entry_id: id, note: note ?? null },
  });
  if (auditError) {
    logger.error({ error: auditError }, 'Audit log insert failed');
  }

  return c.json({ status: 'ok', id, moderation_status: moderationStatus });
});

export { router as libraryRouter };
