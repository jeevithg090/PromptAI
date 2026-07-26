import type { Platform } from './api-types';

/**
 * Client-side store for custom platforms (V1.1). The server is stateless
 * about them: POST /platforms/custom returns a profile + doc chunks, we keep
 * them here (localStorage, max 10) and send them back as `custom_platform`
 * with every draft/refine/serialize call that targets a `custom:` id.
 */
export interface CustomPlatformChunk {
  id: string;
  kind: 'pkb';
  platformId?: string;
  content: string;
  sourceUrl: string;
  ingestedAt: string;
  trustScore: number;
}

export interface CustomPlatformEntry {
  platform: Platform & {
    docs_url: string;
    quirks: string[];
    syntax_rules: string[];
    max_prompt_tokens: number;
    url_patterns: string[];
    dom_fingerprint_selectors: string[];
    input_selector_candidates: string[];
    tos_reviewed: boolean;
  };
  chunks: CustomPlatformChunk[];
}

const KEY = 'pf_custom_platforms';
const MAX = 10;

export function listCustomPlatforms(): CustomPlatformEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CustomPlatformEntry[];
  } catch {
    return [];
  }
}

export function getCustomPlatform(platformId: string): CustomPlatformEntry | undefined {
  return listCustomPlatforms().find((e) => e.platform.platform_id === platformId);
}

export function saveCustomPlatform(entry: CustomPlatformEntry): void {
  if (typeof localStorage === 'undefined') return;
  const existing = listCustomPlatforms().filter((e) => e.platform.platform_id !== entry.platform.platform_id);
  localStorage.setItem(KEY, JSON.stringify([entry, ...existing].slice(0, MAX)));
}

export function removeCustomPlatform(platformId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(listCustomPlatforms().filter((e) => e.platform.platform_id !== platformId)));
}

/** Attach-if-custom helper: returns the request extra for a platform id. */
export function customPlatformPayload(platformId: string): { custom_platform?: CustomPlatformEntry } {
  if (!platformId.startsWith('custom:')) return {};
  const entry = getCustomPlatform(platformId);
  return entry ? { custom_platform: entry } : {};
}
