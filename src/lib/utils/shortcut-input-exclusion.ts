const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

export function isEditableElement(element: EventTarget | null): boolean {
	if (!element || !(element instanceof HTMLElement)) return false;
	return (
		element.closest?.(EDITABLE_SELECTOR) !== null ||
		element.getAttribute?.('contenteditable') === 'true'
	);
}
