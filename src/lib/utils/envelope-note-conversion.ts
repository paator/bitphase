import { NoteName, type Note } from '../models/song';
import { parseNoteFromString, formatNoteFromEnum } from './note-utils';

export function noteToEnvelopePeriod(noteIndex: number, tuningTable: number[]): number {
	if (noteIndex < 0 || noteIndex >= tuningTable.length) {
		return 0;
	}
	return Math.round(tuningTable[noteIndex] / 16);
}

export function envelopePeriodToNote(envelopePeriod: number, tuningTable: number[]): number | null {
	if (envelopePeriod === 0) {
		return null;
	}

	let nearestNote = -1;
	let bestDistance = Infinity;

	for (let i = 0; i < tuningTable.length; i++) {
		const noteEnvelopePeriod = Math.round(tuningTable[i] / 16);
		if (noteEnvelopePeriod === envelopePeriod) {
			return i;
		}

		const distance = Math.abs(noteEnvelopePeriod - envelopePeriod);
		if (distance < bestDistance) {
			bestDistance = distance;
			nearestNote = i;
		}
	}

	return nearestNote >= 0 ? nearestNote : null;
}

export function noteStringToEnvelopePeriod(
	noteStr: string,
	tuningTable: number[],
	currentOctave: number
): number {
	if (noteStr === '---' || noteStr === 'OFF' || noteStr === '===') {
		return 0;
	}

	const parsed = parseNoteFromString(noteStr);
	if (
		parsed.noteName === NoteName.None ||
		parsed.noteName === NoteName.Off ||
		parsed.noteName === NoteName.Release
	) {
		return 0;
	}

	const noteIndex = (parsed.octave - 1) * 12 + (parsed.noteName - 2);
	if (noteIndex < 0 || noteIndex >= tuningTable.length) {
		return 0;
	}

	return noteToEnvelopePeriod(noteIndex, tuningTable);
}

export function envelopePeriodToNoteString(
	envelopePeriod: number,
	tuningTable: number[]
): string | null {
	if (envelopePeriod === 0) {
		return null;
	}

	const noteIndex = envelopePeriodToNote(envelopePeriod, tuningTable);
	if (noteIndex === null) {
		return null;
	}

	const octave = Math.floor(noteIndex / 12) + 1;
	const noteName = (noteIndex % 12) + 2;

	if (noteName < 2 || noteName > 13) {
		return null;
	}

	return formatNoteFromEnum(noteName as NoteName, octave);
}
