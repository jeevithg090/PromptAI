/**
 * Public share links for saved prompts (F2.4). Creating a share is a
 * PUBLICATION event → it re-runs the content-safety gate (same classifier as
 * library submissions). The public read returns NO owner identity. Links are
 * revocable; a revoked/missing slug 404s. Slugs are unguessable (128-bit).
 */
import crypto from 'node:crypto';
import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import { classifyOrFailClosed, ContentSafetyClassifier } from '../guardrails/ContentSafetyClassifier';
import { parseVars } from '../utils/templateVars';
import type { PipelineContext } from '../types/Agent';

export class ShareBlocked extends Error {}
export class ShareNotFound extends Error {}

function newSlug(): string {
  return crypto.randomBytes(16).toString('base64url'); // 22 chars, 128-bit
}

/** Create (or return existing active) share link for a prompt the caller owns. */
export async function createShare(userId: string, promptId: string): Promise<{ slug: string }> {
  const pool = getPool();
  const res = await pool.query(
    `select content_ciphertext as assembled from prompts where id = $1 and user_id = $2`,
    [promptId, userId]
  );
  if (res.rows.length === 0) throw new ShareNotFound();
  const assembled = String(res.rows[0].assembled ?? '');

  // Safety gate — a share is a new publication, re-screen even if scored at save.
  const ctx = { sessionId: 'share', userId, platform: { display_name: 'share' } } as unknown as PipelineContext;
  const safety = await classifyOrFailClosed(new ContentSafetyClassifier(), assembled, ctx);
  if (!safety.safe) throw new ShareBlocked(safety.reason ?? 'blocked by safety');

  const slug = newSlug();
  await pool.query(`insert into share_links (prompt_id, slug) values ($1, $2)`, [promptId, slug]);
  logger.info({ type: 'share:created', userId, promptId });
  return { slug };
}

export async function revokeShare(userId: string, promptId: string): Promise<number> {
  const pool = getPool();
  const res = await pool.query(
    `update share_links set revoked_at = now()
     where prompt_id = $1 and revoked_at is null
       and prompt_id in (select id from prompts where user_id = $2)`,
    [promptId, userId]
  );
  return res.rowCount ?? 0;
}

/** Public read — NO owner identity in the payload. */
export async function getShare(slug: string): Promise<{
  assembled: string;
  nodes: unknown[];
  strength_score: number | null;
  variables: unknown[];
} | null> {
  const pool = getPool();
  const res = await pool.query(
    `select p.content_ciphertext as assembled, p.strength_score, p.variables,
            pv.nodes_json
     from share_links sl
     join prompts p on p.id = sl.prompt_id
     left join prompt_versions pv on pv.prompt_id = p.id and pv.version = p.version
     where sl.slug = $1 and sl.revoked_at is null`,
    [slug]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const assembled = String(row.assembled ?? '');
  const nodes = row.nodes_json
    ? (typeof row.nodes_json === 'string' ? JSON.parse(row.nodes_json) : row.nodes_json)
    : [];
  const variables = row.variables
    ? (typeof row.variables === 'string' ? JSON.parse(row.variables) : row.variables)
    : parseVars(assembled);
  return { assembled, nodes, strength_score: row.strength_score ?? null, variables };
}
