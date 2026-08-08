import { describe, expect, it } from 'vitest';
import { getMentionCaretRect } from './mentionCaret';

function mockRangeRect(range: Range, rect: DOMRect): void {
  Object.defineProperty(range, 'getBoundingClientRect', { configurable: true, value: () => rect });
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('getMentionCaretRect', () => {
  it('uses the collapsed DOM range at the active caret inside the editor', () => {
    const editor = document.createElement('div');
    const text = document.createTextNode('@');
    editor.append(text);
    document.body.append(editor);

    const range = document.createRange();
    range.setStart(text, 1);
    range.collapse(true);
    const expected = rect(128, 48, 0, 18);
    mockRangeRect(range, expected);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(getMentionCaretRect(editor)).toEqual(expected);

    editor.remove();
  });

  it('does not return a caret outside its editor', () => {
    const editor = document.createElement('div');
    const elsewhere = document.createElement('div');
    const text = document.createTextNode('@');
    elsewhere.append(text);
    document.body.append(editor, elsewhere);

    const range = document.createRange();
    range.setStart(text, 1);
    range.collapse(true);
    mockRangeRect(range, rect(128, 48, 0, 18));
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(getMentionCaretRect(editor)).toBeNull();

    editor.remove();
    elsewhere.remove();
  });

  it('uses the right edge of the character before the mention when a collapsed range has no geometry', () => {
    const editor = document.createElement('div');
    const text = document.createTextNode('@image');
    editor.append(text);
    document.body.append(editor);

    const activeRange = document.createRange();
    activeRange.setStart(text, 1);
    activeRange.collapse(true);
    mockRangeRect(activeRange, rect(0, 0, 0, 0));
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(activeRange);

    const characterRange = document.createRange();
    const expected = rect(120, 48, 10, 18);
    mockRangeRect(characterRange, expected);
    const createRange = document.createRange.bind(document);
    let calls = 0;
    Object.defineProperty(document, 'createRange', {
      configurable: true,
      value: () => (++calls === 1 ? characterRange : createRange()),
    });

    expect(getMentionCaretRect(editor, { textNode: text, offset: 1 })).toMatchObject({ x: 130, y: 48, width: 0, height: 18 });

    Object.defineProperty(document, 'createRange', { configurable: true, value: createRange });
    editor.remove();
  });

  it('uses the left edge of the following character when the mention starts a text node', () => {
    const editor = document.createElement('div');
    const text = document.createTextNode('@image');
    editor.append(text);
    document.body.append(editor);

    const activeRange = document.createRange();
    activeRange.setStart(text, 0);
    activeRange.collapse(true);
    mockRangeRect(activeRange, rect(0, 0, 0, 0));
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(activeRange);

    const characterRange = document.createRange();
    const expected = rect(120, 48, 10, 18);
    mockRangeRect(characterRange, expected);
    const createRange = document.createRange.bind(document);
    let calls = 0;
    Object.defineProperty(document, 'createRange', {
      configurable: true,
      value: () => (++calls === 1 ? characterRange : createRange()),
    });

    expect(getMentionCaretRect(editor, { textNode: text, offset: 0 })).toMatchObject({ x: 120, y: 48, width: 0, height: 18 });

    Object.defineProperty(document, 'createRange', { configurable: true, value: createRange });
    editor.remove();
  });

  it('does not derive a fallback from text outside the editor', () => {
    const editor = document.createElement('div');
    const elsewhere = document.createElement('div');
    const text = document.createTextNode('@');
    elsewhere.append(text);
    document.body.append(editor, elsewhere);

    expect(getMentionCaretRect(editor, { textNode: text, offset: 1 })).toBeNull();

    editor.remove();
    elsewhere.remove();
  });
});
