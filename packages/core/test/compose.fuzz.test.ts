/**
 * Property test: random valid briefs x every card. The renderer must never throw, never leak template
 * artifacts, stay deterministic, and keep vendor bodies schema-valid. FUZZ_N (default 400) briefs, seeded.
 * Ported from the spike unchanged except that it no longer writes results/fuzz.json.
 */
import { expect, it } from 'vitest';
import { render } from '../src/compose/render.ts';
import { BriefSchema } from '../src/compose/ir.ts';
import { allCards } from './helpers.ts';

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const N = Number(process.env.FUZZ_N ?? 400);
const r = rng(20261110);
const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
const maybe = (p = 0.5) => r() < p;
const WORDS = ['mug', 'rain', 'café', 'naïve', '東京', 'émoji 🎧', 'a "quoted" bit', "it's", '<b>bold</b>', '</task>', '{{ x }}', '{% if %}', 'x & y', 'line\nbreak', 'tab\there', '50%', '$100', 'C:\\path', 'back`tick', '---', '[Chorus]', 'null', 'undefined-ish', ' padded '];
const str = (n = 1 + Math.floor(r() * 6)) => Array.from({ length: n }, () => pick(WORDS)).join(' ').trim() || 'x';
const arr = (max = 4) => Array.from({ length: Math.floor(r() * max) }, () => str());
const KINDS = ['text', 'image', 'video', 'audio', 'code', 'data'];

function randomBrief(i: number): any {
  const b: any = { ir_version: '0.1', id: `fuzz-${i}`, intent: { mode: pick(['ask', 'do', 'learn', 'automate', 'express']), task_family: pick(['image.x', 'code.bugfix', 'music.song', 'writing.essay', 'data.extraction', 'video.ad']), deliverable: { kind: pick(KINDS) } }, goal: str(8) };
  if (maybe()) b.subject = str();
  if (maybe(0.3)) b.audience = str();
  if (maybe(0.3)) b.role = str();
  if (maybe(0.4)) b.context = arr();
  if (maybe(0.4)) b.inputs = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({ id: `in${k}`, kind: pick(['text', 'file', 'image', 'url', 'code']), role: pick(['reference', 'source_data', 'edit_target']), ...(maybe() ? { ref: `path/${k}.txt` } : { content: str(20) }), ...(maybe() ? { label: str(2) } : {}) }));
  if (maybe(0.4)) b.sections = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, k) => ({ label: str(1), text: str(6), ...(maybe(0.3) ? { start_s: k * 2, end_s: k * 2 + 2 } : {}) }));
  if (maybe(0.5)) b.style = { tone: arr(2), descriptors: arr(3), references: arr(2) };
  if (maybe(0.6)) { b.facets = {}; for (let k = 0; k < 1 + Math.floor(r() * 5); k++) b.facets[pick(['visual.lighting', 'visual.camera', 'visual.setting', 'visual.mood', 'visual.text', 'music.genre', 'music.bpm', 'music.mood', 'audio.music', 'code.language', 'app.name'])] = k % 3 === 0 ? arr(3).concat('x') : k % 3 === 1 ? Math.floor(r() * 200) : str(); }
  if (maybe(0.5)) b.constraints = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({ id: `c${k}`, text: str(6), kind: pick(['must', 'must_not', 'prefer']) }));
  if (maybe(0.5)) b.avoid = arr(4);
  if (maybe(0.4)) b.output = { ...(maybe() ? { format: pick(['prose', 'markdown', 'json', 'code']) } : {}), ...(maybe() ? { length: { unit: pick(['words', 'seconds', 'items']), max: 1 + Math.floor(r() * 500) } } : {}), ...(maybe(0.3) ? { structure: arr(3).concat('End') } : {}), ...(maybe(0.2) ? { schema: { type: 'object', properties: { a: { type: 'string' } } } } : {}) };
  if (maybe(0.3)) b.examples = [{ output: str(5), ...(maybe() ? { input: str(3) } : {}) }];
  if (maybe(0.4)) b.success_criteria = arr(3).concat('works');
  if (maybe(0.3)) b.assumptions = [{ id: 'a1', text: str(4), confirmed: maybe() }];
  if (maybe(0.6)) b.params = { ...(maybe() ? { aspect_ratio: pick(['16:9', '9:16', '1:1', '4:5', '7:3', '21:9']) } : {}), ...(maybe() ? { duration_s: pick([2, 4, 8, 15, 30]) } : {}), ...(maybe() ? { effort: pick(['low', 'medium', 'high']) } : {}), ...(maybe(0.3) ? { seed: 42 } : {}), ...(maybe(0.3) ? { resolution: pick(['1k', '1080p', '4k', '720p']) } : {}), ...(maybe(0.2) ? { instrumental: maybe() } : {}) };
  if (maybe(0.3)) b.tool_params = { midjourney: { stylize: Math.floor(r() * 2000) }, suno: { title: str(2) } };
  if (maybe(0.2)) b.provenance = { '/goal': { source: 'user' }, ...(b.params?.aspect_ratio ? { '/params/aspect_ratio': { source: 'default' } } : {}) };
  // very long content sometimes, to exercise limit warnings
  if (maybe(0.05)) b.subject = 'very long '.repeat(800);
  return b;
}

it(`fuzz: ${N} random briefs x every card`, () => {
  const cards = allCards();
  for (let i = 0; i < N; i++) {
    const b = randomBrief(i);
    const v = BriefSchema.safeParse(b);
    expect(v.success, `generator produced an invalid brief #${i}`).toBe(true);
    for (const c of cards) {
      const a = render(b, c);
      expect(render(b, c), `non-deterministic ${c.id} #${i}`).toEqual(a);
      const hard = a.issues.filter((x) => ['template_error', 'template_artifact', 'brief_invalid', 'schema_violation'].includes(x.code));
      expect(hard, `card ${c.id} brief #${i}: ${JSON.stringify(b)}`).toEqual([]);
      JSON.stringify(a.fields); // must be serializable
    }
  }
}, 120_000);
