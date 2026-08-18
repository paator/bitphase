export const PITCH_CLASS_NAMES = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B'
] as const;

export type ScaleDefinition = {
	id: string;
	name: string;
	intervals: readonly number[];
};

export const MUSICAL_SCALES: ScaleDefinition[] = [
	{ id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
	{ id: 'major-bebop', name: 'Major Bebop', intervals: [0, 2, 4, 5, 7, 8, 9, 11] },
	{ id: 'major-pentatonic', name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
	{ id: 'minor-natural', name: 'Minor Natural / Aeolian', intervals: [0, 2, 3, 5, 7, 8, 10] },
	{ id: 'minor-harmonic', name: 'Minor Harmonic', intervals: [0, 2, 3, 5, 7, 8, 11] },
	{ id: 'minor-hungarian', name: 'Minor Hungarian', intervals: [0, 2, 3, 6, 7, 8, 11] },
	{ id: 'minor-melodic', name: 'Minor Melodic', intervals: [0, 2, 3, 5, 7, 9, 11] },
	{ id: 'minor-neapolitan', name: 'Minor Neapolitan', intervals: [0, 1, 3, 5, 7, 8, 11] },
	{ id: 'minor-pentatonic', name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
	{ id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
	{ id: 'arabic', name: 'Arabic', intervals: [0, 1, 4, 5, 7, 8, 11] },
	{ id: 'diminished', name: 'Diminished', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
	{ id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
	{ id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
	{ id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
	{ id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
	{ id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
	{ id: 'whole-tone', name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
	{ id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
];

export const DEFAULT_SCALE_ID = 'minor-natural';
export const DEFAULT_ROOT_PITCH_CLASS = 0;

export function getScaleById(id: string): ScaleDefinition {
	return MUSICAL_SCALES.find((scale) => scale.id === id) ?? MUSICAL_SCALES[0];
}

export function midiFromPitchClass(pitchClass: number, octave: number): number {
	return (octave + 1) * 12 + pitchClass;
}

export function scaleNoteNames(intervals: readonly number[], rootPitchClass: number): string[] {
	return intervals.map((interval) => PITCH_CLASS_NAMES[(rootPitchClass + interval) % 12]);
}

export function isPitchClassInScale(
	pitchClass: number,
	intervals: readonly number[],
	rootPitchClass: number
): boolean {
	return intervals.includes((pitchClass - rootPitchClass + 12) % 12);
}
