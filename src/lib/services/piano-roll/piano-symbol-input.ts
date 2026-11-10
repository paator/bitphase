import { formatSymbol, parseSymbol } from '../../chips/base/field-formatters';
import type { PianoRollLane } from './piano-roll-model';

export function laneValueIsTyped(
	lane: Pick<PianoRollLane, 'kind' | 'fieldType' | 'length'> | null | undefined
): boolean {
	if (!lane || lane.kind !== 'value') return false;
	if (lane.fieldType === 'symbol') return lane.length >= 1;
	return lane.fieldType === 'hex' && lane.length >= 4;
}

export function clampPianoSymbolInput(text: string, length: number): string {
	return text
		.toUpperCase()
		.replace(/[^0-9A-Z.]/g, '')
		.slice(0, Math.max(1, length));
}

export function formatPianoSymbolInput(
	value: unknown,
	length: number,
	allowZeroValue?: boolean
): string {
	const raw =
		typeof value === 'number' || typeof value === 'string' || value == null ? value : null;
	const text = formatSymbol(raw, length, allowZeroValue);
	return /^\.+$/.test(text) ? '' : text;
}

export function pianoSymbolInputValue(
	text: string,
	length: number,
	allowZeroValue?: boolean
): number | undefined {
	const cleaned = clampPianoSymbolInput(text, length);
	if (!cleaned || /^\.+$/.test(cleaned)) return 0;
	const digits = cleaned.replace(/\./g, '0');
	if (!/^[0-9A-Z]+$/.test(digits)) return undefined;
	return parseSymbol(digits.padStart(length, '0'), length, allowZeroValue === true);
}
