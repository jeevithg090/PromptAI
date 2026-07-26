import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import { parseVars } from '../utils/templateVars';
import type { PromptNode, TaskType, RubricScores } from '../types/Prompt';

/**
 * Prompt versioning & history — spec §29.1, §31.4 Step 24 (T3.4).
 *
 * Every saved prompt edit creates an immutable version row in
 * `prompt_versions`. Users can list versions, restore an old one
 * (restores are NEW versions — history is never rewritten), and diff
 * two versions by node type.
 *
 * PRIVACY (§19.1): `nodes_json` is a [P]-classified interim exception
 * (approved pre-E2EE MVP). It stores node structure as plaintext JSON,
 * replaced by ciphertext in T7.1. Never UPDATE or DELETE a version row.
 */

export interface SavePromptInput {
  sessionId?: string;
  platformId: string;
  taskType: TaskType;
  nodes: PromptNode[];
  assembled: string;
  strengthScore?: number;
  rubricScores?: RubricScores;
  /** E2EE ciphertext for prompt_versions (§19.2, T7.1). When present, nodes_json is skipped. */
  contentCiphertext?: string;
}

export interface SaveVersionInput {
  nodes: PromptNode[];
  strengthScore?: number;
  rubricScores?: RubricScores;
  /** E2EE ciphertext for prompt_versions (§19.2, T7.1). When present, nodes_json is skipped. */
  contentCiphertext?: string;
}

export interface VersionMeta {
  id: string;
  version: number;
  strength_score: number | null;
  created_at: string;
}

export interface VersionDetail extends VersionMeta {
  nodes_json: PromptNode[];
  rubric_scores: RubricScores | null;
}

export interface DiffResult {
  added: PromptNode['type'][];
  removed: PromptNode['type'][];
  changed: { type: PromptNode['type']; before: string; after: string }[];
}

/**
 * Save a new prompt (version 1) + its first prompt_versions row.
 * Returns the prompt id.
 */
export async function savePrompt(userId: string, input: SavePromptInput): Promise<string> {
  const pool = getPool();
  const promptId = crypto.randomUUID();
  const rubricJson = input.rubricScores ? JSON.stringify(input.rubricScores) : null;

  // F2.4: derive template variables from the assembled text (server-side —
  // never trust a client-sent list).
  const variables = parseVars(input.assembled ?? '');

  await pool.query(
    `insert into prompts (id, user_id, session_id, platform_id, version, content_ciphertext, strength_score, rubric_scores, variables)
     values ($1, $2, $3, $4, 1, $5, $6, $7, $8)`,
    [
      promptId,
      userId,
      input.sessionId ?? null,
      input.platformId,
      input.assembled, // content_ciphertext holds assembled string pre-E2EE
      input.strengthScore ?? null,
      rubricJson,
      JSON.stringify(variables),
    ]
  );

  if (input.contentCiphertext) {
    await pool.query(
      `insert into prompt_versions (prompt_id, version, content_ciphertext, strength_score, rubric_scores)
       values ($1, 1, $2, $3, $4)`,
      [promptId, input.contentCiphertext, input.strengthScore ?? null, rubricJson]
    );
  } else {
    await pool.query(
      `insert into prompt_versions (prompt_id, version, nodes_json, strength_score, rubric_scores)
       values ($1, 1, $2, $3, $4)`,
      [
        promptId,
        JSON.stringify(input.nodes),
        input.strengthScore ?? null,
        rubricJson,
      ]
    );
  }

  logger.info({ type: 'prompt:saved', userId, promptId, version: 1 });
  return promptId;
}

/**
 * Save a new version of an existing prompt. The version number is
 * max(version)+1. INSERT only — never UPDATE an old version.
 * Updates the prompts head row's version pointer.
 */
export async function saveVersion(userId: string, promptId: string, input: SaveVersionInput): Promise<number> {
  const pool = getPool();

  // Ownership check + get next version number.
  const head = await pool.query(
    `select id from prompts where id = $1 and user_id = $2`,
    [promptId, userId]
  );
  if (head.rows.length === 0) {
    throw new PromptNotFound();
  }

  const maxVer = await pool.query(
    `select coalesce(max(version), 0) as max_v from prompt_versions where prompt_id = $1`,
    [promptId]
  );
  const nextVersion = Number(maxVer.rows[0]?.max_v ?? 0) + 1;
  const rubricJson = input.rubricScores ? JSON.stringify(input.rubricScores) : null;

  if (input.contentCiphertext) {
    await pool.query(
      `insert into prompt_versions (prompt_id, version, content_ciphertext, strength_score, rubric_scores)
       values ($1, $2, $3, $4, $5)`,
      [promptId, nextVersion, input.contentCiphertext, input.strengthScore ?? null, rubricJson]
    );
  } else {
    await pool.query(
      `insert into prompt_versions (prompt_id, version, nodes_json, strength_score, rubric_scores)
       values ($1, $2, $3, $4, $5)`,
      [promptId, nextVersion, JSON.stringify(input.nodes), input.strengthScore ?? null, rubricJson]
    );
  }

  // Update the head row's version pointer.
  await pool.query(
    `update prompts set version = $2 where id = $1`,
    [promptId, nextVersion]
  );

  logger.info({ type: 'prompt:version_saved', userId, promptId, version: nextVersion });
  return nextVersion;
}

/**
 * List all versions of a prompt (metadata only). Ownership-checked.
 */
export async function listVersions(userId: string, promptId: string): Promise<VersionMeta[]> {
  const pool = getPool();
  const res = await pool.query(
    `select pv.id, pv.version, pv.strength_score, pv.created_at
     from prompt_versions pv
     join prompts p on p.id = pv.prompt_id
     where pv.prompt_id = $1 and p.user_id = $2
     order by pv.version`,
    [promptId, userId]
  );
  return res.rows as VersionMeta[];
}

/**
 * Get a specific version's full content. Ownership-checked.
 */
export async function getVersion(userId: string, promptId: string, version: number): Promise<VersionDetail | null> {
  const pool = getPool();
  const res = await pool.query(
    `select pv.id, pv.version, pv.strength_score, pv.rubric_scores, pv.created_at, pv.nodes_json
     from prompt_versions pv
     join prompts p on p.id = pv.prompt_id
     where pv.prompt_id = $1 and pv.version = $2 and p.user_id = $3`,
    [promptId, version, userId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    version: row.version,
    strength_score: row.strength_score,
    rubric_scores: row.rubric_scores,
    created_at: row.created_at,
    nodes_json: typeof row.nodes_json === 'string' ? JSON.parse(row.nodes_json) : row.nodes_json,
  } as VersionDetail;
}

/**
 * Restore an old version by saving its nodes as a NEW version.
 * History is never rewritten — restores are new versions.
 */
export async function restoreVersion(userId: string, promptId: string, version: number): Promise<number> {
  const old = await getVersion(userId, promptId, version);
  if (!old) {
    throw new PromptNotFound();
  }
  return saveVersion(userId, promptId, {
    nodes: old.nodes_json,
    strengthScore: old.strength_score ?? undefined,
    rubricScores: old.rubric_scores ?? undefined,
  });
}

/**
 * Diff two node arrays by type. Pure function.
 */
export function diffVersions(a: PromptNode[], b: PromptNode[]): DiffResult {
  const mapA = new Map(a.map((n) => [n.type, n.value]));
  const mapB = new Map(b.map((n) => [n.type, n.value]));

  const added: PromptNode['type'][] = [];
  const removed: PromptNode['type'][] = [];
  const changed: { type: PromptNode['type']; before: string; after: string }[] = [];

  for (const [type] of Array.from(mapB)) {
    if (!mapA.has(type)) added.push(type);
  }
  for (const [type, valueA] of Array.from(mapA)) {
    if (!mapB.has(type)) removed.push(type);
    else if (mapB.get(type) !== valueA) {
      changed.push({ type, before: valueA, after: mapB.get(type)! });
    }
  }

  return { added, removed, changed };
}

/**
 * List the caller's prompts (metadata only). Ownership-checked.
 */
export async function listPrompts(userId: string): Promise<Array<{ id: string; platform_id: string; version: number; strength_score: number | null; created_at: string }>> {
  const pool = getPool();
  const res = await pool.query(
    `select id, platform_id, version, strength_score, created_at
     from prompts where user_id = $1 order by created_at desc`,
    [userId]
  );
  return res.rows as Array<{ id: string; platform_id: string; version: number; strength_score: number | null; created_at: string }>;
}

/** Thrown when a prompt doesn't exist or doesn't belong to the caller. */
export class PromptNotFound extends Error {
  constructor() {
    super('prompt not found');
  }
}
