import { formatRowEditorNumber } from './row-editor-numeric';
import { midiFromPitchClass, PITCH_CLASS_NAMES, isPitchClassInScale } from './music-scales';

export const PIANO_MIN_MIDI = 36;
export const PIANO_MAX_MIDI = 107;
export const PIANO_BASE_OCTAVE = 4;

export const PIANO_ROWS = [
	{ startMidi: 36, endMidi: 59 },
	{ startMidi: 60, endMidi: 83 },
	{ startMidi: 84, endMidi: 107 }
] as const;

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

function midiToPitchClass(midi: number): number {
	return ((midi % 12) + 12) % 12;
}

export function midiToLabel(midi: number): string {
	const octave = Math.floor(midi / 12) - 1;
	return `${PITCH_CLASS_NAMES[midiToPitchClass(midi)]}${octave}`;
}

export function isWhiteKey(midi: number): boolean {
	return WHITE_PITCH_CLASSES.has(midiToPitchClass(midi));
}

export function blackKeyAfterWhite(whiteMidi: number, endMidi: number): number | null {
	const next = whiteMidi + 1;
	if (next > endMidi || isWhiteKey(next)) return null;
	return next;
}

export function isMidiInScale(
	midi: number,
	intervals: readonly number[],
	rootPitchClass: number
): boolean {
	return isPitchClassInScale(midiToPitchClass(midi), intervals, rootPitchClass);
}

export function selectedMidisToOffsets(midis: readonly number[]): number[] {
	if (midis.length === 0) return [];
	const sorted = uniqueSorted(midis);
	const root = sorted[0];
	return sorted.map((midi) => midi - root);
}

export function formatOffsetList(offsets: readonly number[], asHex: boolean): string {
	if (offsets.length === 0) return '';
	return offsets.map((offset) => formatRowEditorNumber(offset, asHex)).join(' ');
}

export function offsetsToMidis(
	offsets: readonly number[],
	rootPitchClass: number,
	octave = PIANO_BASE_OCTAVE,
	minMidi = PIANO_MIN_MIDI,
	maxMidi = PIANO_MAX_MIDI
): number[] {
	if (offsets.length === 0) return [];
	const placed = offsets.map(
		(offset) => midiFromPitchClass(rootPitchClass, octave) + offset
	);
	const shift = bestOctaveShift(placed, minMidi, maxMidi);
	return uniqueSorted(
		placed
			.map((midi) => midi + shift)
			.filter((midi) => midi >= minMidi && midi <= maxMidi)
	);
}

export function transposeMidis(
	midis: readonly number[],
	semitones: number,
	minMidi = PIANO_MIN_MIDI,
	maxMidi = PIANO_MAX_MIDI
): number[] {
	return uniqueSorted(midis.map((midi) => wrapMidi(midi + semitones, minMidi, maxMidi)));
}

export function rowsMatchOffsets(rows: readonly number[], offsets: readonly number[]): boolean {
	if (rows.length !== offsets.length) return false;
	return rows.every((row, index) => row === offsets[index]);
}

function uniqueSorted(values: readonly number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

function bestOctaveShift(midis: readonly number[], minMidi: number, maxMidi: number): number {
	const lowest = Math.min(...midis);
	const highest = Math.max(...midis);
	const minShift = Math.ceil((minMidi - highest) / 12) * 12;
	const maxShift = Math.floor((maxMidi - lowest) / 12) * 12;
	let bestShift = 0;
	let bestCount = -1;
	for (let shift = minShift; shift <= maxShift; shift += 12) {
		const count = midis.filter((midi) => {
			const next = midi + shift;
			return next >= minMidi && next <= maxMidi;
		}).length;
		if (count > bestCount || (count === bestCount && Math.abs(shift) < Math.abs(bestShift))) {
			bestCount = count;
			bestShift = shift;
		}
	}
	return bestShift;
}

function wrapMidi(midi: number, minMidi: number, maxMidi: number): number {
	let next = midi;
	while (next < minMidi) next += 12;
	while (next > maxMidi) next -= 12;
	return next;
}
