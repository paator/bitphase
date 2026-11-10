import type { GenericPattern, GenericRow } from '../../models/song/generic';
import {
	clearFollowingGate,
	clearNoteEvents,
	EMPTY_NOTE,
	gateNote,
	isGateKind,
	nextNoteEvent,
	noteEventKind,
	OFF_NOTE,
	previousNoteEvent,
	writeNoteGate
} from './piano-note-events';

export interface PitchedBlockSpan {
	length: number;
	bounded: boolean;
}

export function setNoteValue(
	generic: GenericPattern,
	channelIndex: number,
	row: number,
	noteKey: string,
	note: string
): boolean {
	const target = generic.channels[channelIndex]?.rows[row];
	if (!target || target[noteKey] === note) return false;
	target[noteKey] = note;
	return true;
}

export function pitchedBlockSpan(
	rows: readonly GenericRow[],
	noteKey: string,
	startRow: number
): PitchedBlockSpan | null {
	if (noteEventKind(rows[startRow]?.[noteKey]) !== 'pitched') return null;
	const next = nextNoteEvent(rows, noteKey, startRow + 1);
	if (next) return { length: next.row - startRow, bounded: true };
	return { length: Math.max(1, rows.length - startRow), bounded: false };
}

export function movePitchedNote(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	instrumentKey: string | null,
	fromRow: number,
	toRow: number,
	note: string,
	length: number | null = null
): boolean {
	const rows = generic.channels[channelIndex]?.rows;
	const source = rows?.[fromRow];
	const destination = rows?.[toRow];
	if (!rows || !source || !destination) return false;
	if (noteEventKind(source[noteKey]) !== 'pitched') return false;
	if (fromRow === toRow && source[noteKey] === note) return false;
	const instrument = new InstrumentCarry(instrumentKey, source);
	const moving = fromRow !== toRow;
	if (length === null || length < 1) {
		if (moving) {
			source[noteKey] = EMPTY_NOTE;
			instrument.clear(source);
		}
		destination[noteKey] = note;
		if (moving) instrument.apply(destination);
		return true;
	}
	const release = noteEventKind(rows[fromRow + length]?.[noteKey]) === 'release';
	const covered =
		previousNoteEvent(rows, noteKey, toRow - 1, (row) => row === fromRow)?.kind === 'pitched';
	const following = nextNoteEvent(rows, noteKey, fromRow + 1);
	const end = toRow + length;
	if (moving) {
		const previousExtends = previousNoteEvent(rows, noteKey, fromRow - 1)?.kind === 'pitched';
		source[noteKey] = previousExtends ? OFF_NOTE : EMPTY_NOTE;
		instrument.clear(source);
		const terminator = following && isGateKind(following.kind) ? following.row : null;
		if (
			terminator !== null &&
			terminator !== toRow &&
			(terminator <= toRow || terminator >= end)
		) {
			rows[terminator][noteKey] = EMPTY_NOTE;
		}
	}
	destination[noteKey] = note;
	if (moving) instrument.apply(destination);
	writeBoundedBody(rows, noteKey, toRow, length, release);
	if (covered && noteEventKind(rows[end]?.[noteKey]) !== 'pitched') {
		clearFollowingGate(rows, noteKey, end + 1);
	}
	return true;
}

export function relocatePitchedNote(
	sourcePattern: GenericPattern,
	destinationPattern: GenericPattern,
	channelIndex: number,
	noteKey: string,
	instrumentKey: string | null,
	fromRow: number,
	toRow: number,
	note: string,
	length: number | null
): boolean {
	if (sourcePattern === destinationPattern) {
		return movePitchedNote(
			sourcePattern,
			channelIndex,
			noteKey,
			instrumentKey,
			fromRow,
			toRow,
			note,
			length
		);
	}
	const sourceRows = sourcePattern.channels[channelIndex]?.rows;
	const destinationRows = destinationPattern.channels[channelIndex]?.rows;
	const source = sourceRows?.[fromRow];
	const destination = destinationRows?.[toRow];
	if (!sourceRows || !destinationRows || !source || !destination) return false;
	if (noteEventKind(source[noteKey]) !== 'pitched') return false;
	const instrument = new InstrumentCarry(instrumentKey, source);
	const bounded = length !== null && length > 0;
	const release = bounded && noteEventKind(sourceRows[fromRow + length]?.[noteKey]) === 'release';
	const previousExtends = previousNoteEvent(sourceRows, noteKey, fromRow - 1)?.kind === 'pitched';
	source[noteKey] = bounded && previousExtends ? OFF_NOTE : EMPTY_NOTE;
	instrument.clear(source);
	if (bounded) clearFollowingGate(sourceRows, noteKey, fromRow + 1);
	destination[noteKey] = note;
	instrument.apply(destination);
	if (bounded) writeBoundedBody(destinationRows, noteKey, toRow, length, release);
	return true;
}

export function removePitchedNote(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	startRow: number
): boolean {
	return removePitchedNotes(generic, channelIndex, noteKey, [startRow]);
}

export function removePitchedNotes(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	startRows: readonly number[]
): boolean {
	const rows = generic.channels[channelIndex]?.rows;
	if (!rows) return false;
	const starts = [...new Set(startRows)]
		.filter((row) => noteEventKind(rows[row]?.[noteKey]) === 'pitched')
		.sort((left, right) => left - right);
	if (starts.length === 0) return false;
	const startSet = new Set(starts);
	const gates = new Set<number>();
	for (const start of starts) {
		for (let row = start + 1; row < rows.length; row++) {
			if (startSet.has(row)) break;
			const kind = noteEventKind(rows[row]?.[noteKey]);
			if (kind === 'empty') continue;
			if (isGateKind(kind)) gates.add(row);
			break;
		}
	}
	const replacements = new Map<number, string>();
	let pendingOff = false;
	for (const start of starts) {
		const previousKind = previousRemovalNeighbour(rows, noteKey, start, startSet, gates);
		if (previousKind === 'pitched' && !pendingOff) {
			replacements.set(start, OFF_NOTE);
			pendingOff = true;
			continue;
		}
		replacements.set(start, EMPTY_NOTE);
		if (previousKind !== 'selected') pendingOff = false;
	}
	for (const [row, value] of replacements) {
		const cell = rows[row];
		if (cell) cell[noteKey] = value;
	}
	for (const gate of gates) {
		const cell = rows[gate];
		if (cell) cell[noteKey] = EMPTY_NOTE;
	}
	return true;
}

export function resizePitchedNote(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	startRow: number,
	newEndRow: number
): boolean {
	const rows = generic.channels[channelIndex]?.rows;
	if (!rows?.[startRow] || noteEventKind(rows[startRow][noteKey]) !== 'pitched') return false;
	let ownGate: number | null = null;
	let ownRelease = false;
	let blockLimit = rows.length;
	for (let row = startRow + 1; row < rows.length; row++) {
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind === 'empty') continue;
		if (isGateKind(kind) && ownGate === null) {
			ownGate = row;
			ownRelease = kind === 'release';
			continue;
		}
		blockLimit = row;
		break;
	}
	const end = Math.max(startRow + 1, Math.min(blockLimit, newEndRow));
	if (end >= blockLimit) {
		if (ownGate === null) return false;
		rows[ownGate][noteKey] = EMPTY_NOTE;
		return true;
	}
	if (ownGate === end) return false;
	if (ownGate !== null) rows[ownGate][noteKey] = EMPTY_NOTE;
	rows[end][noteKey] = gateNote(ownRelease);
	return true;
}

function writeBoundedBody(
	rows: GenericRow[],
	noteKey: string,
	startRow: number,
	length: number,
	release: boolean
): void {
	const end = startRow + length;
	clearNoteEvents(rows, noteKey, startRow + 1, end);
	writeNoteGate(rows, noteKey, end, release);
}

function previousRemovalNeighbour(
	rows: readonly GenericRow[],
	noteKey: string,
	start: number,
	removing: ReadonlySet<number>,
	removedGates: ReadonlySet<number>
): 'pitched' | 'other' | 'selected' | 'empty' {
	for (let row = start - 1; row >= 0; row--) {
		if (removedGates.has(row)) continue;
		if (removing.has(row)) return 'selected';
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind === 'empty') continue;
		return kind === 'pitched' ? 'pitched' : 'other';
	}
	return 'empty';
}

class InstrumentCarry {
	private readonly value: number | null;

	constructor(
		private readonly key: string | null,
		source: GenericRow
	) {
		const raw = key ? source[key] : undefined;
		this.value = typeof raw === 'number' && raw > 0 ? raw : null;
	}

	clear(row: GenericRow): void {
		if (this.key && this.value !== null) row[this.key] = 0;
	}

	apply(row: GenericRow): void {
		if (this.key && this.value !== null) row[this.key] = this.value;
	}
}
