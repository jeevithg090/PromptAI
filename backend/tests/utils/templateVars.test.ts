import { parseVars, fillVars, missingVars } from '../../src/utils/templateVars';

/** F2.4 — template variable parse/fill/validate. */
describe('templateVars (F2.4)', () => {
  it('parses distinct variables in first-seen order', () => {
    const vars = parseVars('A {{topic}} about {{style}} for {{topic}}');
    expect(vars.map((v) => v.name)).toEqual(['topic', 'style']);
  });

  it('parses defaults after a pipe', () => {
    const vars = parseVars('{{tone|friendly}} and {{plain}}');
    expect(vars).toEqual([{ name: 'tone', default: 'friendly' }, { name: 'plain' }]);
  });

  it('ignores malformed / invalid-name slots', () => {
    expect(parseVars('{{ has spaces }} {{ok_1}} {{}}').map((v) => v.name)).toEqual(['ok_1']);
  });

  it('fills provided values, falling back to defaults then empty', () => {
    const text = 'Write about {{topic}} in a {{tone|neutral}} tone {{extra}}';
    expect(fillVars(text, { topic: 'cats' })).toBe('Write about cats in a neutral tone ');
  });

  it('reports variables missing both a value and a default', () => {
    expect(missingVars('{{a}} {{b|x}} {{c}}', { a: 'set' })).toEqual(['c']);
  });
});
