import { describe, expect, it } from 'vitest';
import type { GenericPattern, GenericRow } from '@/lib/models/song/generic';
import {
	capturePianoNote,
	clipboardFromCaptures,
	pastePianoNotes,
	type CapturedPianoNote
} from '@/lib/services/piano-roll/piano-roll-clipboard';
import { removePitchedNotes } from '@/lib/services/piano-roll/piano-roll-editing';

function pattern(
	notes: Array<string | { note: string; instrument?: number; volume?: number }>
): GenericPattern {
	const rows: GenericRow[] = notes.map((entry) => {
		if (typeof entry === 'string') return { note: entry };
		return { note: entry.note, instrument: entry.instrument ?? 0, volume: entry.volume ?? 0 };
	});
	return { id: 0, length: rows.length, channels: [{ rows }], patternRows: [] };
}

describe('piano roll clipboard', () => {
	it('copies note spacing, length, and row fields', () => {
		const rows =
			pattern([
				{ note: 'C-4', instrument: 2, volume: 10 },
				'---',
				'OFF',
				{ note: 'E-4', instrument: 3, volume: 4 },
				'==='
			]).channels[0]?.rows ?? [];
		const first = capturePianoNote(rows, 'note', 0, 8);
		const second = capturePianoNote(rows, 'note', 3, 11);
		expect(first && second).toBeTruthy();
		const clipboard = clipboardFromCaptures(
			[second, first].filter((note): note is CapturedPianoNote => !!note)
		);
		expect(clipboard).toEqual([
			{
				rowOffset: 0,
				note: 'C-4',
				length: 2,
				bounded: true,
				release: false,
				fields: { instrument: 2, volume: 10 }
			},
			{
				rowOffset: 3,
				note: 'E-4',
				length: 1,
				bounded: true,
				release: true,
				fields: { instrument: 3, volume: 4 }
			}
		]);
	});

	it('pastes at the cursor and keeps a later note-off', () => {
		const generic = pattern(['---', '---', '---', 'D-4', '---', 'OFF']);
		const rows = generic.channels[0]?.rows ?? [];
		expect(
			pastePianoNotes(rows, 'note', [
				{
					localRow: 0,
					rowOffset: 0,
					note: 'C-4',
					length: 3,
					bounded: true,
					release: false,
					fields: { instrument: 5 }
				}
			])
		).toBe(true);
		expect(rows.map((row) => row.note)).toEqual(['C-4', '---', '---', 'D-4', '---', 'OFF']);
		expect(rows[0]?.instrument).toBe(5);
	});

	it('removes every selected note and keeps a note-off that belongs to a later note', () => {
		const generic = pattern(['C-4', '---', 'E-4', '---', 'G-4', '---', 'OFF']);
		expect(removePitchedNotes(generic, 0, 'note', [0, 2])).toBe(true);
		expect(generic.channels[0]?.rows.map((row) => row.note)).toEqual([
			'---',
			'---',
			'---',
			'---',
			'G-4',
			'---',
			'OFF'
		]);
	});

	it('turns the first removed note into an off when an earlier note still sounds', () => {
		const generic = pattern(['C-4', '---', 'E-4', '---', 'G-4', 'OFF']);
		expect(removePitchedNotes(generic, 0, 'note', [2, 4])).toBe(true);
		expect(generic.channels[0]?.rows.map((row) => row.note)).toEqual([
			'C-4',
			'---',
			'OFF',
			'---',
			'---',
			'---'
		]);
	});
});
