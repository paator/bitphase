import { indexBySpot, noteSpotKey, sameNoteSpot, type PianoNoteSpot } from './piano-roll-notes';
import type { PianoNoteFields } from './piano-note-fields';
import { eachRepeatedPatternPlacement, type PianoTimelineSpan } from './piano-roll-timeline';

export interface OverlapNote extends PianoNoteSpot {
	length: number;
	preferred: boolean;
}

export interface PianoIntentNote extends OverlapNote {
	note: string;
	instrument: number | null;
	release: boolean;
	bounded: boolean;
	fields?: PianoNoteFields;
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
	fields?: PianoNoteFields;
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

function eachOverlap(
	notes: readonly { startRow: number; length: number }[],
	visit: (index: number, otherIndex: number) => boolean | void
): void {
	const order = notes
		.map((_, index) => index)
		.sort((left, right) => notes[left]!.startRow - notes[right]!.startRow);
	for (let position = 0; position < order.length; position++) {
		const index = order[position]!;
		const note = notes[index]!;
		const end = note.startRow + note.length;
		for (let next = position + 1; next < order.length; next++) {
			const otherIndex = order[next]!;
			const other = notes[otherIndex]!;
			if (other.startRow >= end) break;
			if (notesOverlap(note, other) && visit(index, otherIndex)) return;
		}
	}
}

export function overlapsAny(
	incoming: readonly { startRow: number; length: number }[],
	existing: readonly { startRow: number; length: number }[]
): boolean {
	let found = false;
	eachOverlap([...incoming, ...existing], (index, otherIndex) => {
		found = index < incoming.length || otherIndex < incoming.length;
		return found;
	});
	return found;
}

function overlapNeighbours(notes: readonly OverlapNote[]): number[][] {
	const neighbours = notes.map((): number[] => []);
	eachOverlap(notes, (index, otherIndex) => {
		neighbours[index]!.push(otherIndex);
		neighbours[otherIndex]!.push(index);
	});
	return neighbours;
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
	const neighbours = overlapNeighbours(notes);
	let silent = new Set<number>();
	for (let index = 0; index < notes.length; index++) {
		if (empty(index)) silent.add(index);
	}
	for (let pass = 0; pass < notes.length; pass++) {
		const next = new Set<number>([...silent].filter(empty));
		for (let index = 0; index < notes.length; index++) {
			if (next.has(index)) continue;
			for (const otherIndex of neighbours[index]!) {
				if (silent.has(otherIndex)) continue;
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
	const audibleSpots = indexBySpot(audible);
	const currentSpots = indexBySpot(current);
	return {
		audible,
		silent,
		remove: current.filter((note) => !audibleSpots.has(noteSpotKey(note))),
		add: audible.filter((note) => !currentSpots.has(noteSpotKey(note))),
		reshape: audible.filter((note) => {
			const existing = currentSpots.get(noteSpotKey(note));
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
				release: note.release,
				...withFields(note.fields)
			}))
		);
}

export function expandConflictsAcrossRepeatedPatterns(
	timeline: readonly PianoTimelineSpan[],
	notes: readonly PianoConflictNote[]
): PianoConflictNote[] {
	const expanded: PianoConflictNote[] = [];
	const seen = new Set<string>();
	for (const note of notes) {
		const mirrored = eachRepeatedPatternPlacement(timeline, note.startRow, (startRow) => ({
			...note,
			startRow
		}));
		const copies = mirrored.length > 0 ? mirrored : [note];
		for (const copy of copies) {
			const key = `${copy.songIndex}:${copy.channelIndex}:${copy.startRow}:${copy.length}:${copy.pitchIndex}:${copy.note}`;
			if (seen.has(key)) continue;
			seen.add(key);
			expanded.push(copy);
		}
	}
	return expanded;
}

export function expandSpotsAcrossRepeatedPatterns<T extends PianoNoteSpot>(
	timeline: readonly PianoTimelineSpan[],
	spots: readonly T[]
): T[] {
	const expanded: T[] = [];
	const seen = new Set<string>();
	for (const spot of spots) {
		const mirrored = eachRepeatedPatternPlacement(timeline, spot.startRow, (startRow) => ({
			...spot,
			startRow
		}));
		const copies = mirrored.length > 0 ? mirrored : [spot];
		for (const copy of copies) {
			const key = noteSpotKey(copy);
			if (seen.has(key)) continue;
			seen.add(key);
			expanded.push(copy);
		}
	}
	return expanded;
}

function withFields(fields: PianoNoteFields | undefined): { fields?: PianoNoteFields } {
	return fields ? { fields } : {};
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
		preferred: false,
		...withFields(note.fields)
	}));
}
