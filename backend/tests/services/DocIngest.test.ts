import { extractText, chunkText, robotsAllow, fetchDoc } from '../../src/services/DocIngest';

describe('DocIngest (§6.1)', () => {
  describe('extractText', () => {
    it('strips HTML tags and keeps text', () => {
      const html = '<html><body><h1>Title</h1><p>Some content here.</p></body></html>';
      const text = extractText(html);
      expect(text).toContain('Title');
      expect(text).toContain('Some content here.');
      expect(text).not.toContain('<h1>');
    });

    it('drops script, style, nav blocks', () => {
      const html = '<nav>menu</nav><script>alert(1)</script><style>.c{}</style><p>real</p>';
      expect(extractText(html)).not.toContain('menu');
      expect(extractText(html)).not.toContain('alert');
      expect(extractText(html)).not.toContain('.c{}');
      expect(extractText(html)).toContain('real');
    });

    it('converts block tags to newlines', () => {
      const html = '<p>First</p><p>Second</p>';
      expect(extractText(html)).toMatch(/First\n\nSecond/);
    });

    it('decodes HTML entities', () => {
      const html = '<p>foo &amp; bar &lt;baz&gt;</p>';
      expect(extractText(html)).toBe('foo & bar <baz>');
    });
  });

  describe('chunkText', () => {
    it('splits text into 300-600 token chunks', () => {
      const text = Array.from({ length: 50 }, (_, i) => `Paragraph number ${i + 1}. ` + 'word '.repeat(80)).join('\n\n');
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((c) => {
        const tokens = Math.ceil(c.length / 4);
        expect(tokens).toBeLessThanOrEqual(600);
      });
    });

    it('drops chunks under 40 tokens', () => {
      const text = 'tiny\n\n\n\n'.repeat(5);
      const chunks = chunkText(text);
      expect(chunks).toEqual([]);
    });

    it('handles empty text', () => {
      expect(chunkText('')).toEqual([]);
    });
  });

  describe('robotsAllow', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('returns true when robots.txt is unreachable', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));
      const result = await robotsAllow('https://example.com', '/docs');
      expect(result).toBe(true);
    });

    it('returns false when path is disallowed for *', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => 'User-agent: *\nDisallow: /docs',
      } as Response);
      const result = await robotsAllow('https://example.com', '/docs/start');
      expect(result).toBe(false);
    });

    it('returns true when path is not disallowed', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => 'User-agent: *\nDisallow: /private',
      } as Response);
      const result = await robotsAllow('https://example.com', '/docs');
      expect(result).toBe(true);
    });
  });

  describe('fetchDoc', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('returns text on success', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '<p>hello</p>',
      } as Response);
      const result = await fetchDoc('https://example.com');
      expect(result).toBe('<p>hello</p>');
    });

    it('returns null on non-ok response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);
      const result = await fetchDoc('https://example.com/missing');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
      const result = await fetchDoc('https://example.com');
      expect(result).toBeNull();
    });
  });
});
