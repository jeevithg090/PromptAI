import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import type { ImageProvider } from '../../types/Provider';

const MODEL = 'imagen-3.0-generate-001';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface PredictResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
}

export class GeminiImageAdapter implements ImageProvider {
  name = 'gemini_image';

  async generateImage(prompt: string): Promise<{ imageBase64: string; mime: string }> {
    const apiKey = config.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured — visual preview unavailable');
    }

    const started = Date.now();
    const res = await fetch(`${BASE}/models/${MODEL}:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      logger.error({ type: 'provider:gemini_image_error', status: res.status, durationMs: Date.now() - started });
      throw new Error(`Gemini image generation failed: ${res.status} ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as PredictResponse;
    const prediction = data.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) {
      throw new Error('Gemini image response missing image data');
    }

    logger.info({ type: 'provider:gemini_image', durationMs: Date.now() - started, model: MODEL });
    return {
      imageBase64: prediction.bytesBase64Encoded,
      mime: prediction.mimeType ?? 'image/png',
    };
  }
}
