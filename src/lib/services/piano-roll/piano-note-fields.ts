import type { GenericRow } from '../../models/song/generic';

export type PianoNoteFields = Record<string, unknown>;

export function cloneFieldValue(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	return structuredClone(value);
}

function sameFieldValue(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
	return JSON.stringify(left) === JSON.stringify(right);
}

export function captureNoteFields(row: GenericRow, noteKey: string): PianoNoteFields {
	const fields: PianoNoteFields = {};
	for (const [key, value] of Object.entries(row)) {
		if (key === noteKey || value === undefined) continue;
		fields[key] = cloneFieldValue(value);
	}
	return fields;
}

export function writeNoteFields(row: GenericRow, fields: PianoNoteFields): boolean {
	let changed = false;
	for (const [key, value] of Object.entries(fields)) {
		if (sameFieldValue(row[key], value)) continue;
		row[key] = cloneFieldValue(value) as GenericRow[string];
		changed = true;
	}
	return changed;
}

export function clearNoteFields(row: GenericRow, noteKey: string, blank: GenericRow): boolean {
	let changed = false;
	for (const [key, empty] of Object.entries(blank)) {
		if (key === noteKey || !(key in row) || sameFieldValue(row[key], empty)) continue;
		row[key] = cloneFieldValue(empty) as GenericRow[string];
		changed = true;
	}
	return changed;
}

export class NoteFieldsCarry {
	private readonly fields: PianoNoteFields;

	constructor(
		private readonly blank: GenericRow | null,
		private readonly noteKey: string,
		source: GenericRow
	) {
		this.fields = blank ? captureNoteFields(source, noteKey) : {};
	}

	clear(row: GenericRow): void {
		if (this.blank) clearNoteFields(row, this.noteKey, this.blank);
	}

	apply(row: GenericRow): void {
		writeNoteFields(row, this.fields);
	}
}
