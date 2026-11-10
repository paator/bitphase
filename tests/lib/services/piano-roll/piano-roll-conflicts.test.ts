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

	it('restores a held note once the note above it moves out of the way', () => {
		const higher = intent(4, 4, 50, { preferred: true });
		const held = intent(0, 4, 38);
		const plan = planPianoIntents([higher, held], [higher]);
		expect(plan.silent).toEqual([]);
		expect(plan.add).toEqual([held]);
		expect(plan.remove).toEqual([]);
		expect(plan.reshape).toEqual([]);
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

	it('keeps the note fields of held conflicts', () => {
		const fields = { instrument: 2, volume: 9, table: 3 };
		const [held] = replaceChannelConflicts([], 0, 0, [intent(4, 2, 12, { fields })]);
		expect(held).toMatchObject({ startRow: 4, fields });
		expect(heldConflictIntents([held!])[0]).toMatchObject({ startRow: 4, fields });
		const [plain] = replaceChannelConflicts([], 0, 0, [intent(0, 2, 12)]);
		expect(plain).not.toHaveProperty('fields');
	});
});

describe('piano roll conflicts at scale', () => {
	function randomNotes(seed: number, count: number): OverlapNote[] {
		let state = seed;
		const next = (limit: number) => {
			state = (state * 1103515245 + 12345) % 2147483648;
			return state % limit;
		};
		return Array.from({ length: count }, () => ({
			startRow: next(80),
			length: next(6),
			pitchIndex: next(4),
			preferred: next(2) === 0
		}));
	}

	function overlaps(left: OverlapNote, right: OverlapNote): boolean {
		return rangesOverlap(left.startRow, left.length, right.startRow, right.length);
	}

	function bruteSilenced(notes: readonly OverlapNote[]): Set<number> {
		const beats = (index: number, otherIndex: number) => {
			const note = notes[index]!;
			const other = notes[otherIndex]!;
			if (note.length < 1 || other.length < 1 || !overlaps(note, other)) return false;
			if (other.pitchIndex !== note.pitchIndex) return other.pitchIndex > note.pitchIndex;
			if (other.startRow !== note.startRow) return other.startRow < note.startRow;
			if (other.preferred !== note.preferred) return other.preferred;
			return otherIndex < index;
		};
		const empty = (index: number) => notes[index]!.length < 1;
		let silent = new Set(notes.map((_, index) => index).filter(empty));
		for (let pass = 0; pass < notes.length; pass++) {
			const next = new Set([...silent].filter(empty));
			notes.forEach((_, index) => {
				if (next.has(index)) return;
				if (
					notes.some(
						(__, other) => other !== index && !silent.has(other) && beats(index, other)
					)
				)
					next.add(index);
			});
			if (next.size === silent.size && [...next].every((index) => silent.has(index)))
				return next;
			silent = next;
		}
		return silent;
	}

	it('silences the same notes as the exhaustive comparison', () => {
		for (let seed = 1; seed <= 40; seed++) {
			const notes = randomNotes(seed, 30);
			expect([...silencedIndexes(notes)].sort((a, b) => a - b)).toEqual(
				[...bruteSilenced(notes)].sort((a, b) => a - b)
			);
		}
	});

	it('detects overlaps the same way as the exhaustive comparison', () => {
		for (let seed = 1; seed <= 40; seed++) {
			const notes = randomNotes(seed, 12);
			const incoming = notes.slice(0, 4);
			const existing = notes.slice(4);
			const expected = incoming.some(
				(note) =>
					existing.some((other) => overlaps(note, other)) ||
					incoming.some((other) => other !== note && overlaps(note, other))
			);
			expect(overlapsAny(incoming, existing)).toBe(expected);
		}
	});

	it('plans thousands of notes quickly', () => {
		const current = Array.from({ length: 5000 }, (_, index) =>
			intent(index * 4, 4, index % 48)
		);
		const started = performance.now();
		const plan = planPianoIntents([...current, intent(2, 4, 60)], current);
		expect(performance.now() - started).toBeLessThan(200);
		expect(plan.remove).toHaveLength(2);
		expect(plan.add).toHaveLength(1);
	});
});
