import type { Pattern } from '../models/song';
import { numberToInstrumentId } from '../utils/instrument-id';
import { parseHexColor } from '../utils/hex-color';
import type { FieldSegment } from './pattern-editor-text-parser';

export function instrumentColorsById(
	instruments: readonly { id: string; color?: string }[]
): Map<string, string> {
	const colors = new Map<string, string>();
	for (const instrument of instruments) {
		if (!instrument.color) continue;
		const hex = parseHexColor(instrument.color);
		if (hex) colors.set(instrument.id, hex);
	}
	return colors;
}

export function instrumentIdFromFieldText(text: string): string | null {
	const cleaned = text.trim().replace(/\./g, '').toUpperCase();
	if (!cleaned || cleaned === '00') return null;
	if (!/^[0-9A-Z]{1,2}$/.test(cleaned)) return null;
	return cleaned.padStart(2, '0');
}

export function patternRowInstrumentId(value: unknown): string | null {
	let num = 0;
	if (typeof value === 'number') {
		num = value;
	} else if (typeof value === 'string') {
		const parsed = parseInt(value.toUpperCase().padStart(2, '0'), 36);
		num = Number.isNaN(parsed) ? 0 : parsed;
	}
	if (num <= 0) return null;
	const id = numberToInstrumentId(num);
	return id === '00' ? null : id;
}

function emptyChannelInstrumentIds(
	channelCount: number,
	initialIds?: readonly (string | null)[]
): (string | null)[] {
	return Array.from({ length: channelCount }, (_, channel) => initialIds?.[channel] ?? null);
}

function applyRowInstrumentIds(
	pattern: Pattern,
	row: number,
	ids: (string | null)[]
): void {
	for (let channel = 0; channel < ids.length; channel++) {
		const id = patternRowInstrumentId(pattern.channels[channel]?.rows[row]?.instrument);
		if (id) ids[channel] = id;
	}
}

export function collectPatternChannelInstrumentIds(
	pattern: Pattern,
	initialIds?: readonly (string | null)[]
): (string | null)[][] {
	const current = emptyChannelInstrumentIds(pattern.channels.length, initialIds);
	const rows: (string | null)[][] = new Array(pattern.length);
	for (let row = 0; row < pattern.length; row++) {
		applyRowInstrumentIds(pattern, row, current);
		rows[row] = current.slice();
	}
	return rows;
}

export function lastPatternChannelInstrumentIds(
	pattern: Pattern,
	initialIds?: readonly (string | null)[]
): (string | null)[] {
	const current = emptyChannelInstrumentIds(pattern.channels.length, initialIds);
	for (let row = 0; row < pattern.length; row++) {
		applyRowInstrumentIds(pattern, row, current);
	}
	return current;
}

export function resolvePatternChannelInstrumentIds(
	pattern: Pattern,
	rowIndex: number,
	initialIds?: readonly (string | null)[]
): (string | null)[] {
	if (rowIndex < 0 || pattern.length === 0) {
		return emptyChannelInstrumentIds(pattern.channels.length, initialIds);
	}
	const rows = collectPatternChannelInstrumentIds(pattern, initialIds);
	return rows[Math.min(rowIndex, rows.length - 1)];
}

export function createInstrumentCarryLookup(
	patternOrder: readonly number[],
	getPattern: (patternId: number) => Pattern | undefined
): {
	idsAt(orderIndex: number, rowIndex: number): (string | null)[] | undefined;
} {
	const incomingByOrder = new Map<number, readonly (string | null)[]>();
	const rowsByOrder = new Map<number, (string | null)[][]>();

	function incomingFor(orderIndex: number): readonly (string | null)[] | undefined {
		if (orderIndex <= 0) return undefined;
		const cached = incomingByOrder.get(orderIndex);
		if (cached) return cached;
		const prevPatternId = patternOrder[orderIndex - 1];
		const prevPattern = prevPatternId === undefined ? undefined : getPattern(prevPatternId);
		const incoming = prevPattern
			? lastPatternChannelInstrumentIds(prevPattern, incomingFor(orderIndex - 1))
			: [...(incomingFor(orderIndex - 1) ?? [])];
		incomingByOrder.set(orderIndex, incoming);
		return incoming;
	}

	function rowsFor(orderIndex: number): (string | null)[][] | undefined {
		if (orderIndex < 0 || orderIndex >= patternOrder.length) return undefined;
		const cached = rowsByOrder.get(orderIndex);
		if (cached) return cached;
		const patternId = patternOrder[orderIndex];
		const pattern = patternId === undefined ? undefined : getPattern(patternId);
		if (!pattern) return undefined;
		const rows = collectPatternChannelInstrumentIds(pattern, incomingFor(orderIndex));
		rowsByOrder.set(orderIndex, rows);
		return rows;
	}

	return {
		idsAt(orderIndex, rowIndex) {
			const rows = rowsFor(orderIndex);
			if (!rows || rowIndex < 0 || rowIndex >= rows.length) return undefined;
			return rows[rowIndex];
		}
	};
}

export function applyInstrumentColorsToSegments(
	segments: readonly FieldSegment[],
	rowString: string,
	colorsById: ReadonlyMap<string, string>,
	carriedInstrumentIds?: readonly (string | null)[]
): FieldSegment[] {
	if (colorsById.size === 0) {
		return segments as FieldSegment[];
	}

	const next = segments.map((segment) => ({ ...segment }));
	let channelIndex = -1;
	let noteIndex = -1;

	for (let i = 0; i < next.length; i++) {
		const segment = next[i];
		if (segment.fieldKey === 'note') {
			channelIndex++;
			noteIndex = i;
		}
		if (segment.fieldKey !== 'instrument' || channelIndex < 0) continue;

		const displayed = instrumentIdFromFieldText(rowString.slice(segment.start, segment.end));
		if (displayed) {
			const color = colorsById.get(displayed);
			if (color) {
				segment.color = color;
				if (noteIndex >= 0) next[noteIndex].color = color;
			}
			continue;
		}

		const carried = carriedInstrumentIds?.[channelIndex];
		const color = carried ? colorsById.get(carried) : undefined;
		if (color && noteIndex >= 0) {
			next[noteIndex].color = color;
		}
	}

	return next;
}
