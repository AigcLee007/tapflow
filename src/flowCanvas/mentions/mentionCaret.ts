/** Return the browser caret rectangle when the selection belongs to an editor. */
export function getMentionCaretRect(editor: HTMLElement | null): DOMRect | null {
  if (!editor || typeof window === 'undefined') return null;
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  const rangeWithRect = range as Range & { getBoundingClientRect?: () => DOMRect };
  if (typeof rangeWithRect.getBoundingClientRect === 'function') return rangeWithRect.getBoundingClientRect();
  const rect = range.getClientRects?.()[0];
  return rect ?? null;
}
