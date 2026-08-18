import { describe, expect, it } from 'vitest';
import {
	blackKeyAfterWhite,
	formatOffsetList,
	isMidiInScale,
	isWhiteKey,
	midiToLabel,
	offsetsToMidis,
	PIANO_ROWS,
	PIANO_MAX_MIDI,
	PIANO_MIN_MIDI,
	rowsMatchOffsets,
	selectedMidisToOffsets,
	transposeMidis
} from '@/lib/utils/piano-helper';
import { getScaleById } from '@/lib/utils/music-scales';

describe('piano-helper', () => {
	it('converts selected keys into offsets from the lowest note', () => {
		expect(selectedMidisToOffsets([65, 68, 72, 75])).toEqual([0, 3, 7, 10]);
		expect(selectedMidisToOffsets([])).toEqual([]);
	});

	it('formats offsets in decimal and hex', () => {
		expect(formatOffsetList([0, 3, 7, 10], false)).toBe('0 3 7 10');
		expect(formatOffsetList([0, 3, 7, 10], true)).toBe('0 3 7 A');
	});

	it('maps table offsets onto the keyboard from the scale root', () => {
		expect(offsetsToMidis([0, 3, 7, 10], 5)).toEqual([65, 68, 72, 75]);
	});

	it('keeps a chord in place when it already fits on the keyboard', () => {
		expect(offsetsToMidis([-12, -8, -5], 0)).toEqual([48, 52, 55]);
	});

	it('keeps in-range chord tones and drops offsets wider than the keyboard', () => {
		expect(offsetsToMidis([0, 3, 7, 104], 5)).toEqual([65, 68, 72]);
	});

	it('wraps a single out-of-range offset onto the keyboard', () => {
		expect(offsetsToMidis([104], 5)).toEqual([97]);
	});

	it('transposes selected keys when the root changes', () => {
		expect(transposeMidis([65, 68, 72], -5)).toEqual([60, 63, 67]);
	});

	it('identifies white keys and scale membership', () => {
		const scale = getScaleById('minor-natural');
		expect(isWhiteKey(65)).toBe(true);
		expect(isWhiteKey(66)).toBe(false);
		expect(midiToLabel(65)).toBe('F4');
		expect(isMidiInScale(65, scale.intervals, 5)).toBe(true);
		expect(isMidiInScale(64, scale.intervals, 5)).toBe(false);
	});

	it('detects when table rows already match the chord offsets', () => {
		expect(rowsMatchOffsets([0, 3, 7], [0, 3, 7])).toBe(true);
		expect(rowsMatchOffsets([0], [0, 3, 7])).toBe(false);
	});

	it('places a black key after each white key that has a sharp', () => {
		expect(blackKeyAfterWhite(60, 71)).toBe(61);
		expect(blackKeyAfterWhite(64, 71)).toBeNull();
		expect(blackKeyAfterWhite(71, 71)).toBeNull();
	});

	it('lays out three rows of two octaves each', () => {
		expect(PIANO_ROWS).toHaveLength(3);
		const covered: number[] = [];
		for (const row of PIANO_ROWS) {
			expect(row.endMidi - row.startMidi + 1).toBe(24);
			for (let midi = row.startMidi; midi <= row.endMidi; midi++) {
				expect(covered).not.toContain(midi);
				covered.push(midi);
			}
		}
		expect(covered[0]).toBe(PIANO_MIN_MIDI);
		expect(covered[covered.length - 1]).toBe(PIANO_MAX_MIDI);
		expect(covered).toHaveLength(PIANO_MAX_MIDI - PIANO_MIN_MIDI + 1);
	});
});
