import { describe, it, expect } from 'vitest';
import { PatternService, MAX_PATTERN_ID } from '../../../../src/lib/services/pattern/pattern-service';
import {
	Pattern,
	Note,
	Effect,
	NoteName,
	EffectType
} from '../../../../src/lib/models/song';

describe('PatternService', () => {
	describe('findNextAvailablePatternId', () => {
		it('should return 0 when no patterns exist', () => {
			const result = PatternService.findNextAvailablePatternId({}, []);
			expect(result).toBe(0);
		});

		it('should return next available ID when patterns exist', () => {
			const patterns = {
				0: new Pattern(0),
				1: new Pattern(1),
				3: new Pattern(3)
			};
			const patternOrder = [0, 1, 3];
			const result = PatternService.findNextAvailablePatternId(patterns, patternOrder);
			expect(result).toBe(2);
		});

		it('should skip IDs used in pattern order', () => {
			const patterns = { 0: new Pattern(0) };
			const patternOrder = [0, 5, 10];
			const result = PatternService.findNextAvailablePatternId(patterns, patternOrder);
			expect(result).toBe(1);
		});

		it('should reuse unused empty patterns', () => {
			const patterns = {
				0: new Pattern(0),
				1: new Pattern(1),
				2: new Pattern(2)
			};
			expect(PatternService.findNextAvailablePatternId(patterns, [0])).toBe(1);
		});

		it('should keep unused non-empty patterns reserved', () => {
			const reserved = new Pattern(1, 4);
			reserved.channels[0].rows[0].note = new Note(NoteName.C, 4);
			const patterns = { 0: new Pattern(0, 4), 1: reserved };
			expect(PatternService.findNextAvailablePatternId(patterns, [0])).toBe(2);
		});

		it('should return 99 when 0-98 are used', () => {
			const patternOrder = Array.from({ length: MAX_PATTERN_ID }, (_, id) => id);
			const patterns = Object.fromEntries(patternOrder.map((id) => [id, new Pattern(id)]));
			expect(PatternService.findNextAvailablePatternId(patterns, patternOrder)).toBe(MAX_PATTERN_ID);
		});

		it('should return null when all ids 00-99 are used', () => {
			const patternOrder = Array.from({ length: MAX_PATTERN_ID + 1 }, (_, id) => id);
			const patterns = Object.fromEntries(patternOrder.map((id) => [id, new Pattern(id)]));
			expect(PatternService.findNextAvailablePatternId(patterns, patternOrder)).toBeNull();
		});

		it('should recycle empty unused ids when they are not in the order', () => {
			const patternOrder = [0];
			const patterns = Object.fromEntries(
				Array.from({ length: MAX_PATTERN_ID + 1 }, (_, id) => [id, new Pattern(id)])
			);
			expect(PatternService.findNextAvailablePatternId(patterns, patternOrder)).toBe(1);
		});
	});

	describe('createEmptyPattern', () => {
		it('should create a pattern with default length', () => {
			const pattern = PatternService.createEmptyPattern(5);
			expect(pattern.id).toBe(5);
			expect(pattern.length).toBe(64);
			expect(pattern.channels).toHaveLength(3);
		});

		it('should create a pattern with specified length', () => {
			const pattern = PatternService.createEmptyPattern(10, undefined, undefined, 32);
			expect(pattern.id).toBe(10);
			expect(pattern.length).toBe(32);
		});
	});

	describe('isPatternEmpty', () => {
		it('should treat a new pattern as empty', () => {
			expect(PatternService.isPatternEmpty(new Pattern(3, 4))).toBe(true);
		});

		it('should treat a pattern with a note as not empty', () => {
			const pattern = new Pattern(3, 4);
			pattern.channels[0].rows[0].note = new Note(NoteName.Off, 0);
			expect(PatternService.isPatternEmpty(pattern)).toBe(false);
		});
	});

	describe('clonePattern', () => {
		it('should create a deep copy of a pattern', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[0].note = new Note(NoteName.C, 4);
			source.channels[0].rows[0].instrument = 5;
			source.channels[0].rows[0].volume = 10;
			source.channels[0].rows[0].effects[0] = new Effect(EffectType.Arpeggio, 0, 12);

			const cloned = PatternService.clonePattern(source, 1);

			expect(cloned.id).toBe(1);
			expect(cloned.length).toBe(4);
			expect(cloned.channels[0].rows[0].note.name).toBe(NoteName.C);
			expect(cloned.channels[0].rows[0].note.octave).toBe(4);
			expect(cloned.channels[0].rows[0].instrument).toBe(5);
			expect(cloned.channels[0].rows[0].volume).toBe(10);
			expect(cloned.channels[0].rows[0].effects[0]?.effect).toBe(EffectType.Arpeggio);
			expect(cloned).not.toBe(source);
			expect(cloned.channels[0].rows[0].note).not.toBe(source.channels[0].rows[0].note);
		});

		it('should clone pattern rows correctly', () => {
			const source = new Pattern(0, 2);
			source.patternRows[0].envelopeValue = 15;
			source.patternRows[0].noiseValue = 8;
			source.patternRows[0].envelopeEffect = new Effect(EffectType.Vibrato, 1, 5);

			const cloned = PatternService.clonePattern(source, 1);

			expect(cloned.patternRows[0].envelopeValue).toBe(15);
			expect(cloned.patternRows[0].noiseValue).toBe(8);
			expect(cloned.patternRows[0].envelopeEffect?.effect).toBe(EffectType.Vibrato);
			expect(cloned.patternRows[0].envelopeEffect).not.toBe(
				source.patternRows[0].envelopeEffect
			);
		});
	});

	describe('addPatternAfter', () => {
		it('should add a new pattern after the specified index', () => {
			const patterns = {
				0: new Pattern(0),
				1: new Pattern(1)
			};
			const patternOrder = [0, 1];

			const result = PatternService.addPatternAfter(patterns, patternOrder, 0);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 2, 1]);
			expect(result!.insertIndex).toBe(1);
			expect(result!.newPatternId).toBe(2);
			expect(result!.newPatterns[2]).toBeDefined();
			expect(result!.newPatterns[2].id).toBe(2);
		});

		it('should add pattern at the end when index is last', () => {
			const patterns = { 0: new Pattern(0) };
			const patternOrder = [0];

			const result = PatternService.addPatternAfter(patterns, patternOrder, 0);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 1]);
			expect(result!.insertIndex).toBe(1);
		});
	});

	describe('removePatternAt', () => {
		it('should remove pattern at specified index', () => {
			const patternOrder = [0, 1, 2, 3];

			const result = PatternService.removePatternAt(patternOrder, 1);

			expect(result.newPatternOrder).toEqual([0, 2, 3]);
			expect(result.adjustedCurrentIndex).toBe(1);
		});

		it('should not remove last pattern', () => {
			const patternOrder = [0];

			const result = PatternService.removePatternAt(patternOrder, 0);

			expect(result.newPatternOrder).toEqual([0]);
			expect(result.adjustedCurrentIndex).toBe(0);
		});

		it('should adjust index when removing last pattern', () => {
			const patternOrder = [0, 1, 2];

			const result = PatternService.removePatternAt(patternOrder, 2);

			expect(result.newPatternOrder).toEqual([0, 1]);
			expect(result.adjustedCurrentIndex).toBe(1);
		});
	});

	describe('clonePatternAfter', () => {
		it('should clone and insert pattern after index', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[0].note = new Note(NoteName.C, 4);
			const patterns = { 0: source };
			const patternOrder = [0];

			const result = PatternService.clonePatternAfter(patterns, patternOrder, 0, source);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 1]);
			expect(result!.newPatternId).toBe(1);
			expect(result!.newPatterns[1].channels[0].rows[0].note.name).toBe(NoteName.C);
		});

		it('should return null if target pattern is null', () => {
			const patterns = { 0: new Pattern(0) };
			const patternOrder = [0];

			const result = PatternService.clonePatternAfter(patterns, patternOrder, 0, null as any);

			expect(result).toBeNull();
		});
	});

	describe('clonePatternAfterMultiChip', () => {
		it('should insert a new pattern id in the order when there are no songs', () => {
			const result = PatternService.clonePatternAfterMultiChip([], [0, 1], 0, () => undefined);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 2, 1]);
			expect(result!.newPatternId).toBe(2);
			expect(result!.insertIndex).toBe(1);
			expect(result!.newPatternsPerSong).toEqual([]);
		});

		it('should clone source patterns when present', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[0].note = new Note(NoteName.C, 4);
			const allPatterns: Pattern[][] = [[source]];

			const result = PatternService.clonePatternAfterMultiChip(
				allPatterns,
				[0],
				0,
				() => undefined
			);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 1]);
			expect(result!.newPatternsPerSong[0]).toHaveLength(2);
			expect(result!.newPatternsPerSong[0][1].channels[0].rows[0].note.name).toBe(NoteName.C);
		});

		it('should reuse an unused empty pattern id without duplicating it', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[0].note = new Note(NoteName.C, 4);
			const leftover = new Pattern(1, 4);

			const result = PatternService.clonePatternAfterMultiChip(
				[[source, leftover]],
				[0],
				0,
				() => undefined
			);

			expect(result).not.toBeNull();
			expect(result!.newPatternId).toBe(1);
			expect(result!.newPatternsPerSong[0]).toHaveLength(2);
			expect(result!.newPatternsPerSong[0].filter((pattern) => pattern.id === 1)).toHaveLength(1);
			expect(result!.newPatternsPerSong[0].find((pattern) => pattern.id === 1)?.channels[0].rows[0].note.name).toBe(
				NoteName.C
			);
		});
	});

	describe('makePatternUnique', () => {
		it('should create unique copy and replace in order', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[0].note = new Note(NoteName.D, 5);
			const patterns = { 0: source };
			const patternOrder = [0, 0, 0];

			const result = PatternService.makePatternUnique(patterns, patternOrder, 1, source);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 1, 0]);
			expect(result!.newPatternId).toBe(1);
			expect(result!.newPatterns[1].channels[0].rows[0].note.name).toBe(NoteName.D);
		});

		it('should return null if target pattern is null', () => {
			const patterns = { 0: new Pattern(0) };
			const patternOrder = [0];

			const result = PatternService.makePatternUnique(patterns, patternOrder, 0, null as any);

			expect(result).toBeNull();
		});
	});

	describe('findNextAvailablePatternIdFromPatterns', () => {
		it('should return 0 when all pattern arrays are empty and order is empty', () => {
			const allPatterns: Pattern[][] = [[], []];
			expect(PatternService.findNextAvailablePatternIdFromPatterns(allPatterns, [])).toBe(0);
		});

		it('should return next ID after all used in order and in any song patterns', () => {
			const allPatterns: Pattern[][] = [
				[new Pattern(0), new Pattern(1)],
				[new Pattern(0), new Pattern(2)]
			];
			const patternOrder = [0, 1, 2];
			expect(PatternService.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder)).toBe(3);
		});

		it('should return null when all ids 00-99 are used', () => {
			const allPatterns = [Array.from({ length: MAX_PATTERN_ID + 1 }, (_, id) => new Pattern(id))];
			const patternOrder = Array.from({ length: MAX_PATTERN_ID + 1 }, (_, id) => id);

			expect(PatternService.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder)).toBeNull();
			expect(
				PatternService.addPatternAfterMultiChip(allPatterns, patternOrder, 99, () => undefined)
			).toBeNull();
			expect(
				PatternService.clonePatternAfterMultiChip(allPatterns, patternOrder, 99, () => undefined)
			).toBeNull();
			expect(
				PatternService.makePatternUniqueMultiChip(allPatterns, patternOrder, 99, () => undefined)
			).toBeNull();
		});
	});

	describe('makePatternUniqueMultiChip', () => {
		it('should clone each song pattern at index to new ID and update order', () => {
			const p0a = new Pattern(0, 4);
			p0a.channels[0].rows[0].note = new Note(NoteName.C, 3);
			const p1a = new Pattern(0, 4);
			p1a.channels[0].rows[0].note = new Note(NoteName.D, 5);
			const allPatterns: Pattern[][] = [
				[p0a, new Pattern(1)],
				[p1a, new Pattern(1)]
			];
			const patternOrder = [0, 1];

			const result = PatternService.makePatternUniqueMultiChip(
				allPatterns,
				patternOrder,
				0,
				() => undefined
			);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([2, 1]);
			expect(result!.updatedPatterns[0]).toHaveLength(3);
			expect(result!.updatedPatterns[1]).toHaveLength(3);
			const unique0 = result!.updatedPatterns[0].find((p) => p.id === 2);
			const unique1 = result!.updatedPatterns[1].find((p) => p.id === 2);
			expect(unique0).toBeDefined();
			expect(unique1).toBeDefined();
			expect(unique0!.channels[0].rows[0].note.name).toBe(NoteName.C);
			expect(unique0!.channels[0].rows[0].note.octave).toBe(3);
			expect(unique1!.channels[0].rows[0].note.name).toBe(NoteName.D);
			expect(unique1!.channels[0].rows[0].note.octave).toBe(5);
		});

		it('should leave song without pattern at that id unchanged', () => {
			const allPatterns: Pattern[][] = [
				[new Pattern(0)],
				[]
			];
			const patternOrder = [0];

			const result = PatternService.makePatternUniqueMultiChip(allPatterns, patternOrder, 0, () => undefined);

			expect(result).not.toBeNull();
			expect(result!.updatedPatterns[0]).toHaveLength(2);
			expect(result!.updatedPatterns[1]).toHaveLength(0);
		});

		it('should still update the order when there are no songs', () => {
			const result = PatternService.makePatternUniqueMultiChip([], [0, 0, 0], 1, () => undefined);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 1, 0]);
			expect(result!.updatedPatterns).toEqual([]);
		});

		it('should pick the first free id when there is a gap', () => {
			const allPatterns: Pattern[][] = [[new Pattern(0), new Pattern(1), new Pattern(5)]];
			const patternOrder = [0, 1, 5];

			const result = PatternService.makePatternUniqueMultiChip(
				allPatterns,
				patternOrder,
				2,
				() => undefined
			);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 1, 2]);
			expect(result!.updatedPatterns[0].find((p) => p.id === 2)).toBeDefined();
			expect(result!.updatedPatterns[0].find((p) => p.id === 5)).toBeDefined();
		});
	});

	describe('calculateAdjustedIndex', () => {
		it('should return same index if current is before removed', () => {
			const result = PatternService.calculateAdjustedIndex(2, 5, 10);
			expect(result).toBe(2);
		});

		it('should return min index if current equals removed', () => {
			const result = PatternService.calculateAdjustedIndex(5, 5, 10);
			expect(result).toBe(5);
		});

		it('should decrement index if current is after removed', () => {
			const result = PatternService.calculateAdjustedIndex(7, 5, 10);
			expect(result).toBe(6);
		});
	});

	describe('setPatternIdInOrder', () => {
		it('should set pattern ID at specific index', () => {
			const patterns = { 0: new Pattern(0), 5: new Pattern(5) };
			const patternOrder = [0, 0, 0];

			const result = PatternService.setPatternIdInOrder(patterns, patternOrder, 1, 5);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([0, 5, 0]);
		});

		it('should create new pattern if ID does not exist', () => {
			const patterns = { 0: new Pattern(0) };
			const patternOrder = [0];

			const result = PatternService.setPatternIdInOrder(patterns, patternOrder, 0, 3);

			expect(result).not.toBeNull();
			expect(result!.newPatterns[3]).toBeDefined();
			expect(result!.newPatternOrder).toEqual([3]);
		});

		it('should create an empty pattern when ID does not exist', () => {
			const current = new Pattern(0, 4);
			current.channels[0].rows[0].note = new Note(NoteName.E, 3);
			const patterns = { 0: current };
			const patternOrder = [0];

			const result = PatternService.setPatternIdInOrder(patterns, patternOrder, 0, 2);

			expect(result).not.toBeNull();
			expect(result!.newPatterns[2].channels[0].rows[0].note.name).toBe(NoteName.None);
			expect(result!.newPatterns[0].channels[0].rows[0].note.name).toBe(NoteName.E);
		});

		it('should reuse existing pattern content instead of creating a new one', () => {
			const existing = new Pattern(6, 4);
			existing.channels[0].rows[0].note = new Note(NoteName.C, 4);
			const patterns = { 0: new Pattern(0, 4), 6: existing };
			const patternOrder = [0];

			const result = PatternService.setPatternIdInOrder(patterns, patternOrder, 0, 6);

			expect(result).not.toBeNull();
			expect(result!.newPatternOrder).toEqual([6]);
			expect(result!.newPatterns[6].channels[0].rows[0].note.name).toBe(NoteName.C);
			expect(result!.newPatterns[6]).toBe(existing);
		});

		it('should return null for invalid pattern IDs', () => {
			const patterns = { 0: new Pattern(0) };
			const patternOrder = [0];

			expect(PatternService.setPatternIdInOrder(patterns, patternOrder, 0, -1)).toBeNull();
			expect(PatternService.setPatternIdInOrder(patterns, patternOrder, 0, 100)).toBeNull();
		});
	});

	describe('setPatternIdInOrderMultiChip', () => {
		it('should show existing pattern 06 then create empty 66', () => {
			const pattern06 = new Pattern(6, 4);
			pattern06.channels[0].rows[0].note = new Note(NoteName.G, 2);
			const allPatterns = [[new Pattern(0, 4), pattern06]];
			const getSchema = () => undefined;

			const afterFirstDigit = PatternService.setPatternIdInOrderMultiChip(
				allPatterns,
				[0],
				0,
				6,
				getSchema
			);

			expect(afterFirstDigit).not.toBeNull();
			expect(afterFirstDigit!.newPatternOrder).toEqual([6]);
			const reused = afterFirstDigit!.newPatternsPerSong[0].find((p) => p.id === 6);
			expect(reused?.channels[0].rows[0].note.name).toBe(NoteName.G);

			const afterSecondDigit = PatternService.setPatternIdInOrderMultiChip(
				afterFirstDigit!.newPatternsPerSong,
				afterFirstDigit!.newPatternOrder,
				0,
				66,
				getSchema
			);

			expect(afterSecondDigit).not.toBeNull();
			expect(afterSecondDigit!.newPatternOrder).toEqual([66]);
			const created = afterSecondDigit!.newPatternsPerSong[0].find((p) => p.id === 66);
			expect(created?.channels[0].rows[0].note.name).toBe(NoteName.None);
			const original06 = afterSecondDigit!.newPatternsPerSong[0].find((p) => p.id === 6);
			expect(original06?.channels[0].rows[0].note.name).toBe(NoteName.G);
		});
	});

	describe('findOrCreatePattern', () => {
		it('should find existing pattern', () => {
			const existing = new Pattern(5);
			const patterns = [existing];

			const result = PatternService.findOrCreatePattern(patterns, 5);

			expect(result.pattern).toBe(existing);
			expect(result.newPatterns).toBe(patterns);
		});

		it('should create new pattern if not found', () => {
			const patterns: Pattern[] = [];

			const result = PatternService.findOrCreatePattern(patterns, 3);

			expect(result.pattern.id).toBe(3);
			expect(result.newPatterns).toHaveLength(1);
			expect(result.newPatterns[0].id).toBe(3);
		});
	});

	describe('updatePatternInArray', () => {
		it('should update existing pattern in array', () => {
			const pattern1 = new Pattern(0);
			const pattern2 = new Pattern(1);
			const pattern3 = new Pattern(2);
			const patterns = [pattern1, pattern2, pattern3];

			const updated = new Pattern(1);
			updated.channels[0].rows[0].note = new Note(NoteName.F, 4);

			const result = PatternService.updatePatternInArray(patterns, updated);

			expect(result).toHaveLength(3);
			expect(result[1].id).toBe(1);
			expect(result[1].channels[0].rows[0].note.name).toBe(NoteName.F);
		});

		it('should return same array if pattern not found', () => {
			const patterns = [new Pattern(0), new Pattern(1)];
			const updated = new Pattern(5);

			const result = PatternService.updatePatternInArray(patterns, updated);

			expect(result).toBe(patterns);
		});
	});

	describe('insertRowAt', () => {
		it('inserts an empty row at the cursor and shifts following rows down without changing length', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[1].note = new Note(NoteName.C, 4);
			source.channels[0].rows[1].instrument = 3;
			source.channels[0].rows[2].note = new Note(NoteName.D, 4);
			source.channels[0].rows[3].note = new Note(NoteName.E, 4);
			source.patternRows[1].envelopeValue = 12;

			const result = PatternService.insertRowAt(source, 1);

			expect(result).not.toBeNull();
			expect(result!.length).toBe(4);
			expect(result!.channels[0].rows[1].note.name).toBe(NoteName.None);
			expect(result!.channels[0].rows[2].note.name).toBe(NoteName.C);
			expect(result!.channels[0].rows[2].instrument).toBe(3);
			expect(result!.channels[0].rows[3].note.name).toBe(NoteName.D);
			expect(result!.patternRows[2].envelopeValue).toBe(12);
		});

		it('returns null for out of range row index', () => {
			const source = new Pattern(0, 4);
			expect(PatternService.insertRowAt(source, -1)).toBeNull();
			expect(PatternService.insertRowAt(source, 4)).toBeNull();
		});
	});

	describe('removeRowAt', () => {
		it('removes the cursor row and shifts following rows up without changing length', () => {
			const source = new Pattern(0, 4);
			source.channels[0].rows[1].note = new Note(NoteName.C, 4);
			source.channels[0].rows[2].note = new Note(NoteName.D, 4);
			source.channels[0].rows[3].note = new Note(NoteName.E, 4);
			source.patternRows[2].noiseValue = 7;

			const result = PatternService.removeRowAt(source, 1);

			expect(result).not.toBeNull();
			expect(result!.length).toBe(4);
			expect(result!.channels[0].rows[1].note.name).toBe(NoteName.D);
			expect(result!.channels[0].rows[2].note.name).toBe(NoteName.E);
			expect(result!.channels[0].rows[3].note.name).toBe(NoteName.None);
			expect(result!.patternRows[1].noiseValue).toBe(7);
		});

		it('clears the only row when pattern length is 1', () => {
			const source = new Pattern(0, 1);
			source.channels[0].rows[0].note = new Note(NoteName.C, 4);

			const result = PatternService.removeRowAt(source, 0);

			expect(result).not.toBeNull();
			expect(result!.length).toBe(1);
			expect(result!.channels[0].rows[0].note.name).toBe(NoteName.None);
		});

		it('returns null for out of range row index', () => {
			const source = new Pattern(0, 4);
			expect(PatternService.removeRowAt(source, -1)).toBeNull();
			expect(PatternService.removeRowAt(source, 4)).toBeNull();
		});
	});

	describe('effect column layout', () => {
		it('creates empty patterns with the song-wide extra effect columns', () => {
			const source = new Pattern(0, 2);
			source.channels[2].effectColumnCount = 2;
			source.channels[2].rows.forEach((row) => {
				row.effects = [null, null];
			});

			const created = PatternService.createEmptyPattern(1, undefined, undefined, 2, [source]);

			expect(created.channels[2].effectColumnCount).toBe(2);
			expect(created.channels[2].rows[0].effects).toHaveLength(2);
			expect(created.channels[0].effectColumnCount).toBe(1);
		});

		it('clones using the widest effect columns in the song', () => {
			const narrow = new Pattern(1, 2);
			const wide = new Pattern(0, 2);
			wide.channels[2].effectColumnCount = 2;
			wide.channels[2].rows.forEach((row) => {
				row.effects = [null, null];
			});

			const cloned = PatternService.clonePattern(narrow, 2, undefined, [wide, narrow]);

			expect(cloned.channels[2].effectColumnCount).toBe(2);
			expect(cloned.channels[2].rows[0].effects).toHaveLength(2);
		});

		it('keeps effect columns when resizing a pattern', () => {
			const source = new Pattern(0, 2);
			source.channels[0].effectColumnCount = 3;
			source.channels[0].rows.forEach((row) => {
				row.effects = [null, null, null];
			});

			const resized = PatternService.resizePattern(source, 4);

			expect(resized.channels[0].effectColumnCount).toBe(3);
			expect(resized.channels[0].rows[0].effects).toHaveLength(3);
			expect(resized.channels[0].rows[3].effects).toHaveLength(3);
		});

		it('copies extra effect columns onto a new pattern', () => {
			const source = new Pattern(0, 2);
			source.channels[0].effectColumnCount = 3;
			source.channels[0].rows[0].effects = [null, null, null];
			const target = new Pattern(1, 2);

			PatternService.copyChannelEffectColumnLayout(source, target);

			expect(target.channels[0].effectColumnCount).toBe(3);
			expect(target.channels[0].rows[0].effects).toHaveLength(3);
			expect(target.channels[1].effectColumnCount).toBe(1);
		});

		it('pads and truncates effect slots across all patterns', () => {
			const first = new Pattern(0, 1);
			const second = new Pattern(1, 1);
			first.channels[0].rows[0].effects = [
				new Effect(EffectType.Arpeggio, 0, 1),
				new Effect(EffectType.Vibrato, 0, 2)
			];
			first.channels[0].effectColumnCount = 2;
			second.channels[0].effectColumnCount = 2;
			second.channels[0].rows[0].effects = [null, null];

			const expanded = PatternService.setChannelEffectColumnCount([first, second], 0, 3);
			expect(expanded[0].channels[0].effectColumnCount).toBe(3);
			expect(expanded[0].channels[0].rows[0].effects).toHaveLength(3);
			expect(expanded[0].channels[0].rows[0].effects[0]?.effect).toBe(EffectType.Arpeggio);
			expect(expanded[1].channels[0].rows[0].effects).toHaveLength(3);

			const reduced = PatternService.setChannelEffectColumnCount(expanded, 0, 1);
			expect(reduced[0].channels[0].effectColumnCount).toBe(1);
			expect(reduced[0].channels[0].rows[0].effects).toHaveLength(1);
			expect(reduced[0].channels[0].rows[0].effects[0]?.effect).toBe(EffectType.Arpeggio);
		});

		it('clones extra effect columns', () => {
			const source = new Pattern(0, 1);
			source.channels[0].effectColumnCount = 2;
			source.channels[0].rows[0].effects = [
				new Effect(EffectType.Arpeggio, 0, 12),
				new Effect(EffectType.Vibrato, 1, 5)
			];

			const cloned = PatternService.clonePattern(source, 2);
			expect(cloned.channels[0].effectColumnCount).toBe(2);
			expect(cloned.channels[0].rows[0].effects).toHaveLength(2);
			expect(cloned.channels[0].rows[0].effects[1]?.effect).toBe(EffectType.Vibrato);
			expect(cloned.channels[0].rows[0].effects[1]).not.toBe(source.channels[0].rows[0].effects[1]);
		});
	});
});
