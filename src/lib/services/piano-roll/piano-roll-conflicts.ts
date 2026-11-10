import { noteSpotKey, sameNoteSpot, type PianoNoteSpot } from './piano-roll-notes';

export interface OverlapNote extends PianoNoteSpot {
	length: number;
	preferred: boolean;
}

export interface PianoIntentNote extends OverlapNote {
	note: string;
	instrument: number | null;
	release: boolean;
	bounded: boolean;
}

export interface PianoConflictNote {
	songIndex: number;
	channelIndex: number;
	startRow: number;
	length: number;
	pitchIndex: number;
	note: string;
	instrument: number | null;
	release: boolean;
}

export interface PianoIntentPlan {
	audible: PianoIntentNote[];
	silent: PianoIntentNote[];
	remove: PianoIntentNote[];
	add: PianoIntentNote[];
	reshape: PianoIntentNote[];
}

export function rangesOverlap(
	startRow: number,
	length: number,
	otherStart: number,
	otherLength: number
): boolean {
	return startRow < otherStart + otherLength && otherStart < startRow + length;
}

function notesOverlap(
	note: { startRow: number; length: number },
	other: { startRow: number; length: number }
): boolean {
	return rangesOverlap(note.startRow, note.length, other.startRow, other.length);
}

export function overlapsAny(
	incoming: readonly { startRow: number; length: number }[],
	existing: readonly { startRow: number; length: number }[]
): boolean {
	return incoming.some(
		(note) =>
			existing.some((other) => notesOverlap(note, other)) ||
			incoming.some((other) => other !== note && notesOverlap(note, other))
	);
}

export function withoutSpots<T extends PianoNoteSpot>(
	notes: readonly T[],
	spots: readonly PianoNoteSpot[]
): T[] {
	const keys = new Set(spots.map(noteSpotKey));
	return notes.filter((note) => !keys.has(noteSpotKey(note)));
}

function beats(notes: readonly OverlapNote[], index: number, otherIndex: number): boolean {
	const note = notes[index];
	const other = notes[otherIndex];
	if (!note || !other || note.length < 1 || other.length < 1) return false;
	if (!notesOverlap(note, other)) return false;
	if (other.pitchIndex !== note.pitchIndex) return other.pitchIndex > note.pitchIndex;
	if (other.startRow !== note.startRow) return other.startRow < note.startRow;
	if (other.preferred !== note.preferred) return other.preferred;
	return otherIndex < index;
}

export function silencedIndexes(notes: readonly OverlapNote[]): Set<number> {
	const empty = (index: number) => {
		const note = notes[index];
		return !note || note.length < 1;
	};
	let silent = new Set<number>();
	for (let index = 0; index < notes.length; index++) {
		if (empty(index)) silent.add(index);
	}
	for (let pass = 0; pass < notes.length; pass++) {
		const next = new Set<number>([...silent].filter(empty));
		for (let index = 0; index < notes.length; index++) {
			if (next.has(index)) continue;
			for (let otherIndex = 0; otherIndex < notes.length; otherIndex++) {
				if (otherIndex === index || silent.has(otherIndex)) continue;
				if (!beats(notes, index, otherIndex)) continue;
				next.add(index);
				break;
			}
		}
		if (next.size === silent.size && [...next].every((index) => silent.has(index))) return next;
		silent = next;
	}
	return silent;
}

function sameShape(left: PianoIntentNote, right: PianoIntentNote): boolean {
	return (
		sameNoteSpot(left, right) &&
		left.length === right.length &&
		left.bounded === right.bounded &&
		left.release === right.release &&
		left.note === right.note
	);
}

export function planPianoIntents(
	intents: readonly PianoIntentNote[],
	current: readonly PianoIntentNote[]
): PianoIntentPlan {
	const silentIndexes = silencedIndexes(intents);
	const audible = intents.filter((_, index) => !silentIndexes.has(index));
	const silent = intents.filter((_, index) => silentIndexes.has(index));
	const placed = (note: PianoIntentNote, notes: readonly PianoIntentNote[]) =>
		notes.find((item) => sameNoteSpot(item, note));
	return {
		audible,
		silent,
		remove: current.filter((note) => !placed(note, audible)),
		add: audible.filter((note) => !placed(note, current)),
		reshape: audible.filter((note) => {
			const existing = placed(note, current);
			return !!existing && !sameShape(existing, note);
		})
	};
}

export function conflictNotesSignature(notes: readonly PianoConflictNote[]): string {
	return notes
		.map(
			(note) =>
				`${note.songIndex}:${note.channelIndex}:${note.startRow}:${note.length}:${note.pitchIndex}:${note.note}:${note.instrument ?? ''}:${note.release ? 1 : 0}`
		)
		.sort()
		.join('|');
}

export function replaceChannelConflicts(
	notes: readonly PianoConflictNote[],
	songIndex: number,
	channelIndex: number,
	held: readonly PianoIntentNote[]
): PianoConflictNote[] {
	return notes
		.filter((note) => note.songIndex !== songIndex || note.channelIndex !== channelIndex)
		.concat(
			held.map((note) => ({
				songIndex,
				channelIndex,
				startRow: note.startRow,
				length: note.length,
				pitchIndex: note.pitchIndex,
				note: note.note,
				instrument: note.instrument,
				release: note.release
			}))
		);
}

export function heldConflictIntents(notes: readonly PianoConflictNote[]): PianoIntentNote[] {
	return notes.map((note) => ({
		startRow: note.startRow,
		length: note.length,
		pitchIndex: note.pitchIndex,
		note: note.note,
		instrument: note.instrument,
		release: note.release,
		bounded: true,
		preferred: false
	}));
}
