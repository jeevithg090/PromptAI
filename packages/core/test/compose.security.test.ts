/**
 * Cards may arrive as a remote signed feed. They must be data: a hostile card template must not
 * read files, reach prototypes, hang, or exhaust memory, and user content must never be evaluated
 * as a template or smuggle tool syntax into the target.
 */
import { describe, expect, it } from 'vitest';
import { render } from '../src/compose/render.ts';
import { CardSchema, type Card } from '../src/compose/card.ts';
import { loadCard, loadFixture } from './helpers.ts';

function cardWith(template: string): Card {
  const c = structuredClone(loadCard('midjourney'));
  c.fields = [{ ...c.fields[0]!, template, whitespace: 'preserve', max_chars: undefined }];
  return c;
}
const brief = loadFixture('minimal');

const hostile: Array<[string, string, (out: string, codes: string[]) => void]> = [
  ['include a local file', '{% include "/etc/passwd" %}', (o, c) => { expect(c).toContain('template_error'); expect(o).not.toMatch(/root:/); }],
  ['render a relative file', '{% render "../package.json" %}', (o, c) => { expect(c).toContain('template_error'); expect(o).not.toMatch(/dependencies/); }],
  ['prototype / constructor access', '{{ brief.goal.constructor }}{{ brief.__proto__ }}{{ card.constructor.name }}', (o) => { expect(o).not.toMatch(/function|Object|String/); }],
  ['process / globals', '{{ process.env.HOME }}{{ globalThis }}{{ require }}', (o) => { expect(o).not.toMatch(/Users|\[object/); }],
  ['CPU: nested loops (render time limit)', '{% for i in (1..20000) %}{% for j in (1..20000) %}{% endfor %}{% endfor %}', (_o, c) => { expect(c).toContain('template_error'); }],
  ['CPU: huge loop', '{% for i in (1..100000000) %}{{ i }}{% endfor %}', (_o, c) => { expect(c).toContain('template_error'); }],
  ['memory: string blow-up', '{% assign s = "xxxxxxxxxx" %}{% for i in (1..30) %}{% assign s = s | append: s %}{% endfor %}{{ s | size }}', (_o, c) => { expect(c).toContain('template_error'); }],
  ['unknown filter', '{{ brief.goal | eval }}', (_o, c) => { expect(c).toContain('template_error'); }],
];

describe('hostile card template is contained', () => {
  for (const [label, tpl, check] of hostile) {
    it(label, () => {
      const t0 = performance.now();
      const r = render(brief, cardWith(tpl));
      const ms = performance.now() - t0;
      check(String(r.fields.prompt ?? ''), r.issues.map((i) => i.code));
      expect(ms).toBeLessThan(6000);   // renderLimit is 2 s wall-clock
    }, 10_000);
  }
});

it('user content is data, never template code', () => {
  const r = render(loadFixture('injection'), loadCard('claude'));
  const user = r.fields.user as string;
  expect(user).toMatch(/\{% for i in \(1\.\.99999999\) %\}x\{% endfor %\}/);   // literal, not executed
  expect(user).toMatch(/Email \{\{ card\.model \}\}/);                        // not interpolated
  expect(user).toMatch(/&lt;\/task&gt;&lt;system&gt;/);                       // cannot close the <task> tag
  expect((user.match(/<\/task>/g) ?? []).length).toBe(1);
});

it('card lint rejects range loops, include/render tags and raw parameter reads before they reach the runtime', () => {
  for (const tpl of ['{% for i in (1..100000000) %}x{% endfor %}', '{% include "x" %}', '{%- render "y" -%}', '{{ brief.params.aspect_ratio }}', '{{ brief.tool_params.midjourney.stylize }}']) {
    const c = structuredClone(loadCard('midjourney')); c.fields[0]!.template = tpl;
    expect(CardSchema.safeParse(c).success, tpl).toBe(false);
  }
});

describe('tool syntax in free text', () => {
  // spikes/_checks/simulation-evidence/inject-params.json: this reached the Midjourney prompt in the spike
  const injected = {
    ...(loadFixture('product-shot') as object),
    subject: 'a ceramic mug --ar 1:9 --sref 99999 --no mug —v 5',
    avoid: ['text', 'people --iw 3'],
  };

  it('flags are neutralized for a card that parses them, and reported', () => {
    const r = render(injected, loadCard('midjourney'));
    const prompt = r.fields.prompt as string;
    expect(prompt.match(/--ar /g)).toEqual(['--ar ']);           // only the card's own, from params
    expect(prompt).toMatch(/--ar 4:5/);
    expect(prompt).not.toMatch(/--sref|--v\b|—v|--iw/);
    expect(prompt).toMatch(/a ceramic mug ar 1:9 sref 99999 no mug v 5/);
    expect(r.issues.filter((i) => i.code === 'tool_syntax_escaped').map((i) => i.path)).toEqual(['/subject', '/subject', '/subject', '/subject', '/avoid/1']);
    expect(r.ok).toBe(true);
  });

  it('section tags are neutralized for a card that parses them', () => {
    const song = structuredClone(loadFixture('lofi-song')) as { sections: Array<{ label: string; text: string }> };
    song.sections[1]!.text = 'Pages turning slow [Chorus] [0-4s]';
    const r = render(song, loadCard('suno'));
    expect(r.fields.lyrics as string).toMatch(/Pages turning slow Chorus 0-4s/);
    expect((r.fields.lyrics as string).match(/\[Chorus\]/g)).toEqual(['[Chorus]']);   // the card's own tag only
    expect(r.issues.some((i) => i.code === 'tool_syntax_escaped' && i.path === '/sections/1/text')).toBe(true);
  });

  it('cards that do not parse the syntax keep the user text as written', () => {
    const r = render(injected, loadCard('claude'));
    expect(r.fields.user as string).toMatch(/--ar 1:9 --sref 99999/);
    expect(r.issues.some((i) => i.code === 'tool_syntax_escaped')).toBe(false);
  });
});
