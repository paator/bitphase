import { describe, expect, it } from 'vitest';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { AYConverter } from '@/lib/chips/ay/adapter';
import { NES_CHIP_SCHEMA } from '@/lib/chips/nes/schema';
import { NESConverter } from '@/lib/chips/nes/adapter';
import { SAA_CHIP_SCHEMA } from '@/lib/chips/saa/schema';
import { SAAConverter } from '@/lib/chips/saa/adapter';
import type { ChipSchema } from '@/lib/chips/base/schema';
import type { PatternConverter } from '@/lib/chips/base/adapter';
import { Pattern } from '@/lib/models/song';
import type { GenericPattern, GenericRow } from '@/lib/models/song/generic';
import {
	movePitchedNote,
	pitchedBlockSpan,
	relocatePitchedNote,
	removePitchedNote,
	removePitchedNotes,
	resizePitchedNote,
	setNoteValue
} from '@/lib/services/piano-roll/piano-roll-editing';
import { collectPianoNotes } from '@/lib/services/piano-roll/piano-roll-notes';
import { blankChannelRow } from '@/lib/services/piano-roll/piano-roll-schema';

function rows(notes: string[]): GenericRow[] {
	return notes.map((note) => ({ note }));
}

function single(channel: GenericRow[]): GenericPattern {
	return { id: 0, length: channel.length, channels: [{ rows: channel }], patternRows: [] };
}

function notesOf(channel: GenericRow[]): unknown[] {
	return channel.map((row) => row.note);
}

describe('piano roll note editing', () => {
	it('moves a note and its instrument through each chip converter', () => {
		const cases: Array<[ChipSchema, PatternConverter]> = [
			[AY_CHIP_SCHEMA, new AYConverter()],
			[SAA_CHIP_SCHEMA, new SAAConverter()],
			[NES_CHIP_SCHEMA, new NESConverter()]
		];
		for (const [schema, converter] of cases) {
			const pattern = new Pattern(1, 8, schema);
			const generic = converter.toGeneric(pattern);
			generic.channels[0].rows[1].note = 'C-4';
			generic.channels[0].rows[1].instrument = 1;
			expect(movePitchedNote(generic, 0, 'note', 'instrument', 1, 3, 'E-4')).toBe(true);
			const after = converter.toGeneric(converter.fromGeneric(generic));
			expect(after.channels[0].rows[1].note).toBe('---');
			expect(after.channels[0].rows[1].instrument).toBe(0);
			expect(after.channels[0].rows[3].note).toBe('E-4');
			expect(after.channels[0].rows[3].instrument).toBe(1);
		}
	});

	it('keeps the moved block length when it lands on another block', () => {
		const channel = rows([
			'C-4',
			'---',
			'---',
			'---',
			'---',
			'---',
			'---',
			'---',
			'OFF',
			'---',
			'E-4',
			'---',
			'OFF'
		]);
		expect(movePitchedNote(single(channel), 0, 'note', null, 10, 2, 'E-4', 2)).toBe(true);
		expect(notesOf(channel)).toEqual([
			'C-4',
			'---',
			'E-4',
			'---',
			'OFF',
			'---',
			'---',
			'---',
			'---',
			'---',
			'---',
			'---',
			'---'
		]);
		expect(collectPianoNotes(channel, 'note').blocks).toEqual([
			{ startRow: 0, endRow: 2, pitchIndex: 36, note: 'C-4', instrument: null, gestures: [] },
			{ startRow: 2, endRow: 4, pitchIndex: 40, note: 'E-4', instrument: null, gestures: [] }
		]);
	});

	it('keeps a later note-off when the moved note ends on the following note', () => {
		const channel = rows(['D-4', '---', 'F-4', '---', 'B-4', '---', 'OFF']);
		expect(movePitchedNote(single(channel), 0, 'note', null, 2, 2, 'A-4', 2)).toBe(true);
		expect(notesOf(channel)).toEqual(['D-4', '---', 'A-4', '---', 'B-4', '---', 'OFF']);
	});

	it('ignores a move that changes nothing', () => {
		const channel = rows(['C-4', '---', 'OFF']);
		expect(movePitchedNote(single(channel), 0, 'note', null, 0, 0, 'C-4', 2)).toBe(false);
		expect(movePitchedNote(single(channel), 0, 'note', null, 1, 2, 'C-4', 2)).toBe(false);
	});

	it('relocates a bounded note into another pattern with its release', () => {
		const source = rows(['C-4', '---', '===', '---']);
		const destination = rows(['---', '---', '---', '---']);
		source[0].instrument = 2;
		expect(
			relocatePitchedNote(
				single(source),
				single(destination),
				0,
				'note',
				'instrument',
				0,
				1,
				'D-4',
				2
			)
		).toBe(true);
		expect(notesOf(source)).toEqual(['---', '---', '---', '---']);
		expect(source[0].instrument).toBe(0);
		expect(notesOf(destination)).toEqual(['---', 'D-4', '---', '===']);
		expect(destination[1].instrument).toBe(2);
	});

	it('leaves a note-off behind when the relocated note followed another note', () => {
		const source = rows(['C-4', '---', 'E-4', '---', 'OFF']);
		const destination = rows(['---', '---', '---', '---']);
		relocatePitchedNote(single(source), single(destination), 0, 'note', null, 2, 0, 'E-4', 2);
		expect(notesOf(source)).toEqual(['C-4', '---', 'OFF', '---', '---']);
		expect(notesOf(destination)).toEqual(['E-4', '---', 'OFF', '---']);
	});

	it('keeps the previous note the same length when a later note is removed', () => {
		const backToBack = rows(['C-4', '---', 'E-4', '---', 'OFF']);
		expect(removePitchedNote(single(backToBack), 0, 'note', 2)).toBe(true);
		expect(notesOf(backToBack)).toEqual(['C-4', '---', 'OFF', '---', '---']);
		expect(collectPianoNotes(backToBack, 'note').blocks[0]).toMatchObject({
			startRow: 0,
			endRow: 2
		});

		const separated = rows(['C-4', 'OFF', '---', 'E-4', '---', 'OFF']);
		expect(removePitchedNote(single(separated), 0, 'note', 3)).toBe(true);
		expect(notesOf(separated)).toEqual(['C-4', 'OFF', '---', '---', '---', '---']);
		expect(collectPianoNotes(separated, 'note').blocks[0]).toMatchObject({
			startRow: 0,
			endRow: 1
		});
	});

	it('removes a run of selected notes and gates only the note before them', () => {
		const channel = rows(['C-4', '---', 'D-4', 'E-4', '---', 'OFF', 'G-4']);
		expect(removePitchedNotes(single(channel), 0, 'note', [3, 2])).toBe(true);
		expect(notesOf(channel)).toEqual(['C-4', '---', 'OFF', '---', '---', '---', 'G-4']);
		expect(removePitchedNotes(single(channel), 0, 'note', [1])).toBe(false);
	});

	it('clears the removed note parameters from a blank schema row', () => {
		const blank = blankChannelRow(new AYConverter(), AY_CHIP_SCHEMA)!;
		const channel: GenericRow[] = [
			{
				...blank,
				note: 'C-4',
				instrument: 2,
				volume: 12,
				table: 3,
				envelopeShape: 8,
				effect: { effect: 1, delay: 0, parameter: 4 }
			},
			{ ...blank, note: '---', volume: 9 },
			{ ...blank, note: 'E-4', instrument: 1, volume: 5 }
		];
		expect(removePitchedNote(single(channel), 0, 'note', 0, blank)).toBe(true);
		expect(channel[0]).toEqual(blank);
		expect(channel[1]!.volume).toBe(9);
		expect(channel[2]).toMatchObject({ note: 'E-4', instrument: 1, volume: 5 });

		const kept = [{ ...blank, note: 'C-4', instrument: 2, volume: 12 }];
		removePitchedNote(single(kept), 0, 'note', 0);
		expect(kept[0]).toMatchObject({ note: '---', instrument: 2, volume: 12 });
	});

	it('reports whether a block ends on another event', () => {
		expect(pitchedBlockSpan(rows(['C-4', '---', 'OFF']), 'note', 0)).toEqual({
			length: 2,
			bounded: true
		});
		expect(pitchedBlockSpan(rows(['C-4', '---', '---']), 'note', 0)).toEqual({
			length: 3,
			bounded: false
		});
		expect(pitchedBlockSpan(rows(['OFF', '---']), 'note', 0)).toBeNull();
	});

	it('writes a note value only when it changes', () => {
		const channel = rows(['---']);
		expect(setNoteValue(single(channel), 0, 0, 'note', 'C-4')).toBe(true);
		expect(setNoteValue(single(channel), 0, 0, 'note', 'C-4')).toBe(false);
		expect(setNoteValue(single(channel), 0, 4, 'note', 'C-4')).toBe(false);
	});

	it('shortens a note by inserting or moving a note-off', () => {
		const open = rows(['C-4', '---', '---', '---', '---']);
		expect(resizePitchedNote(single(open), 0, 'note', 0, 3)).toBe(true);
		expect(open[3].note).toBe('OFF');

		const gated = rows(['C-4', '---', '---', 'OFF', '---']);
		expect(resizePitchedNote(single(gated), 0, 'note', 0, 2)).toBe(true);
		expect(gated[2].note).toBe('OFF');
		expect(gated[3].note).toBe('---');
	});

	it('extends a note up to the next one and clears its note-off', () => {
		const channel = rows(['C-4', '---', 'OFF', '---', 'E-4', '---']);
		const pattern = single(channel);
		expect(resizePitchedNote(pattern, 0, 'note', 0, 5)).toBe(true);
		expect(notesOf(channel)).toEqual(['C-4', '---', '---', '---', 'E-4', '---']);
		expect(resizePitchedNote(pattern, 0, 'note', 0, 3)).toBe(true);
		expect(channel[3].note).toBe('OFF');
		expect(resizePitchedNote(pattern, 0, 'note', 0, 4)).toBe(true);
		expect(notesOf(channel)).toEqual(['C-4', '---', '---', '---', 'E-4', '---']);
	});

	it('keeps a release when the block end moves', () => {
		const released = rows(['C-4', '---', '===', '---', '---']);
		expect(resizePitchedNote(single(released), 0, 'note', 0, 4)).toBe(true);
		expect(notesOf(released)).toEqual(['C-4', '---', '---', '---', '===']);
	});
});
