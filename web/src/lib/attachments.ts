/**
 * Client-side file → text extraction for chat attachments (V1.4).
 * Text-ish files are read directly; PDFs go through a lazily-imported pdfjs
 * (only loaded when a PDF is actually attached, to keep the bundle lean).
 * Images and unknown binaries are rejected with an honest message.
 */
export const MAX_ATTACHMENT_CHARS = 50_000;

const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'ts', 'tsx', 'js', 'jsx', 'py', 'html', 'css', 'yml', 'yaml', 'xml', 'sql', 'sh', 'go', 'rs', 'java', 'rb', 'php', 'c', 'cpp', 'h'];

export interface ExtractedAttachment {
  name: string;
  mime: string;
  text: string;
}

export class AttachmentError extends Error {}

function ext(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

async function extractPdf(file: File): Promise<string> {
  // Lazy import — pdfjs is only pulled in when a PDF is attached.
  const pdfjs = await import('pdfjs-dist');
  // Point the worker at the bundled asset (no external CDN — CSP-safe).
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages && parts.join('').length < MAX_ATTACHMENT_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return parts.join('\n');
}

export async function extractAttachment(file: File): Promise<ExtractedAttachment> {
  const e = ext(file.name);
  const isPdf = e === 'pdf' || file.type === 'application/pdf';

  if (file.type.startsWith('image/')) {
    throw new AttachmentError('Images can’t be attached here — describe the image in words instead.');
  }

  let text: string;
  if (isPdf) {
    text = await extractPdf(file);
  } else if (TEXT_EXTENSIONS.includes(e) || file.type.startsWith('text/') || file.type === 'application/json') {
    text = await file.text();
  } else {
    throw new AttachmentError(`“${file.name}” isn’t a supported file type. Attach a text, code, CSV, JSON, or PDF file.`);
  }

  text = text.trim();
  if (!text) throw new AttachmentError(`“${file.name}” had no readable text.`);

  return {
    name: file.name,
    mime: file.type || 'text/plain',
    text: text.slice(0, MAX_ATTACHMENT_CHARS),
  };
}
