import { describe, expect, it } from 'vitest';
import { isEditableElement } from './isEditableElement';

describe('isEditableElement', () => {
  it.each([
    ['input', '<input />'],
    ['textarea', '<textarea></textarea>'],
    ['select', '<select><option>one</option></select>'],
    ['contenteditable', '<div contenteditable="true"><span>text</span></div>'],
    ['textbox role', '<div role="textbox"><span>text</span></div>'],
    ['combobox role', '<div role="combobox"><span>text</span></div>'],
  ])('recognizes %s and descendants as editable', (_label, markup) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = markup;
    const root = wrapper.firstElementChild as HTMLElement;
    const descendant = root.querySelector('span, option') ?? root;

    expect(isEditableElement(root)).toBe(true);
    expect(isEditableElement(descendant)).toBe(true);
  });

  it('does not classify ordinary canvas elements as editable', () => {
    const canvas = document.createElement('div');
    expect(isEditableElement(canvas)).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });

  it('recognizes a contentEditable property when the DOM does not reflect it as an attribute', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';

    expect(isEditableElement(editor)).toBe(true);
  });
});
