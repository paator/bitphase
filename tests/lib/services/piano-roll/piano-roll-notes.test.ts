import { describe, expect, it } from 'vitest';
import type { GenericRow } from '@/lib/models/song/generic';
import {
	blockLength,
	collectPianoNotes,
	noteLevelAlpha,
	noteSpotKey,
	ornamentSteps,
	sameNoteSpot
} from '@/lib/services/piano-roll/piano-roll-notes';

function rows(notes: string[]): GenericRow[] {
	return notes.map((note) => ({ note }));
}

describe('piano roll notes', () => {
	it('draws a note until the next gate or note', () => {
		const notes = collectPianoNotes(
			rows(['C-4', '---', '---', 'OFF', '---', 'E-4', '===', '---']),
			'note'
		);
		expect(notes.blocks).toEqual([
			{ startRow: 0, endRow: 3, pitchIndex: 36, note: 'C-4', instrument: null, gestures: [] },
			{ startRow: 5, endRow: 6, pitchIndex: 40, note: 'E-4', instrument: null, gestures: [] }
		]);
		expect(notes.gates).toEqual([
			{ row: 3, kind: 'off' },
			{ row: 6, kind: 'release' }
		]);
	});

	it('extends a note to the pattern end when nothing follows', () => {
		const notes = collectPianoNotes(rows(['A-2', '---', '---', '---']), 'note');
		expect(notes.blocks[0]).toMatchObject({ startRow: 0, endRow: 4, pitchIndex: 21 });
	});

	it('reads the instrument written on the note row', () => {
		const notes = collectPianoNotes(
			[
				{ note: 'C-4', instrument: 3 },
				{ note: 'E-4', instrument: 0 }
			],
			'note'
		);
		expect(notes.blocks.map((block) => block.instrument)).toEqual([3, null]);
	});

	it('compares notes by start row and pitch', () => {
		expect(sameNoteSpot({ startRow: 2, pitchIndex: 5 }, { startRow: 2, pitchIndex: 5 })).toBe(
			true
		);
		expect(sameNoteSpot({ startRow: 2, pitchIndex: 5 }, { startRow: 2, pitchIndex: 6 })).toBe(
			false
		);
		expect(noteSpotKey({ startRow: 2, pitchIndex: 5 })).toBe('2:5');
		expect(blockLength({ startRow: 4, endRow: 4 })).toBe(1);
		expect(blockLength({ startRow: 4, endRow: 7 })).toBe(3);
	});
});

describe('piano roll effect pictures', () => {
	it('tilts a slide that continues inside the note and skips an unsupported command', () => {
		const notes = collectPianoNotes(
			[
				{ note: 'C-4', effect: { effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x20 } },
				{ note: '---', effect: { effect: 2, delay: 0, parameter: 0x30 } },
				{ note: 'OFF', effect: { effect: 2, delay: 0, parameter: 0x30 } }
			],
			'note'
		);
		expect(notes.blocks[0]?.gestures).toEqual([{ kind: 'slide-up', amount: 1 }]);
	});

	it('bends portamento from the previous note', () => {
		const notes = collectPianoNotes(
			[
				{ note: 'C-4' },
				{ note: 'OFF' },
				{ note: 'E-4', effect: { effect: 'P'.charCodeAt(0), delay: 1, parameter: 0x18 } }
			],
			'note'
		);
		expect(notes.blocks[1]?.gestures).toEqual([
			{ kind: 'portamento', amount: 0.5, fromPitch: 36 }
		]);
	});

	it('reads a gesture from a later effect column', () => {
		const notes = collectPianoNotes(
			[{ note: 'C-4', effect1: { effect: 'V'.charCodeAt(0), delay: 0, parameter: 0x48 } }],
			'note'
		);
		expect(notes.blocks[0]?.gestures).toEqual([
			{ kind: 'vibrato', speed: 4 / 15, depth: 8 / 15 }
		]);
	});

	it('uses the supplied picture and drops commands that have none', () => {
		const notes = collectPianoNotes(
			[{ note: 'A-2', effect: { effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x14 } }],
			'note',
			{
				gestureFor: (effect) =>
					effect.delay === 2 ? { kind: 'slide-up', amount: 0.5 } : null
			}
		);
		expect(notes.blocks[0]?.gestures).toEqual([{ kind: 'slide-up', amount: 0.5 }]);
	});

	it('fades a note from the amplitude column and keeps that level for the next pattern', () => {
		const amplitude = [{ key: 'volume', max: 15, allowZeroValue: true }];
		const amplitudeCarry = new Map<string, number>();
		const first = collectPianoNotes(
			[
				{ note: 'C-4', volume: 15 },
				{ note: '---', volume: 8 },
				{ note: 'E-4' },
				{ note: 'G-4', volume: -1 },
				{ note: 'OFF' }
			],
			'note',
			{ amplitude, amplitudeCarry }
		);
		expect(first.blocks.map((block) => block.level)).toEqual([1, 8 / 15, 0]);
		const next = collectPianoNotes([{ note: 'G-4' }, { note: 'A-4', volume: 0 }], 'note', {
			amplitude,
			amplitudeCarry
		});
		expect(next.blocks.map((block) => block.level)).toEqual([0, 0]);
		expect(noteLevelAlpha(1)).toBeCloseTo(0.92);
		expect(noteLevelAlpha(0)).toBeCloseTo(0.26);
		expect(noteLevelAlpha(0.5)).toBeLessThan(0.55);
		expect(noteLevelAlpha(null)).toBeCloseTo(0.92);
	});

	it('uses the louder side when a chip has two amplitude columns', () => {
		const amplitude = [
			{ key: 'left', max: 15, allowZeroValue: true },
			{ key: 'right', max: 15, allowZeroValue: true }
		];
		const notes = collectPianoNotes(
			[
				{ note: 'C-4', left: 2, right: 15 },
				{ note: 'E-4', left: -1 }
			],
			'note',
			{ amplitude }
		);
		expect(notes.blocks.map((block) => block.level)).toEqual([1, 1]);
	});

	it('draws a pattern table as an arpeggio and carries it to the next note', () => {
		const lookup = (id: number) => {
			if (id === 0) return { rows: [0, 4, 7], additive: false };
			if (id === 1) return { rows: [0, 3, 4], additive: true };
			return null;
		};
		const carry = { id: null as number | null };
		const notes = collectPianoNotes(
			[
				{ note: 'C-4', table: 1 },
				{ note: '---' },
				{ note: 'E-4' },
				{ note: 'G-4', table: 2 },
				{ note: 'OFF' },
				{ note: 'A-4', table: -1 }
			],
			'note',
			{ ornament: { lookup, carry } }
		);
		expect(notes.blocks.map((block) => block.gestures)).toEqual([
			[{ kind: 'arpeggio', steps: [4, 7] }],
			[{ kind: 'arpeggio', steps: [4, 7] }],
			[{ kind: 'arpeggio', steps: [3, 7] }],
			[]
		]);
		expect(ornamentSteps([0, 4, 7], false)).toEqual([4, 7]);
		expect(ornamentSteps([0, 3, 4], true)).toEqual([3, 7]);
	});
});
