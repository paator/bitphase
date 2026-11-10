import { describe, expect, it } from 'vitest';
import {
	conflictNotesSignature,
	heldConflictIntents,
	overlapsAny,
	planPianoIntents,
	rangesOverlap,
	replaceChannelConflicts,
	silencedIndexes,
	withoutSpots,
	type OverlapNote,
	type PianoConflictNote,
	type PianoIntentNote
} from '@/lib/services/piano-roll/piano-roll-conflicts';

function intent(
	startRow: number,
	length: number,
	pitchIndex: number,
	overrides: Partial<PianoIntentNote> = {}
): PianoIntentNote {
	return {
		startRow,
		length,
		pitchIndex,
		preferred: false,
		note: 'C-4',
		instrument: null,
		release: false,
		bounded: true,
		...overrides
	};
}

function note(
	startRow: number,
	length: number,
	pitchIndex: number,
	preferred = false
): OverlapNote {
	return { startRow, length, pitchIndex, preferred };
}

describe('piano roll overlap conflicts', () => {
	it('keeps both notes when their ranges do not meet', () => {
		const silent = silencedIndexes([note(0, 4, 10, true), note(4, 4, 12)]);
		expect([...silent]).toEqual([]);
		expect(rangesOverlap(0, 4, 4, 4)).toBe(false);
	});

	it('silences the whole lower note when a higher note overlaps any of it', () => {
		const silent = silencedIndexes([note(0, 16, 40, true), note(4, 4, 52)]);
		expect([...silent]).toEqual([0]);
	});

	it('silences a new lower note and leaves the higher one', () => {
		const silent = silencedIndexes([note(0, 8, 60, true), note(2, 4, 48)]);
		expect([...silent]).toEqual([1]);
	});

	it('lets the earlier note win when the pitch is the same', () => {
		const silent = silencedIndexes([note(0, 8, 40, true), note(4, 8, 40)]);
		expect([...silent]).toEqual([1]);
	});

	it('keeps the note already in the song when two notes start together', () => {
		const silent = silencedIndexes([note(4, 4, 40), note(4, 6, 40, true)]);
		expect([...silent]).toEqual([0]);
	});

	it('silences every note under the highest overlap', () => {
		const silent = silencedIndexes([note(0, 12, 30, true), note(2, 8, 42), note(4, 4, 55)]);
		expect([...silent].sort()).toEqual([0, 1]);
	});

	it('keeps a lower note that only overlaps another silenced note', () => {
		const silent = silencedIndexes([
			note(0, 6, 20, true),
			note(4, 6, 40, true),
			note(8, 4, 60)
		]);
		expect([...silent]).toEqual([1]);
	});
});

describe('piano roll intent planning', () => {
	it('detects overlaps against existing notes and inside the incoming group', () => {
		expect(overlapsAny([note(0, 4, 1)], [note(4, 2, 1)])).toBe(false);
		expect(overlapsAny([note(0, 4, 1)], [note(3, 2, 1)])).toBe(true);
		expect(overlapsAny([note(0, 4, 1), note(2, 2, 5)], [])).toBe(true);
	});

	it('drops notes sitting on the given spots', () => {
		const notes = [note(0, 2, 1), note(2, 2, 3), note(4, 2, 1)];
		expect(withoutSpots(notes, [{ startRow: 2, pitchIndex: 3 }])).toEqual([notes[0], notes[2]]);
	});

	it('splits intents into audible and silent and diffs them against the song', () => {
		const kept = intent(0, 4, 40);
		const stretched = intent(8, 2, 30);
		const fresh = intent(2, 2, 50);
		const plan = planPianoIntents(
			[kept, intent(8, 4, 30), fresh],
			[kept, stretched, intent(12, 2, 20)]
		);
		expect(plan.silent).toEqual([kept]);
		expect(plan.audible.map((item) => item.startRow)).toEqual([8, 2]);
		expect(plan.remove.map((item) => item.startRow)).toEqual([0, 12]);
		expect(plan.add).toEqual([fresh]);
		expect(plan.reshape).toEqual([intent(8, 4, 30)]);
	});

	it('swaps one channel of held conflicts and keeps a stable signature', () => {
		const other: PianoConflictNote = {
			songIndex: 0,
			channelIndex: 1,
			startRow: 0,
			length: 2,
			pitchIndex: 10,
			note: 'A#0',
			instrument: null,
			release: false
		};
		const stale = { ...other, channelIndex: 0 };
		const replaced = replaceChannelConflicts([other, stale], 0, 0, [
			intent(4, 2, 12, { release: true })
		]);
		expect(replaced).toEqual([
			other,
			{ ...other, channelIndex: 0, startRow: 4, pitchIndex: 12, note: 'C-4', release: true }
		]);
		expect(heldConflictIntents([other])).toEqual([intent(0, 2, 10, { note: 'A#0' })]);
		expect(conflictNotesSignature(replaced)).toBe(
			conflictNotesSignature([...replaced].reverse())
		);
		expect(conflictNotesSignature(replaced)).not.toBe(conflictNotesSignature([other]));
	});
});
