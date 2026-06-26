export function formatRowEditorNumber(value: number, asHex: boolean): string {
	if (asHex) {
		const sign = value < 0 ? '-' : '';
		return sign + Math.abs(value).toString(16).toUpperCase();
	}
	return String(value);
}

export type NumericFieldLimits = {
	min?: number;
	max?: number;
	maxDigits?: number;
};

export function parseRowEditorNumericText(
	text: string,
	asHex: boolean,
	limits?: NumericFieldLimits
): number | null {
	let normalized = text.trim().replace(/\+/g, '');
	const allowedPattern = asHex ? /[^0-9a-fA-F-]/g : /[^0-9-]/g;
	normalized = normalized.replace(allowedPattern, '');

	if (limits?.maxDigits !== undefined && asHex && normalized.replace('-', '').length > limits.maxDigits) {
		normalized = normalized.startsWith('-')
			? '-' + normalized.slice(1, limits.maxDigits + 1)
			: normalized.slice(0, limits.maxDigits);
	}

	if (!asHex && limits?.max !== undefined) {
		const num = parseInt(normalized, 10);
		if (!Number.isNaN(num) && num > limits.max) {
			normalized = String(limits.max);
		}
	}

	let parsed: number | null = null;
	if (asHex) {
		let sign = 1;
		let temp = normalized;
		if (temp.startsWith('-')) {
			sign = -1;
			temp = temp.substring(1);
		}
		if (/^[0-9a-fA-F]+$/.test(temp)) {
			parsed = sign * parseInt(temp, 16);
		}
	} else if (/^-?\d+$/.test(normalized)) {
		parsed = parseInt(normalized, 10);
	}

	if (parsed === null) return null;
	if (limits?.min !== undefined) parsed = Math.max(limits.min, parsed);
	if (limits?.max !== undefined) parsed = Math.min(limits.max, parsed);
	return parsed;
}

export function focusRowEditorInputInRow(
	row: HTMLTableRowElement | null,
	currentInput?: HTMLInputElement
): void {
	if (!row) return;
	let input: HTMLInputElement | null = null;
	if (currentInput) {
		const currentCell = currentInput.closest('td');
		if (currentCell) {
			const cellIndex = Array.from(currentCell.parentElement?.children || []).indexOf(currentCell);
			const targetCell = row.children[cellIndex] as HTMLTableCellElement | undefined;
			input = targetCell?.querySelector('input[type="text"]') ?? null;
		}
	}
	input ??= row.querySelector('input[type="text"]');
	if (input) {
		input.focus();
		input.select();
	}
}

export function shouldBlockRowEditorNumericKey(key: string, asHex: boolean): boolean {
	if (key.length > 1) return false;
	const pattern = asHex ? /^[0-9a-fA-F-]$/ : /^[0-9-]$/;
	return !pattern.test(key);
}
