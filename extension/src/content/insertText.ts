/**
 * Pure text-insertion helper for T5.6.
 * Never auto-submits — only fills the DOM input element.
 */

export interface InsertResult {
  ok: boolean;
  error?: string;
}

/**
 * Try to insert text into the active input element using the candidate selectors.
 * Returns `{ ok: true }` on success or `{ ok: false, error: string }` if no
 * matching input was found (caller should fall back to clipboard copy).
 */
export function insertText(
  text: string,
  selectors: string[],
  _hasTosReview: boolean,
): InsertResult {
  if (!_hasTosReview) {
    return { ok: false, error: 'tos_gate: platform ToS not reviewed' };
  }

  const el = findInsertTarget(selectors);
  if (!el) {
    return { ok: false, error: 'no_matching_input: no visible/editable input found' };
  }

  applyText(el, text);
  return { ok: true };
}

function findInsertTarget(
  selectors: string[],
): HTMLElement | HTMLTextAreaElement | HTMLInputElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement | HTMLTextAreaElement | HTMLInputElement>(sel);
    if (!el) continue;
    if (!isVisible(el)) continue;
    if (!isEditable(el)) continue;
    return el;
  }

  // Fallback: active element if it matches criteria
  const active = document.activeElement;
  if (
    active &&
    (active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement ||
      (active instanceof HTMLElement && (active.isContentEditable || active.getAttribute('contenteditable') === 'true'))) &&
    isVisible(active) &&
    isEditable(active)
  ) {
    return active;
  }

  return null;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const h = (el as HTMLElement).offsetHeight;
  // In jsdom, offsetHeight is 0 even for visible elements; accept connected elements.
  return h > 0 || el.isConnected;
}

function isEditable(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return !el.disabled && !el.readOnly;
  }
  if (el instanceof HTMLElement) {
    return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
  }
  return false;
}

function applyText(el: HTMLElement | HTMLTextAreaElement | HTMLInputElement, text: string): void {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + text.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('contenteditable') === 'true')) {
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
