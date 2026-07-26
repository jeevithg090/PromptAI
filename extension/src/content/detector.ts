import type { PlatformContext } from '../types/detector';

/**
 * Platform detection engine (§20.2, T5.5).
 * Reads the DOM to identify the current platform, active input element,
 * and contextual metadata (conversation title, detected model).
 */

interface PlatformPattern {
  id: string;
  hostname: RegExp;
  selectors: {
    input: string[];
    prosemirror?: string;
    codemirror?: string;
    title?: string[];
    model?: string[];
  };
}

const PLATFORM_PATTERNS: PlatformPattern[] = [
  {
    id: 'chatgpt',
    hostname: /chatgpt\.com|chat\.openai\.com/,
    selectors: {
      input: ['textarea[placeholder*="Message ChatGPT"]', 'textarea[placeholder*="Send a message"]', 'div[contenteditable="true"][role="textbox"]', '#prompt-textarea'],
      title: ['h1', '[data-testid="conversation-title"]', '.truncate'],
      model: ['[data-testid="model-selector-button"]', '.model-selector-text'],
    },
  },
  {
    id: 'claude',
    hostname: /claude\.ai/,
    selectors: {
      input: ['div[contenteditable="true"][role="textbox"]', 'textarea'],
      prosemirror: '.ProseMirror[contenteditable="true"]',
      title: ['h1', '.conversation-title'],
      model: ['[class*="model"]', '[data-testid*="model"]'],
    },
  },
  {
    id: 'gemini',
    hostname: /gemini\.google\.com/,
    selectors: {
      input: ['div[contenteditable="true"][role="textbox"]', 'textarea'],
      title: ['h1', '.conversation-title'],
      model: ['[class*="model"]'],
    },
  },
  {
    id: 'perplexity',
    hostname: /perplexity\.ai/,
    selectors: {
      input: ['textarea', 'div[contenteditable="true"]'],
      title: ['h1', '.thread-title'],
      model: ['[class*="model"]', '[data-testid*="model"]'],
    },
  },
  {
    id: 'grok',
    hostname: /grok\.com|x\.com/,
    selectors: {
      input: ['textarea', 'div[contenteditable="true"]'],
      title: ['h1'],
      model: ['[class*="model"]'],
    },
  },
  {
    id: 'deepseek',
    hostname: /chat\.deepseek\.com/,
    selectors: {
      input: ['textarea#chat-input', 'textarea', 'div[contenteditable="true"]'],
      title: ['h1'],
      model: ['[class*="model"]'],
    },
  },
  {
    id: 'mistral',
    hostname: /chat\.mistral\.ai/,
    selectors: {
      input: ['textarea', 'div[contenteditable="true"]'],
      title: ['h1'],
      model: ['[class*="model"]'],
    },
  },
  {
    // Hostname-only match — the /chat/ path is enforced by the content-script glob.
    id: 'huggingface',
    hostname: /huggingface\.co/,
    selectors: {
      input: ['textarea', 'div[contenteditable="true"]'],
      title: ['h1'],
      model: ['[class*="model"]'],
    },
  },
  {
    id: 'midjourney',
    hostname: /midjourney\.com/,
    selectors: {
      input: ['textarea', 'input[type="text"]'],
      title: ['h1'],
    },
  },
  {
    id: 'stability',
    hostname: /stability\.ai|dreamstudio\.ai/,
    selectors: {
      input: ['textarea', 'input[type="text"]'],
      title: ['h1'],
    },
  },
];

function matchPlatform(): PlatformPattern | null {
  const host = window.location.hostname;
  for (const p of PLATFORM_PATTERNS) {
    if (p.hostname.test(host)) return p;
  }
  return null;
}

/**
 * Find the most likely input element by trying platform-specific selectors.
 */
function findInput(
  selectors: PlatformPattern['selectors'],
): HTMLElement | HTMLTextAreaElement | null {
  for (const sel of selectors.input) {
    const el = document.querySelector<HTMLElement | HTMLTextAreaElement>(sel);
    if (el) return el;
  }

  if (selectors.prosemirror) {
    const pm = document.querySelector<HTMLElement>(selectors.prosemirror);
    if (pm) return pm;
  }

  // Fallback: last textarea or contenteditable in a chat-like layout
  const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
  if (textareas.length > 0) return textareas[textareas.length - 1]!;

  const contenteditables = document.querySelectorAll<HTMLElement>('div[contenteditable="true"]');
  if (contenteditables.length > 0) return contenteditables[contenteditables.length - 1]!;

  return null;
}

function detectInputType(el: HTMLElement | HTMLTextAreaElement | null): PlatformContext['inputType'] {
  if (!el) return 'unknown';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return 'textarea';
  if (el.closest('.ProseMirror')) return 'prosemirror';
  if (el.closest('.CodeMirror')) return 'codemirror';
  if (el.getAttribute('contenteditable') === 'true') return 'contenteditable';
  return 'textarea';
}

function extractText(el: HTMLElement | HTMLTextAreaElement | null): string {
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  return el.textContent ?? '';
}

function readFirst(selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

export function detect(): PlatformContext {
  const pattern = matchPlatform();
  const platformId = pattern?.id ?? 'generic';
  const selectors = pattern?.selectors ?? { input: [] };
  const inputElement = findInput(selectors);
  const inputType = detectInputType(inputElement);
  const sourceText = extractText(inputElement);

  const pageUrl = window.location.href;
  const conversationTitle = pattern ? readFirst(selectors.title ?? []) : undefined;
  const detectedModel = pattern?.selectors.model
    ? readFirst(pattern.selectors.model)
    : undefined;

  return {
    platformId,
    inputType,
    inputElement,
    sourceText,
    conversationTitle,
    detectedModel,
    pageUrl,
  };
}
