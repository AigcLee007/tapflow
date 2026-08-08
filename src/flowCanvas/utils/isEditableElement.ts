const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"]';

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && (target.isContentEditable || target.contentEditable === 'true')) return true;
  return target.matches(EDITABLE_SELECTOR) || target.closest(EDITABLE_SELECTOR) !== null;
}
