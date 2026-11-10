import type { GenericRow } from '../../models/song/generic';
import { noteEventKind, pitchedBlockSpan } from './piano-roll-model';

export interface PianoClipboardNote {
	rowOffset: number;
	note: string;
	length: number;
	bounded: boolean;
	release: boolean;
	fields: Record<string, unknown>;
}

export interface CapturedPianoNote extends PianoClipboardNote {
	absoluteRow: number;
}

function cloneFieldValue(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	return structuredClone(value);
}

export function capturePianoNote(
	rows: readonly GenericRow[],
	noteKey: string,
	localRow: number,
	absoluteRow: number
): CapturedPianoNote | null {
	const source = rows[localRow];
	if (!source || noteEventKind(source[noteKey]) !== 'pitched') return null;
	const span = pitchedBlockSpan(rows, noteKey, localRow);
	const length = span?.length ?? 1;
	const bounded = span?.bounded ?? false;
	const fields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (key === noteKey || value === undefined) continue;
		fields[key] = cloneFieldValue(value);
	}
	return {
		absoluteRow,
		rowOffset: 0,
		note: String(source[noteKey]),
		length,
		bounded,
		release: bounded && noteEventKind(rows[localRow + length]?.[noteKey]) === 'release',
		fields
	};
}

export function clipboardFromCaptures(notes: readonly CapturedPianoNote[]): PianoClipboardNote[] {
	if (notes.length === 0) return [];
	const origin = Math.min(...notes.map((note) => note.absoluteRow));
	return [...notes]
		.sort((left, right) => left.absoluteRow - right.absoluteRow)
		.map((note) => ({
			rowOffset: note.absoluteRow - origin,
			note: note.note,
			length: note.length,
			bounded: note.bounded,
			release: note.release,
			fields: note.fields
		}));
}

export interface PianoPasteNote extends PianoClipboardNote {
	localRow: number;
}

export function pastePianoNotes(
	rows: GenericRow[],
	noteKey: string,
	notes: readonly PianoPasteNote[]
): boolean {
	const accepted = notes.filter((note) => note.localRow >= 0 && note.localRow < rows.length);
	if (accepted.length === 0) return false;
	const written = new Set(accepted.map((note) => note.localRow));
	for (const note of accepted) {
		const cell = rows[note.localRow];
		if (!cell) continue;
		cell[noteKey] = note.note;
		for (const [key, value] of Object.entries(note.fields)) {
			cell[key] = cloneFieldValue(value) as GenericRow[string];
		}
	}
	for (const note of accepted) {
		if (!note.bounded) continue;
		const end = note.localRow + note.length;
		for (let row = note.localRow + 1; row < end && row < rows.length; row++) {
			if (written.has(row)) continue;
			const cell = rows[row];
			if (cell && noteEventKind(cell[noteKey]) !== 'empty') cell[noteKey] = '---';
		}
		if (end < rows.length && !written.has(end) && noteEventKind(rows[end]?.[noteKey]) !== 'pitched') {
			const cell = rows[end];
			if (cell) cell[noteKey] = note.release ? '===' : 'OFF';
		}
	}
	return true;
}

let clipboardNotes: PianoClipboardNote[] | null = null;

export const pianoRollClipboard = {
	set(notes: PianoClipboardNote[]): void {
		clipboardNotes = notes;
	},
	get(): PianoClipboardNote[] | null {
		return clipboardNotes;
	}
};
