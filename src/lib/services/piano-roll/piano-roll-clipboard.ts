import type { GenericRow } from '../../models/song/generic';
import { clearNoteEvents, noteEventKind, writeNoteGate } from './piano-note-events';
import { pitchedBlockSpan } from './piano-roll-editing';
import { captureNoteFields, writeNoteFields, type PianoNoteFields } from './piano-note-fields';

export interface PianoClipboardNote {
	rowOffset: number;
	note: string;
	length: number;
	bounded: boolean;
	release: boolean;
	fields: PianoNoteFields;
}

export interface CapturedPianoNote extends PianoClipboardNote {
	absoluteRow: number;
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
	const fields = captureNoteFields(source, noteKey);
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
		writeNoteFields(cell, note.fields);
	}
	const isWritten = (row: number) => written.has(row);
	for (const note of accepted) {
		if (!note.bounded) continue;
		const end = note.localRow + note.length;
		clearNoteEvents(rows, noteKey, note.localRow + 1, end, isWritten);
		if (!isWritten(end)) writeNoteGate(rows, noteKey, end, note.release);
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
