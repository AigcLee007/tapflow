export type MentionCaretFallback = {
  textNode: Text;
  offset: number;
};

function isUsableRect(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(
    rect
      && Number.isFinite(rect.x)
      && Number.isFinite(rect.y)
      && Number.isFinite(rect.width)
      && Number.isFinite(rect.height)
      && (rect.width > 0 || rect.height > 0),
  );
}

function getRangeRect(range: Range): DOMRect | null {
  const rangeWithRect = range as Range & { getBoundingClientRect?: () => DOMRect };
  const boundingRect = rangeWithRect.getBoundingClientRect?.();
  if (isUsableRect(boundingRect)) return boundingRect;
  const clientRect = range.getClientRects?.()[0];
  return isUsableRect(clientRect) ? clientRect : null;
}

function caretRectFromCharacter(rect: DOMRect, edge: 'left' | 'right'): DOMRect {
  const x = edge === 'right' ? rect.right : rect.left;
  return new DOMRect(x, rect.top, 0, rect.height);
}

function getFallbackCaretRect(editor: HTMLElement, fallback: MentionCaretFallback | undefined): DOMRect | null {
  if (!fallback || !editor.contains(fallback.textNode)) return null;
  const { textNode } = fallback;
  const offset = Math.max(0, Math.min(fallback.offset, textNode.data.length));
  if (textNode.data.length === 0) return null;

  const range = document.createRange();
  if (offset > 0) {
    range.setStart(textNode, offset - 1);
    range.setEnd(textNode, offset);
    const rect = getRangeRect(range);
    return rect ? caretRectFromCharacter(rect, 'right') : null;
  }

  range.setStart(textNode, 0);
  range.setEnd(textNode, 1);
  const rect = getRangeRect(range);
  return rect ? caretRectFromCharacter(rect, 'left') : null;
}

/**
 * Return the browser caret rectangle when the selection belongs to an editor.
 * For browsers that report an empty collapsed Range under transformed canvases,
 * derive the caret from the known Lexical text node instead of using the editor box.
 */
export function getMentionCaretRect(editor: HTMLElement | null, fallback?: MentionCaretFallback): DOMRect | null {
  if (!editor || typeof window === 'undefined') return null;
  const selection = window.getSelection?.();
  if (selection?.rangeCount && selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer)) {
      const rect = getRangeRect(range);
      if (rect) return rect;
      return getFallbackCaretRect(editor, fallback);
    }
    return null;
  }
  return getFallbackCaretRect(editor, fallback);
}
