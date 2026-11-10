import { describe, expect, it } from 'vitest';
import {
	rangesOverlap,
	silencedIndexes,
	type OverlapNote
} from '@/lib/services/piano-roll/piano-roll-conflicts';

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
		const silent = silencedIndexes([
			note(0, 12, 30, true),
			note(2, 8, 42),
			note(4, 4, 55)
		]);
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
