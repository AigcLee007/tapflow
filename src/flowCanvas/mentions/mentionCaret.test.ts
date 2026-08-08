import { describe, expect, it } from 'vitest';
import { getMentionCaretRect } from './mentionCaret';

describe('getMentionCaretRect', () => {
  it('uses the collapsed DOM range at the active caret inside the editor', () => {
    const editor = document.createElement('div');
    const text = document.createTextNode('@');
    editor.append(text);
    document.body.append(editor);

    const range = document.createRange();
    range.setStart(text, 1);
    range.collapse(true);
    const expected = new DOMRect(128, 48, 0, 18);
    Object.defineProperty(range, 'getBoundingClientRect', { value: () => expected });
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
    Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(128, 48, 0, 18) });
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(getMentionCaretRect(editor)).toBeNull();

    editor.remove();
    elsewhere.remove();
  });
});
