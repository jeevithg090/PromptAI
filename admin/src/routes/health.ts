import { Hono } from 'hono';

const router = new Hono();

router.get('/admin/health', (c) => {
  return c.json({ ok: true, service: 'pf-admin' });
});

export { router as healthRouter };
