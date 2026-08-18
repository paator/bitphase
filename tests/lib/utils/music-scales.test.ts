import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SCALE_ID,
	getScaleById,
	isPitchClassInScale,
	midiFromPitchClass,
	MUSICAL_SCALES,
	scaleNoteNames
} from '@/lib/utils/music-scales';

describe('music-scales', () => {
	it('includes every requested scale with C-rooted intervals', () => {
		const byName = Object.fromEntries(
			MUSICAL_SCALES.map((scale) => [scale.name, scale.intervals])
		);
		expect(byName['Major']).toEqual([0, 2, 4, 5, 7, 9, 11]);
		expect(byName['Major Bebop']).toEqual([0, 2, 4, 5, 7, 8, 9, 11]);
		expect(byName['Major Pentatonic']).toEqual([0, 2, 4, 7, 9]);
		expect(byName['Minor Natural / Aeolian']).toEqual([0, 2, 3, 5, 7, 8, 10]);
		expect(byName['Minor Harmonic']).toEqual([0, 2, 3, 5, 7, 8, 11]);
		expect(byName['Minor Hungarian']).toEqual([0, 2, 3, 6, 7, 8, 11]);
		expect(byName['Minor Melodic']).toEqual([0, 2, 3, 5, 7, 9, 11]);
		expect(byName['Minor Neapolitan']).toEqual([0, 1, 3, 5, 7, 8, 11]);
		expect(byName['Minor Pentatonic']).toEqual([0, 3, 5, 7, 10]);
		expect(byName['Blues']).toEqual([0, 3, 5, 6, 7, 10]);
		expect(byName['Arabic']).toEqual([0, 1, 4, 5, 7, 8, 11]);
		expect(byName['Diminished']).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
		expect(byName['Phrygian']).toEqual([0, 1, 3, 5, 7, 8, 10]);
	});

	it('defaults to natural minor', () => {
		expect(getScaleById(DEFAULT_SCALE_ID).name).toBe('Minor Natural / Aeolian');
	});

	it('lists F natural minor notes', () => {
		const scale = getScaleById('minor-natural');
		expect(scaleNoteNames(scale.intervals, 5)).toEqual(['F', 'G', 'G#', 'A#', 'C', 'C#', 'D#']);
	});

	it('treats F minor scale membership by pitch class', () => {
		const scale = getScaleById('minor-natural');
		expect(isPitchClassInScale(5, scale.intervals, 5)).toBe(true);
		expect(isPitchClassInScale(7, scale.intervals, 5)).toBe(true);
		expect(isPitchClassInScale(4, scale.intervals, 5)).toBe(false);
	});

	it('maps C4 to MIDI 60', () => {
		expect(midiFromPitchClass(0, 4)).toBe(60);
		expect(midiFromPitchClass(5, 4)).toBe(65);
	});
});
