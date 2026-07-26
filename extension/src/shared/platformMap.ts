/**
 * Single source of truth mapping the extension's short platform ids (used by the
 * DOM detector and the overlay picker) to the backend registry's canonical
 * platform ids (GET /platforms). The backend 404s on an unknown platform_id, so
 * every API call MUST translate through here before sending.
 *
 * Keep this in sync with config/platform-registry.json. Ids that don't yet exist
 * in the registry are marked below — the backend returns a clear 404 until the
 * registry entry lands (C9 in finalplan.md).
 */
export const SHORT_TO_REGISTRY: Record<string, string> = {
  chatgpt: 'openai_chatgpt',
  claude: 'anthropic_claude',
  gemini: 'google_gemini',
  perplexity: 'perplexity',
  midjourney: 'midjourney',
  stability: 'stability_stable_diffusion',
  mistral: 'mistral_le_chat',
  huggingface: 'huggingface_chat',
  grok: 'xai_grok',
  deepseek: 'deepseek_chat',
};

/** Human labels for the overlay platform picker (short id → display name). */
export const SHORT_DISPLAY_NAMES: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  midjourney: 'Midjourney',
  stability: 'Stable Diffusion',
  mistral: 'Mistral Le Chat',
  huggingface: 'HuggingChat',
  grok: 'Grok',
  deepseek: 'DeepSeek',
};

/** The ten supported sites, in picker order. */
export const SUPPORTED_SHORT_IDS = Object.keys(SHORT_TO_REGISTRY);

/**
 * Translate a short detector id to the backend registry id. If the id is already
 * a registry id (or unknown), it is returned unchanged so callers never crash.
 */
export function toRegistryId(shortId: string): string {
  return SHORT_TO_REGISTRY[shortId] ?? shortId;
}

/** Image-generation platforms (drive modality selection for recommendations). */
export const IMAGE_SHORT_IDS = new Set(['midjourney', 'stability']);
