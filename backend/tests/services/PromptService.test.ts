import {
  savePrompt,
  saveVersion,
  listVersions,
  getVersion,
  restoreVersion,
  diffVersions,
  listPrompts,
} from '../../src/services/PromptService';
import { setPoolForTesting } from '../../src/utils/db';
import type { Pool } from 'pg';
import type { PromptNode } from '../../src/types/Prompt';

/**
 * PromptService tests — spec §29.1, T3.4.
 * Version chain, restore, diff, cross-user 404. Fake pool throughout.
 */
describe('PromptService (§29.1, T3.4)', () => {
  afterEach(() => setPoolForTesting(null));

  function node(type: PromptNode['type'], value: string): PromptNode {
    return { type, value, alternatives: [], locked: false, position: 0, defaulted: false };
  }

  /**
   * Fake pool that simulates a prompt_versions + prompts store in-memory.
   * Tracks versions per prompt_id and ownership via user_id.
   */
  function fakePoolWithStore() {
    const prompts = new Map<string, { user_id: string; platform_id: string; version: number }>();
    const versions = new Map<string, Array<{ id: string; version: number; nodes_json: PromptNode[]; strength_score: number | null; rubric_scores: unknown; created_at: string }>>();

    const query = jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      // INSERT into prompts
      if (sql.startsWith('insert into prompts')) {
        const [id, userId, , platformId] = params;
        prompts.set(id as string, { user_id: userId as string, platform_id: platformId as string, version: 1 });
        return { rows: [] };
      }
      // INSERT into prompt_versions
      if (sql.startsWith('insert into prompt_versions')) {
        const promptId = params[0] as string;
        // savePrompt uses `values ($1, 1, $2, ...)` — version literal 1.
        // saveVersion uses `values ($1, $2, $3, ...)` — version is params[1].
        const version = sql.includes(', 1,') ? 1 : (params[1] as number);
        const nodesJson = sql.includes(', 1,') ? params[1] : params[2];
        const list = versions.get(promptId) ?? [];
        list.push({
          id: crypto.randomUUID(),
          version,
          nodes_json: typeof nodesJson === 'string' ? JSON.parse(nodesJson) : (nodesJson as PromptNode[]),
          strength_score: null,
          rubric_scores: null,
          created_at: new Date().toISOString(),
        });
        versions.set(promptId, list);
        return { rows: [] };
      }
      // UPDATE prompts version pointer
      if (sql.startsWith('update prompts set version')) {
        const [promptId, version] = params;
        const p = prompts.get(promptId as string);
        if (p) p.version = version as number;
        return { rows: [] };
      }
      // SELECT from prompts (ownership check)
      if (sql.includes('select id from prompts where')) {
        const [promptId, userId] = params;
        const p = prompts.get(promptId as string);
        return { rows: p && p.user_id === userId ? [p] : [] };
      }
      // SELECT max(version)
      if (sql.includes('coalesce(max(version)')) {
        const [promptId] = params;
        const list = versions.get(promptId as string) ?? [];
        const maxV = list.reduce((m, v) => Math.max(m, v.version), 0);
        return { rows: [{ max_v: maxV }] };
      }
      // SELECT from prompt_versions (list versions)
      if (sql.includes('from prompt_versions pv') && sql.includes('order by pv.version') && !sql.includes('pv.version = $2')) {
        const [promptId, userId] = params;
        const p = prompts.get(promptId as string);
        if (!p || p.user_id !== userId) return { rows: [] };
        const list = versions.get(promptId as string) ?? [];
        return { rows: list.map((v) => ({ id: v.id, version: v.version, strength_score: v.strength_score, created_at: v.created_at })) };
      }
      // SELECT from prompt_versions (get specific version)
      if (sql.includes('pv.version = $2')) {
        const [promptId, version, userId] = params;
        const p = prompts.get(promptId as string);
        if (!p || p.user_id !== userId) return { rows: [] };
        const list = versions.get(promptId as string) ?? [];
        const v = list.find((x) => x.version === version);
        return { rows: v ? [v] : [] };
      }
      // SELECT from prompts (list own)
      if (sql.includes('from prompts where user_id')) {
        const [userId] = params;
        const own = Array.from(prompts.entries())
          .filter(([, p]) => p.user_id === userId)
          .map(([id, p]) => ({ id, platform_id: p.platform_id, version: p.version, strength_score: null, created_at: new Date().toISOString() }));
        return { rows: own };
      }
      return { rows: [] };
    });
    setPoolForTesting({ query } as unknown as Pool);
    return { query, prompts, versions };
  }

  it('creates a version chain: save → edit → edit → list shows 1,2,3', async () => {
    const store = fakePoolWithStore();
    const promptId = await savePrompt('u1', {
      platformId: 'google_gemini',
      taskType: 'text_to_image',
      nodes: [node('subject', 'a horse')],
      assembled: 'a horse',
    });

    await saveVersion('u1', promptId, { nodes: [node('subject', 'a galloping horse')] });
    await saveVersion('u1', promptId, { nodes: [node('subject', 'a horse at sunset')] });

    const versions = await listVersions('u1', promptId);
    expect(versions).toHaveLength(3);
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it('restore v1 → creates v4 with v1\'s nodes', async () => {
    const store = fakePoolWithStore();
    const promptId = await savePrompt('u1', {
      platformId: 'google_gemini',
      taskType: 'text_to_image',
      nodes: [node('subject', 'original')],
      assembled: 'original',
    });
    await saveVersion('u1', promptId, { nodes: [node('subject', 'edited')] });
    await saveVersion('u1', promptId, { nodes: [node('subject', 'edited again')] });

    // Restore v1 → should create v4 with v1's nodes.
    const newVersion = await restoreVersion('u1', promptId, 1);
    expect(newVersion).toBe(4);

    const v4 = await getVersion('u1', promptId, 4);
    expect(v4?.nodes_json[0]?.value).toBe('original');
  });

  it('diff detects added, removed, and changed nodes', () => {
    const a = [node('subject', 'a horse'), node('style_aesthetic', 'photorealistic')];
    const b = [node('subject', 'a galloping horse'), node('lighting_mood', 'golden hour')];

    const diff = diffVersions(a, b);
    expect(diff.added).toContain('lighting_mood');
    expect(diff.removed).toContain('style_aesthetic');
    expect(diff.changed).toContainEqual({ type: 'subject', before: 'a horse', after: 'a galloping horse' });
  });

  it('cross-user access returns null from getVersion (404 at route level)', async () => {
    fakePoolWithStore();
    const promptId = await savePrompt('u1', {
      platformId: 'google_gemini',
      taskType: 'text_to_image',
      nodes: [node('subject', 'my horse')],
      assembled: 'my horse',
    });

    // User u2 tries to access u1's prompt → null (not found).
    const v = await getVersion('u2', promptId, 1);
    expect(v).toBeNull();
  });

  it('cross-user listVersions returns empty array', async () => {
    fakePoolWithStore();
    const promptId = await savePrompt('u1', {
      platformId: 'google_gemini',
      taskType: 'text_to_image',
      nodes: [node('subject', 'my horse')],
      assembled: 'my horse',
    });

    const versions = await listVersions('u2', promptId);
    expect(versions).toEqual([]);
  });

  it('listPrompts returns only the caller\'s prompts', async () => {
    fakePoolWithStore();
    await savePrompt('u1', { platformId: 'google_gemini', taskType: 'text_to_image', nodes: [node('subject', 'a')], assembled: 'a' });
    await savePrompt('u2', { platformId: 'midjourney', taskType: 'text_to_image', nodes: [node('subject', 'b')], assembled: 'b' });

    const u1Prompts = await listPrompts('u1');
    expect(u1Prompts).toHaveLength(1);
    expect(u1Prompts[0]?.platform_id).toBe('google_gemini');
  });
});
