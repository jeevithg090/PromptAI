import { describe, it, expect, beforeEach } from 'vitest';
import { insertText } from './insertText';

function setBodyHTML(html: string) {
  document.body.innerHTML = html;
}

describe('insertText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns tos_gate error when tos_reviewed is false', () => {
    setBodyHTML('<textarea id="t"></textarea>');
    const result = insertText('hello', ['#t'], false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('tos_gate');
  });

  it('inserts into textarea when selector matches', () => {
    setBodyHTML('<textarea id="t"></textarea>');
    const el = document.querySelector<HTMLTextAreaElement>('#t')!;
    const result = insertText('world', ['#t'], true);
    expect(result.ok).toBe(true);
    expect(el.value).toBe('world');
  });

  it('inserts at cursor position in textarea', () => {
    setBodyHTML('<textarea id="t">abc</textarea>');
    const el = document.querySelector<HTMLTextAreaElement>('#t')!;
    el.selectionStart = 1;
    el.selectionEnd = 1;
    const result = insertText('X', ['#t'], true);
    expect(result.ok).toBe(true);
    expect(el.value).toBe('aXbc');
  });

  it('returns no_matching_input when selector does not match', () => {
    setBodyHTML('<div></div>');
    const result = insertText('hello', ['.nonexistent'], true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no_matching_input');
  });

  it('inserts into contenteditable element', () => {
    setBodyHTML('<div id="ce" contenteditable="true"></div>');
    const el = document.querySelector<HTMLElement>('#ce')!;
    el.focus();
    const result = insertText('editable content', ['#ce'], true);
    expect(result.ok).toBe(true);
    expect(el.textContent).toBe('editable content');
  });

  it('skips hidden elements', () => {
    setBodyHTML('<textarea id="t" style="display:none"></textarea>');
    const result = insertText('hello', ['#t'], true);
    // Falls through to activeElement (none active in jsdom)
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no_matching_input');
  });

  it('skips disabled elements', () => {
    setBodyHTML('<textarea id="t" disabled></textarea>');
    const result = insertText('hello', ['#t'], true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no_matching_input');
  });
});
