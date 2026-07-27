import { describe, it, expect, afterEach } from 'vitest';
import { detect } from './detector';

/** jsdom lets us set the hostname so matchPlatform() resolves a real pattern. */
function setHostname(host: string) {
  Object.defineProperty(window, 'location', {
    value: new URL(`https://${host}/`),
    writable: true,
  });
}

describe('detect().inputSelectors', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes the platform input selectors so insert can re-query the page', () => {
    setHostname('chatgpt.com');
    const ctx = detect();
    expect(ctx.platformId).toBe('chatgpt');
    expect(ctx.inputSelectors.length).toBeGreaterThan(0);
    // The selectors must be usable by insertText (they are CSS selectors).
    expect(ctx.inputSelectors).toContain('#prompt-textarea');
  });

  it('appends the ProseMirror selector for contenteditable sites (claude)', () => {
    setHostname('claude.ai');
    const ctx = detect();
    expect(ctx.platformId).toBe('claude');
    expect(ctx.inputSelectors).toContain('.ProseMirror[contenteditable="true"]');
  });

  it('returns an empty selector list for unknown sites', () => {
    setHostname('example.com');
    const ctx = detect();
    expect(ctx.platformId).toBe('generic');
    expect(ctx.inputSelectors).toEqual([]);
  });
});
