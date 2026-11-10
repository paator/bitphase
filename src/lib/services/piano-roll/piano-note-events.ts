import type { GenericRow } from '../../models/song/generic';
import {
	formatNoteFromEnum,
	noteToTuningTableIndex,
	parseNoteFromString,
	tuningTableIndexToNote
} from '../../utils/note-utils';

export type NoteEventKind = 'empty' | 'pitched' | 'off' | 'release';

export interface NoteEvent {
	row: number;
	kind: NoteEventKind;
}

export const EMPTY_NOTE = '---';
export const OFF_NOTE = 'OFF';
export const RELEASE_NOTE = '===';

const LEGACY_OFF_NOTE = 'R--';

export function notePitchIndex(value: unknown): number | null {
	if (typeof value !== 'string' || value === '' || value === EMPTY_NOTE) return null;
	const parsed = parseNoteFromString(value);
	return noteToTuningTableIndex(parsed.noteName, parsed.octave);
}

export function pitchNoteText(pitchIndex: number): string | null {
	const parsed = tuningTableIndexToNote(pitchIndex);
	return parsed ? formatNoteFromEnum(parsed.noteName, parsed.octave) : null;
}

export function noteEventKind(value: unknown): NoteEventKind {
	if (value === OFF_NOTE || value === LEGACY_OFF_NOTE) return 'off';
	if (value === RELEASE_NOTE) return 'release';
	return notePitchIndex(value) === null ? 'empty' : 'pitched';
}

export function isGateKind(kind: NoteEventKind): kind is 'off' | 'release' {
	return kind === 'off' || kind === 'release';
}

export function gateNote(release: boolean): string {
	return release ? RELEASE_NOTE : OFF_NOTE;
}

export function nextNoteEvent(
	rows: readonly GenericRow[],
	noteKey: string,
	from: number,
	to: number = rows.length
): NoteEvent | null {
	for (let row = Math.max(0, from); row < to; row++) {
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind !== 'empty') return { row, kind };
	}
	return null;
}

export function previousNoteEvent(
	rows: readonly GenericRow[],
	noteKey: string,
	from: number,
	skip?: (row: number) => boolean
): NoteEvent | null {
	for (let row = Math.min(from, rows.length - 1); row >= 0; row--) {
		if (skip?.(row)) continue;
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind !== 'empty') return { row, kind };
	}
	return null;
}

export function clearFollowingGate(rows: GenericRow[], noteKey: string, from: number): boolean {
	const event = nextNoteEvent(rows, noteKey, from);
	const cell = event ? rows[event.row] : undefined;
	if (!event || !cell || !isGateKind(event.kind)) return false;
	cell[noteKey] = EMPTY_NOTE;
	return true;
}

export function clearNoteEvents(
	rows: GenericRow[],
	noteKey: string,
	from: number,
	to: number,
	keep?: (row: number) => boolean
): void {
	for (let row = from; row < to && row < rows.length; row++) {
		if (keep?.(row)) continue;
		const cell = rows[row];
		if (cell && noteEventKind(cell[noteKey]) !== 'empty') cell[noteKey] = EMPTY_NOTE;
	}
}

export function writeNoteGate(
	rows: GenericRow[],
	noteKey: string,
	row: number,
	release: boolean
): boolean {
	const cell = rows[row];
	const gate = gateNote(release);
	if (!cell || noteEventKind(cell[noteKey]) === 'pitched' || cell[noteKey] === gate) return false;
	cell[noteKey] = gate;
	return true;
}
