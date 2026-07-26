import { config } from '../../config/env';
import { resolveRoute } from '../ModelRouter';
import { logger } from '../../utils/logger';

/**
 * Groq speech-to-text adapter (F1.3). Wraps Groq's OpenAI-compatible
 * /audio/transcriptions endpoint (Whisper). The model id comes from
 * config/model-routing.json (`transcription` step) — model changes are a
 * config edit, never code (§32.3). The audio buffer lives only for this call;
 * the transcript is returned and NEVER logged (§19.1).
 */
export interface TranscribeRequest {
  audio: Buffer;
  mimeType: string;
  /** Optional filename hint for the multipart part (helps Whisper pick a decoder). */
  filename?: string;
  language?: string;
}

export interface TranscribeResult {
  text: string;
  durationMs: number;
}

export class GroqSTTAdapter {
  name = 'groq_stt';

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const apiKey = config.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured — dictation unavailable');
    }
    const model = resolveRoute('transcription', 'small').model_id;
    const base = config.GROQ_BASE_URL;

    const form = new FormData();
    // Node's fetch/FormData accepts a Blob for file parts.
    const blob = new Blob([new Uint8Array(req.audio)], { type: req.mimeType });
    form.append('file', blob, req.filename ?? `audio.${extFor(req.mimeType)}`);
    form.append('model', model);
    form.append('response_format', 'json');
    if (req.language) form.append('language', req.language);

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${base}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.error({ type: 'provider:groq_stt_error', status: res.status, durationMs: Date.now() - started });
        throw new Error(`Groq transcription failed: ${res.status} ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as { text?: string };
      const durationMs = Date.now() - started;
      // Log the duration + model only — never the transcript text (§19.1).
      logger.info({ type: 'provider:groq_stt', model, durationMs, bytes: req.audio.length });
      return { text: data.text ?? '', durationMs };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Best-effort file extension for a mime type (Whisper is tolerant). */
function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}
