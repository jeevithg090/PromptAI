/**
 * Live smoke suite (finalplan §6.2). Hits a RUNNING backend over HTTP and prints
 * a pass/fail table — the "I really want to test something" end-to-end check.
 * Exercises the full two-way product surface against real providers (Gemini for
 * drafting/critic/refine, Groq for the small steps, live doc grounding).
 *
 * Usage: start the backend (npm run dev), then: npm run smoke
 * Override the target with SMOKE_BASE_URL (default http://localhost:3001).
 * Requires DEV_AUTH_BYPASS=true on the backend (so no token is needed).
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001';

interface Result { name: string; pass: boolean; detail: string; ms: number }
const results: Result[] = [];

async function step(name: string, fn: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail, ms: Date.now() - started });
    console.log(`  ✓ ${name} (${Date.now() - started}ms) — ${detail}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, pass: false, detail, ms: Date.now() - started });
    console.log(`  ✗ ${name} (${Date.now() - started}ms) — ${detail}`);
  }
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function run(): Promise<void> {
  console.log(`\nPromptForge smoke suite → ${BASE}\n`);

  await step('GET /health', async () => {
    const { status, json } = await api('GET', '/health');
    assert(status === 200 && json.ok, `health not ok (${status})`);
    return 'ok';
  });

  await step('GET /platforms lists the ten target sites', async () => {
    const { json } = await api('GET', '/platforms');
    const ids = (json.platforms ?? []).map((p: any) => p.platform_id);
    const need = ['openai_chatgpt', 'anthropic_claude', 'google_gemini', 'perplexity', 'midjourney', 'stability_stable_diffusion', 'mistral_le_chat', 'huggingface_chat', 'xai_grok', 'deepseek_chat'];
    const missing = need.filter((n) => !ids.includes(n));
    assert(missing.length === 0, `missing platforms: ${missing.join(', ')}`);
    return `${ids.length} platforms`;
  });

  await step('GET /features', async () => {
    const { status, json } = await api('GET', '/features');
    assert(status === 200 && typeof json.demo === 'boolean', 'features malformed');
    return `stt=${json.stt} demo=${json.demo}`;
  });

  let refineNodes: any[] = [];
  let refineTaskType = 'long_form_writing';
  await step('POST /draft (just_generate) → quality bar', async () => {
    const { status, json } = await api('POST', '/draft', {
      platform_id: 'openai_chatgpt',
      idea: 'write a cold outreach email to a VP of engineering about our CI observability tool',
      just_generate: true,
    });
    assert(status === 200 && json.status === 'ok', `draft not ok (${status}/${json.status})`);
    const r = json.response;
    // Capture nodes first so a downstream quality assertion can't starve the refine steps.
    refineNodes = r.nodes.map((n: any) => ({ type: n.type, value: n.value }));
    refineTaskType = r.taskType;
    const a: string = r.assembled ?? '';
    assert(a.length > 40, 'assembled too short');
    // Fragment-fusion signature: a sentence period immediately comma-joined to a
    // new capitalized fragment (the old bug), e.g. "…24 hours., The product…".
    // (Legitimate "e.g.," is lowercase after and won't match.) The deterministic
    // guarantee lives in the PromptSerializer unit test; this is a live sanity check.
    assert(!/\.,\s+[A-Z]/.test(a), 'assembled has fragment-fusion artifact');
    assert(/^[A-Z]/.test(a), 'assembled does not start with a capital');
    assert(r.strength && typeof r.strength.score === 'number', 'no strength score');
    return `strength ${r.strength.score} (${r.strength.band}), ${r.nodes.length} nodes`;
  });

  await step('POST /draft clarify round-trip', async () => {
    const first = await api('POST', '/draft', { platform_id: 'anthropic_claude', idea: 'a blog post about remote work' });
    assert(first.json.status === 'clarifying', `expected clarifying, got ${first.json.status}`);
    const sid = first.json.session_id;
    const second = await api('POST', `/draft/${sid}/clarify`, {
      platform_id: 'anthropic_claude',
      idea: 'a blog post about remote work',
      clarifications: { audience: 'engineering managers', tone: 'practical' },
      just_generate: true,
    });
    assert(second.json.status === 'ok', `clarify resume not ok (${second.json.status})`);
    return `resumed session ${sid.slice(0, 8)}`;
  });

  await step('POST /enhance improves a weak prompt', async () => {
    const { json } = await api('POST', '/enhance', { text: 'make me a logo' });
    assert(json.status === 'ok' && json.enhanced, `enhance not ok (${json.status})`);
    return json.improvement ? `${json.improvement.before} → ${json.improvement.after}` : 'enhanced';
  });

  await step('POST /chat-refine changes the draft', async () => {
    assert(refineNodes.length > 0, 'no nodes from the draft step to refine');
    const { json } = await api('POST', '/chat-refine', {
      platform_id: 'openai_chatgpt',
      task_type: refineTaskType,
      nodes: refineNodes,
      messages: [{ role: 'user', content: 'make it more formal and add a 120-word limit' }],
    });
    assert(json.type === 'prompt' && json.assembled, `refine did not return a prompt (${json.type})`);
    return json.message ?? 'refined';
  });

  await step('POST /redraft-node regenerates one node', async () => {
    assert(refineNodes.length > 0, 'no nodes to redraft');
    const target = refineNodes[0].type;
    const { json } = await api('POST', '/redraft-node', {
      platform_id: 'openai_chatgpt',
      task_type: refineTaskType,
      nodes: refineNodes,
      target_node_type: target,
    });
    assert(typeof json.value === 'string' && json.value.length > 0, 'redraft returned no value');
    return `redrew ${target}`;
  });

  await step('POST /feedback records an outcome', async () => {
    const { json } = await api('POST', '/feedback', { task_type: refineTaskType, platform_id: 'openai_chatgpt', outcome: 'worked' });
    assert(json.status === 'ok', 'feedback not ok');
    return 'ok';
  });

  console.log('\n──────── summary ────────');
  const passed = results.filter((r) => r.pass).length;
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`\n${passed}/${results.length} passed\n`);
  if (passed !== results.length) process.exitCode = 1;
}

run().catch((err) => {
  console.error('smoke suite crashed:', err);
  process.exitCode = 1;
});
