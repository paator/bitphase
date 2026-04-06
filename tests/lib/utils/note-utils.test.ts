import { describe, it, expect } from 'vitest';
import {
	midiNoteToNoteNameAndOctave,
	midiNoteToNoteString,
	formatNoteFromEnum
} from '@/lib/utils/note-utils';
import { NoteName } from '@/lib/models/song';

describe('note-utils MIDI', () => {
	describe('midiNoteToNoteNameAndOctave', () => {
		it('returns null for midiNote less than 0', () => {
			expect(midiNoteToNoteNameAndOctave(-1)).toBeNull();
		});

		it('returns null for midiNote greater than 127', () => {
			expect(midiNoteToNoteNameAndOctave(128)).toBeNull();
		});

		it('maps MIDI 60 (C4) to C and octave 4', () => {
			const result = midiNoteToNoteNameAndOctave(60);
			expect(result).not.toBeNull();
			expect(result!.noteName).toBe(NoteName.C);
			expect(result!.octave).toBe(4);
		});

		it('maps MIDI 0 to C and octave 0 (clamped from -1)', () => {
			const result = midiNoteToNoteNameAndOctave(0);
			expect(result).not.toBeNull();
			expect(result!.noteName).toBe(NoteName.C);
			expect(result!.octave).toBe(0);
		});

		it('maps MIDI 12 to C and octave 0', () => {
			const result = midiNoteToNoteNameAndOctave(12);
			expect(result).not.toBeNull();
			expect(result!.noteName).toBe(NoteName.C);
			expect(result!.octave).toBe(0);
		});

		it('maps MIDI 69 (A4) to A and octave 4', () => {
			const result = midiNoteToNoteNameAndOctave(69);
			expect(result).not.toBeNull();
			expect(result!.noteName).toBe(NoteName.A);
			expect(result!.octave).toBe(4);
		});

		it('maps MIDI 61 to C# and octave 4', () => {
			const result = midiNoteToNoteNameAndOctave(61);
			expect(result).not.toBeNull();
			expect(result!.noteName).toBe(NoteName.CSharp);
			expect(result!.octave).toBe(4);
		});

		it('clamps octave to 8 for high MIDI notes', () => {
			const result = midiNoteToNoteNameAndOctave(120);
			expect(result).not.toBeNull();
			expect(result!.noteName).toBe(NoteName.C);
			expect(result!.octave).toBe(8);
		});

		it('maps all 12 pitch classes correctly', () => {
			const expected: [number, NoteName][] = [
				[60, NoteName.C],
				[61, NoteName.CSharp],
				[62, NoteName.D],
				[63, NoteName.DSharp],
				[64, NoteName.E],
				[65, NoteName.F],
				[66, NoteName.FSharp],
				[67, NoteName.G],
				[68, NoteName.GSharp],
				[69, NoteName.A],
				[70, NoteName.ASharp],
				[71, NoteName.B]
			];
			for (const [midiNote, noteName] of expected) {
				const result = midiNoteToNoteNameAndOctave(midiNote);
				expect(result!.noteName).toBe(noteName);
			}
		});
	});

	describe('midiNoteToNoteString', () => {
		it('returns null for invalid midiNote', () => {
			expect(midiNoteToNoteString(-1)).toBeNull();
			expect(midiNoteToNoteString(128)).toBeNull();
		});

		it('returns tracker format for MIDI 60', () => {
			const result = midiNoteToNoteString(60);
			expect(result).toBe('C-4');
		});

		it('returns tracker format for MIDI 69', () => {
			const result = midiNoteToNoteString(69);
			expect(result).toBe('A-4');
		});

		it('matches formatNoteFromEnum for valid range', () => {
			for (const midiNote of [12, 24, 60, 72, 108]) {
				const str = midiNoteToNoteString(midiNote);
				const parsed = midiNoteToNoteNameAndOctave(midiNote);
				expect(parsed).not.toBeNull();
				expect(str).toBe(formatNoteFromEnum(parsed!.noteName, parsed!.octave));
			}
		});
	});
});
