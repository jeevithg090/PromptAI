import { config } from '../config/env';
import { logger } from '../utils/logger';
import { extractJson } from '../utils/json';
import { callGeminiNative } from './providers/geminiNative';
import { fetchDoc, extractText } from './DocIngest';
import type { KnowledgeChunk } from '../types/Agent';
import type { Platform } from '../types/Platform';

/**
 * GroundingService (finalplan §A2) — the real replacement for the old
 * live-fetch stub that hardcoded a 0.5 similarity and returned "the first 3
 * chunks as-is". It turns a platform's OFFICIAL documentation into structured
 * knowledge chunks that our existing agents consume exactly like PKB chunks.
 *
 * Gemini is used in a strictly BOUNDED role here: a grounding FETCHER, never
 * the thing that writes the user's prompt. It extracts prompt-writing rules
 * (with quotes + source URLs) from the docs; the DraftingAgent/Critic remain the
 * only components that compose prompts, and they only ever see these chunks as
 * grounding — identical to the PKB path. Two fetch strategies:
 *
 *   1. url_context tool — Gemini retrieves the docs URL itself (verified working
 *      on the test key). Preferred: no HTML parsing on our side.
 *   2. Fallback — if the URL blocks bot retrieval (verified: docs.midjourney.com
 *      returns URL_RETRIEVAL_STATUS_ERROR), we fetch the HTML ourselves
 *      (SSRF-guarded DocIngest.fetchDoc), strip it to text, and hand that text to
 *      Gemini inline for the same structured extraction.
 *
 * Never throws into the pipeline: any failure returns [] so drafting proceeds
 * ungrounded rather than not at all (§29.7).
 */

interface ExtractedRule {
  rule: string;
  quote?: string;
  source_url?: string;
}

const MAX_CHUNKS = 5;
const MAX_INLINE_DOC_CHARS = 12_000;

const EXTRACTION_INSTRUCTION = (platformName: string, query: string) =>
  `You are a documentation analyst. From the ${platformName} documentation provided, extract the concrete prompt-writing rules, syntax, parameters, and constraints that are most relevant to this task: "${query}".
Return ONLY a JSON array (no prose, no markdown fences) of at most ${MAX_CHUNKS} items, each:
{"rule": "<one specific, actionable rule in your own words>", "quote": "<short verbatim snippet from the docs supporting it, <=200 chars>", "source_url": "<the doc URL it came from>"}
Only include rules actually stated in the docs. If the docs are unavailable or irrelevant, return [].`;

export class GroundingService {
  /**
   * Ground a platform's prompt-writing knowledge from its docs.
   * @returns knowledge chunks (kind 'pkb') with real source URLs and trust scores, or [] on any failure.
   */
  async ground(
    platform: Pick<Platform, 'platform_id' | 'display_name' | 'docs_url'>,
    query: string,
  ): Promise<KnowledgeChunk[]> {
    if (!config.GEMINI_API_KEY) return [];
    const docsUrl = platform.docs_url;
    if (!docsUrl) return [];

    const started = Date.now();
    try {
      // Strategy 1: url_context — let Gemini fetch the docs URL itself.
      const viaUrlContext = await this.tryUrlContext(platform.display_name, docsUrl, query);
      if (viaUrlContext.length) {
        this.logDone(platform.platform_id, 'url_context', viaUrlContext.length, started);
        return this.toChunks(viaUrlContext, platform.platform_id, docsUrl, 0.9);
      }

      // Strategy 2: fetch the HTML ourselves and extract inline.
      const viaFetch = await this.tryFetchFallback(platform.display_name, docsUrl, query);
      if (viaFetch.length) {
        this.logDone(platform.platform_id, 'fetch_fallback', viaFetch.length, started);
        return this.toChunks(viaFetch, platform.platform_id, docsUrl, 0.75);
      }

      this.logDone(platform.platform_id, 'none', 0, started);
      return [];
    } catch (error) {
      logger.warn({
        type: 'grounding:failed',
        platformId: platform.platform_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /** Strategy 1 — Gemini retrieves the URL via the url_context tool. */
  private async tryUrlContext(platformName: string, docsUrl: string, query: string): Promise<ExtractedRule[]> {
    const res = await callGeminiNative({
      model: 'gemini-flash-latest',
      systemInstruction: EXTRACTION_INSTRUCTION(platformName, query),
      contents: [{ role: 'user', parts: [{ text: `Documentation URL: ${docsUrl}` }] }],
      tools: [{ url_context: {} }],
      thinkingBudget: 0,
      maxOutputTokens: 2048,
    });

    // If Gemini could not retrieve the URL, treat as empty so the caller falls back.
    if (this.urlRetrievalFailed(res.urlContextMetadata, docsUrl)) return [];
    return this.parseRules(res.text);
  }

  /** Strategy 2 — we fetch the HTML (SSRF-guarded), strip to text, extract inline. */
  private async tryFetchFallback(platformName: string, docsUrl: string, query: string): Promise<ExtractedRule[]> {
    const html = await fetchDoc(docsUrl, 8_000);
    if (!html) return [];
    const text = extractText(html).slice(0, MAX_INLINE_DOC_CHARS);
    if (!text.trim()) return [];

    const res = await callGeminiNative({
      model: 'gemini-flash-latest',
      systemInstruction: EXTRACTION_INSTRUCTION(platformName, query),
      contents: [{ role: 'user', parts: [{ text: `Documentation from ${docsUrl}:\n\n${text}` }] }],
      thinkingBudget: 0,
      maxOutputTokens: 2048,
    });
    return this.parseRules(res.text).map((r) => ({ ...r, source_url: r.source_url ?? docsUrl }));
  }

  /** True when Gemini's urlContextMetadata reports a non-success retrieval for our URL. */
  private urlRetrievalFailed(meta: unknown, docsUrl: string): boolean {
    const m = meta as { urlMetadata?: Array<{ retrievedUrl?: string; urlRetrievalStatus?: string }> } | undefined;
    const entries = m?.urlMetadata;
    if (!entries || entries.length === 0) return false; // no metadata → trust the text
    // If every retrieval that mentions our URL failed, fall back.
    const relevant = entries.filter((e) => !e.retrievedUrl || e.retrievedUrl.includes(new URL(docsUrl).hostname));
    if (relevant.length === 0) return false;
    return relevant.every((e) => e.urlRetrievalStatus && e.urlRetrievalStatus !== 'URL_RETRIEVAL_STATUS_SUCCESS');
  }

  private parseRules(text: string): ExtractedRule[] {
    if (!text?.trim()) return [];
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const rules: ExtractedRule[] = [];
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof (item as ExtractedRule).rule === 'string' && (item as ExtractedRule).rule.trim()) {
        const r = item as ExtractedRule;
        rules.push({ rule: r.rule.trim(), quote: typeof r.quote === 'string' ? r.quote.trim() : undefined, source_url: typeof r.source_url === 'string' ? r.source_url : undefined });
      }
      if (rules.length >= MAX_CHUNKS) break;
    }
    return rules;
  }

  private toChunks(rules: ExtractedRule[], platformId: string, docsUrl: string, trustScore: number): KnowledgeChunk[] {
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const chunks: KnowledgeChunk[] = [];
    rules.forEach((r, i) => {
      const content = r.quote ? `${r.rule} (docs: "${r.quote}")` : r.rule;
      if (seen.has(content)) return;
      seen.add(content);
      chunks.push({
        id: `grounded-${platformId}-${i}`,
        kind: 'pkb',
        platformId,
        content,
        sourceUrl: r.source_url || docsUrl,
        ingestedAt: now,
        trustScore,
        similarity: trustScore, // fresh, doc-grounded content is highly relevant by construction
      });
    });
    return chunks;
  }

  private logDone(platformId: string, source: string, count: number, started: number): void {
    logger.info({ type: 'grounding:done', platformId, source, chunks: count, durationMs: Date.now() - started });
  }
}

export const groundingService = new GroundingService();
