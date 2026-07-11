export interface PlatformContext {
  platformId: string;
  inputType: 'textarea' | 'contenteditable' | 'prosemirror' | 'codemirror' | 'unknown';
  inputElement: HTMLElement | HTMLTextAreaElement | HTMLInputElement | null;
  sourceText: string;
  conversationTitle?: string;
  detectedModel?: string;
  pageUrl: string;
}
