import { NoteName } from '../models/song';

const MIDI_PITCH_TO_NOTE_NAME: NoteName[] = [
	NoteName.C,
	NoteName.CSharp,
	NoteName.D,
	NoteName.DSharp,
	NoteName.E,
	NoteName.F,
	NoteName.FSharp,
	NoteName.G,
	NoteName.GSharp,
	NoteName.A,
	NoteName.ASharp,
	NoteName.B
];

export const TUNING_TABLE_NOTE_COUNT = 96;
export const TUNING_TABLE_OCTAVE_MIN = 1;
export const TUNING_TABLE_OCTAVE_MAX = 8;

export function noteToTuningTableIndex(noteName: NoteName, octave: number): number | null {
	if (noteName <= NoteName.Off) {
		return null;
	}
	const noteIndex = (octave - 1) * 12 + (noteName - NoteName.C);
	if (noteIndex < 0 || noteIndex >= TUNING_TABLE_NOTE_COUNT) {
		return null;
	}
	return noteIndex;
}

export function tuningTableIndexToNote(noteIndex: number): {
	noteName: NoteName;
	octave: number;
} | null {
	if (noteIndex < 0 || noteIndex >= TUNING_TABLE_NOTE_COUNT) {
		return null;
	}
	return {
		octave: Math.floor(noteIndex / 12) + 1,
		noteName: (noteIndex % 12) + NoteName.C
	};
}

export function isNoteInTuningTable(noteName: NoteName, octave: number): boolean {
	return noteToTuningTableIndex(noteName, octave) !== null;
}

export function isTrackerNoteStringInTuningTable(noteStr: string): boolean {
	if (noteStr === '---' || noteStr === 'OFF' || noteStr === '===' || noteStr === 'R--') {
		return true;
	}
	const { noteName, octave } = parseNoteFromString(noteStr);
	return isNoteInTuningTable(noteName, octave);
}

export function midiNoteToNoteNameAndOctave(
	midiNote: number
): { noteName: NoteName; octave: number } | null {
	if (midiNote < 0 || midiNote > 127) {
		return null;
	}
	const pitchClass = midiNote % 12;
	const octave = Math.floor(midiNote / 12) - 1;
	const noteName = MIDI_PITCH_TO_NOTE_NAME[pitchClass];
	if (!isNoteInTuningTable(noteName, octave)) {
		return null;
	}
	return { noteName, octave };
}

export function midiNoteToNoteString(midiNote: number): string | null {
	const parsed = midiNoteToNoteNameAndOctave(midiNote);
	if (!parsed) return null;
	return formatNoteFromEnum(parsed.noteName, parsed.octave);
}

export function formatNoteFromEnum(noteName: NoteName, octave: number): string {
	const notes = [
		'---',
		'OFF',
		'C-',
		'C#',
		'D-',
		'D#',
		'E-',
		'F-',
		'F#',
		'G-',
		'G#',
		'A-',
		'A#',
		'B-'
	];
	if (noteName === NoteName.None) return '---';
	if (noteName === NoteName.Off) return 'OFF';
	if (noteName === NoteName.Release) return '===';
	return notes[noteName] + octave;
}

export function isPitchedNoteName(noteName: NoteName): boolean {
	return noteName >= NoteName.C && noteName <= NoteName.B;
}

export function parseNoteFromString(noteStr: string): { noteName: NoteName; octave: number } {
	if (noteStr === '---') {
		return { noteName: NoteName.None, octave: 0 };
	}
	if (noteStr === 'OFF' || noteStr === 'R--') {
		return { noteName: NoteName.Off, octave: 0 };
	}
	if (noteStr === '===') {
		return { noteName: NoteName.Release, octave: 0 };
	}

	const sharpMatch = noteStr.match(/^([A-G]#)(\d)$/);
	if (sharpMatch) {
		return {
			noteName: parseNoteName(sharpMatch[1]),
			octave: parseInt(sharpMatch[2], 10)
		};
	}

	const naturalMatch = noteStr.match(/^([A-G]-)(\d)$/);
	if (naturalMatch) {
		return {
			noteName: parseNoteName(naturalMatch[1]),
			octave: parseInt(naturalMatch[2], 10)
		};
	}

	return { noteName: NoteName.None, octave: 0 };
}

function parseNoteName(noteStr: string): NoteName {
	const notes: Record<string, NoteName> = {
		'C-': NoteName.C,
		'C#': NoteName.CSharp,
		'D-': NoteName.D,
		'D#': NoteName.DSharp,
		'E-': NoteName.E,
		'F-': NoteName.F,
		'F#': NoteName.FSharp,
		'G-': NoteName.G,
		'G#': NoteName.GSharp,
		'A-': NoteName.A,
		'A#': NoteName.ASharp,
		'B-': NoteName.B
	};
	return notes[noteStr] ?? NoteName.None;
}
