import { Hono } from 'hono';
import { getDb } from '../utils/db.js';
import { logger } from '../utils/logger.js';

const router = new Hono();

const VALID_AGENTS = ['intent_classifier', 'drafting', 'critic', 'preview', 'all'] as const;

router.post('/admin/kill/:agent', async (c) => {
  const agent = c.req.param('agent');
  if (!VALID_AGENTS.includes(agent as typeof VALID_AGENTS[number])) {
    return c.json({ error: `Unknown agent: ${agent}. Valid: ${VALID_AGENTS.join(', ')}` }, 400);
  }

  const db = getDb();
  const adminUser = c.get('adminUser');
  const agents = agent === 'all' ? VALID_AGENTS.filter((a) => a !== 'all') : [agent];

  for (const a of agents) {
    const { error: upsertError } = await db
      .from('feature_flags')
      .upsert(
        { key: `agent_${a}`, value: false, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    if (upsertError) {
      logger.error({ error: upsertError, agent: a }, 'Kill switch upsert failed');
    }

    const { error: auditError } = await db.from('audit_log').insert({
      actor: adminUser.id,
      action: `kill_${a}`,
      status: 'completed',
      detail: { agent: a, admin_email: adminUser.email },
    });
    if (auditError) {
      logger.error({ error: auditError, agent: a }, 'Audit log insert failed');
    }
  }

  return c.json({ status: 'killed', agent });
});

export { router as killRouter };
