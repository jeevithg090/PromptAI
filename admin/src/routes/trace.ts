import { Hono } from 'hono';
import { getDb } from '../utils/db.js';

const router = new Hono();

router.get('/admin/trace/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const db = getDb();

  const { data, error } = await db
    .from('audit_log')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

export { router as traceRouter };
