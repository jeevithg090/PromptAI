export interface PlatformContext {
  platformId: string;
  inputType: 'textarea' | 'contenteditable' | 'prosemirror' | 'codemirror' | 'unknown';
  inputElement: HTMLElement | HTMLTextAreaElement | HTMLInputElement | null;
  /** Candidate CSS selectors for this platform's input box, most-specific first. */
  inputSelectors: string[];
  sourceText: string;
  conversationTitle?: string;
  detectedModel?: string;
  pageUrl: string;
}
