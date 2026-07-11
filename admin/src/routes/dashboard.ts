import { Hono } from 'hono';
import { getDb } from '../utils/db.js';

const router = new Hono();

router.get('/admin/dashboard', async (c) => {
  const db = getDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [usersResult, draftsResult, sessionsResult, strengthResult, budgetResult, auditResult] =
    await Promise.all([
      db.from('app_users').select('id', { count: 'exact', head: true }),
      db.from('sessions').select('id', { count: 'exact', head: true })
        .gte('created_at', todayISO),
      db.from('sessions').select('id', { count: 'exact', head: true })
        .not('final_state', 'is', null),
      db.from('sessions').select('strength_score')
        .not('strength_score', 'is', null),
      db.from('usage_events').select('id', { count: 'exact', head: true })
        .gt('cost_usd', 0),
      db.from('audit_log').select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const scores = (strengthResult.data ?? []) as { strength_score: number | null }[];
  const valid = scores.filter((s) => s.strength_score !== null) as { strength_score: number }[];
  const avgStrength =
    valid.length > 0
      ? Math.round((valid.reduce((a, s) => a + s.strength_score, 0) / valid.length) * 100) / 100
      : null;

  return c.json({
    totalUsers: usersResult.count ?? 0,
    draftsToday: draftsResult.count ?? 0,
    activeSessions: sessionsResult.count ?? 0,
    avgStrength,
    budgetExceededCount: budgetResult.count ?? 0,
    lastAuditEvent: auditResult.data ?? null,
  });
});

export { router as dashboardRouter };
