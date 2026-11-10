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
import {
	buildPianoTimeline,
	clearSpilledNoteGate,
	collectPianoNotes,
	continueOpenNoteBlocks,
	findNoteFieldKey,
	listPianoRollChannels,
	listPianoRollLanes,
	movePitchedNote,
	pitchedBlockSpan,
	pianoLaneBarValue,
	removePitchedNote,
	pianoLaneValueFromRatio,
	resizePitchedNote,
	noteLevelAlpha,
	ornamentSteps,
	setPianoFieldValue,
	shiftPianoNotes,
	timelineColumnCount,
	timelineSpanAt,
	timelineWindow,
	writeSpilledNoteTail
} from '@/lib/services/piano-roll/piano-roll-model';
import type { GenericRow } from '@/lib/models/song/generic';

function rows(notes: string[]): GenericRow[] {
	return notes.map((note) => ({ note }));
}

describe('piano roll schema lanes', () => {
	it('builds different lanes for AY, SAA, and NES', () => {
		const ay = listPianoRollLanes(AY_CHIP_SCHEMA, 1);
		const saa = listPianoRollLanes(SAA_CHIP_SCHEMA, 1);
		const nes = listPianoRollLanes(NES_CHIP_SCHEMA, 1);

		expect(findNoteFieldKey(AY_CHIP_SCHEMA)).toBe('note');
		expect(ay.map((lane) => lane.fieldKey)).not.toContain('note');
		expect(ay.find((lane) => lane.fieldKey === 'envelopeShape')?.isGlobal).toBe(false);
		expect(ay.find((lane) => lane.fieldKey === 'envelopeValue')).toMatchObject({
			isGlobal: true,
			label: 'Env',
			kind: 'value'
		});
		expect(ay.find((lane) => lane.fieldKey === 'envelopeEffect')?.kind).toBe('effect');
		expect(ay.find((lane) => lane.fieldKey === 'volume')?.maxValue).toBe(15);

		expect(saa.some((lane) => lane.fieldKey === 'left')).toBe(true);
		expect(saa.some((lane) => lane.fieldKey === 'right')).toBe(true);
		expect(saa.some((lane) => lane.fieldKey === 'envelopeShape')).toBe(false);
		expect(saa.filter((lane) => lane.isGlobal).map((lane) => lane.fieldKey)).toEqual([
			'noise0',
			'noise1',
			'env0',
			'env1'
		]);
		expect(saa.find((lane) => lane.fieldKey === 'noise0')?.label).toBe('Noise 0');
		expect(saa.find((lane) => lane.fieldKey === 'noise1')?.label).toBe('Noise 1');

		expect(nes.some((lane) => lane.isGlobal)).toBe(false);
		expect(nes.map((lane) => lane.fieldKey)).toEqual(['instrument', 'table', 'volume', 'effect']);
	});

	it('adds extra effect columns from the channel layout', () => {
		const lanes = listPianoRollLanes(AY_CHIP_SCHEMA, 2);
		expect(lanes.filter((lane) => lane.kind === 'effect').map((lane) => lane.fieldKey)).toEqual([
			'effect',
			'effect1',
			'envelopeEffect'
		]);
		expect(lanes.find((lane) => lane.fieldKey === 'effect1')?.label).toBe('Effect 2');
	});

	it('lists channels across mixed chips', () => {
		const songs = [
			{ getEffectiveChannelLabels: () => ['A', 'B', 'C'] },
			{ getEffectiveChannelLabels: () => ['A', 'B', 'C'] },
			{ getEffectiveChannelLabels: () => ['A', 'B', 'C', 'D', 'E', 'F'] }
		];
		const channels = listPianoRollChannels(songs, [
			{ name: 'AY-3-8910 / YM2149F', type: 'ay' },
			{ name: 'AY-3-8910 / YM2149F', type: 'ay' },
			{ name: 'SAA1099', type: 'saa' }
		]);
		expect(channels).toHaveLength(12);
		expect(channels[0]).toMatchObject({ songIndex: 0, channelIndex: 0, label: 'A', chipType: 'ay' });
		expect(channels[3]).toMatchObject({ songIndex: 1, channelIndex: 0, chipType: 'ay' });
		expect(channels[6]).toMatchObject({ songIndex: 2, channelIndex: 0, chipType: 'saa' });
		expect(channels.at(-1)?.label).toBe('F');
	});
});

describe('piano roll timeline', () => {
	it('places order steps on one timeline and windows the visible ones', () => {
		const spans = buildPianoTimeline([2, 0, 2], (id) => (id === 0 ? 4 : id === 2 ? 8 : undefined));
		expect(spans.map((span) => [span.orderIndex, span.patternId, span.startRow, span.length])).toEqual([
			[0, 2, 0, 8],
			[1, 0, 8, 4],
			[2, 2, 12, 8]
		]);
		expect(timelineColumnCount(spans)).toBe(20);
		expect(timelineSpanAt(spans, 9)).toEqual({ span: spans[1], localRow: 1 });
		expect(timelineSpanAt(spans, 20)).toBeNull();
		expect(timelineWindow(spans, 8, 12).map((span) => span.orderIndex)).toEqual([0, 1, 2]);
		const shifted = shiftPianoNotes(
			collectPianoNotes(rows(['C-4', '---', 'OFF']), 'note'),
			spans[1]!
		);
		expect(shifted.blocks[0]).toMatchObject({
			startRow: 8,
			endRow: 10,
			localStartRow: 0,
			orderIndex: 1,
			patternId: 0
		});
		expect(shifted.gates[0]).toMatchObject({ row: 10, localRow: 2, orderIndex: 1 });
	});
});

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
			const moved = movePitchedNote(
				generic,
				0,
				'note',
				'instrument',
				1,
				3,
				'E-4'
			);
			expect(moved).toBe(true);
			const after = converter.toGeneric(converter.fromGeneric(generic));
			expect(after.channels[0].rows[1].note).toBe('---');
			expect(after.channels[0].rows[1].instrument).toBe(0);
			expect(after.channels[0].rows[3].note).toBe('E-4');
			expect(after.channels[0].rows[3].instrument).toBe(1);
		}
	});

	it('keeps the moved block length when it lands on another block', () => {
		const channel = rows(['C-4', '---', '---', '---', '---', '---', '---', '---', 'OFF', '---', 'E-4', '---', 'OFF']);
		const pattern = { id: 0, length: channel.length, channels: [{ rows: channel }], patternRows: [] };
		expect(movePitchedNote(pattern, 0, 'note', null, 10, 2, 'E-4', 2)).toBe(true);
		expect(channel.map((row) => row.note)).toEqual([
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
		const pattern = { id: 0, length: channel.length, channels: [{ rows: channel }], patternRows: [] };
		expect(movePitchedNote(pattern, 0, 'note', null, 2, 2, 'A-4', 2)).toBe(true);
		expect(channel.map((row) => row.note)).toEqual(['D-4', '---', 'A-4', '---', 'B-4', '---', 'OFF']);
	});

	it('keeps the previous note the same length when a later note is removed', () => {
		const backToBack = rows(['C-4', '---', 'E-4', '---', 'OFF']);
		expect(
			removePitchedNote({ id: 0, length: 5, channels: [{ rows: backToBack }], patternRows: [] }, 0, 'note', 2)
		).toBe(true);
		expect(backToBack.map((row) => row.note)).toEqual(['C-4', '---', 'OFF', '---', '---']);
		expect(collectPianoNotes(backToBack, 'note').blocks[0]).toMatchObject({ startRow: 0, endRow: 2 });

		const separated = rows(['C-4', 'OFF', '---', 'E-4', '---', 'OFF']);
		expect(
			removePitchedNote({ id: 0, length: 6, channels: [{ rows: separated }], patternRows: [] }, 0, 'note', 3)
		).toBe(true);
		expect(separated.map((row) => row.note)).toEqual(['C-4', 'OFF', '---', '---', '---', '---']);
		expect(collectPianoNotes(separated, 'note').blocks[0]).toMatchObject({ startRow: 0, endRow: 1 });
	});

	it('reports whether a block ends on another event', () => {
		expect(pitchedBlockSpan(rows(['C-4', '---', 'OFF']), 'note', 0)).toEqual({ length: 2, bounded: true });
		expect(pitchedBlockSpan(rows(['C-4', '---', '---']), 'note', 0)).toEqual({ length: 3, bounded: false });
	});

	it('shortens a note by inserting or moving a note-off', () => {
		const open = rows(['C-4', '---', '---', '---', '---']);
		expect(resizePitchedNote({ id: 0, length: 5, channels: [{ rows: open }], patternRows: [] }, 0, 'note', 0, 3)).toBe(
			true
		);
		expect(open[3].note).toBe('OFF');

		const gated = rows(['C-4', '---', '---', 'OFF', '---']);
		expect(
			resizePitchedNote(
				{ id: 0, length: 5, channels: [{ rows: gated }], patternRows: [] },
				0,
				'note',
				0,
				2
			)
		).toBe(true);
		expect(gated[2].note).toBe('OFF');
		expect(gated[3].note).toBe('---');
	});

	it('extends a note up to the next one and clears its note-off', () => {
		const rowsForNotes = rows(['C-4', '---', 'OFF', '---', 'E-4', '---']);
		const pattern = { id: 0, length: 6, channels: [{ rows: rowsForNotes }], patternRows: [] };
		expect(resizePitchedNote(pattern, 0, 'note', 0, 5)).toBe(true);
		expect(rowsForNotes.map((row) => row.note)).toEqual(['C-4', '---', '---', '---', 'E-4', '---']);
		expect(resizePitchedNote(pattern, 0, 'note', 0, 3)).toBe(true);
		expect(rowsForNotes[3].note).toBe('OFF');
		expect(resizePitchedNote(pattern, 0, 'note', 0, 4)).toBe(true);
		expect(rowsForNotes.map((row) => row.note)).toEqual(['C-4', '---', '---', '---', 'E-4', '---']);
	});

	it('keeps a release when the block end moves', () => {
		const released = rows(['C-4', '---', '===', '---', '---']);
		expect(
			resizePitchedNote({ id: 0, length: 5, channels: [{ rows: released }], patternRows: [] }, 0, 'note', 0, 4)
		).toBe(true);
		expect(released.map((row) => row.note)).toEqual(['C-4', '---', '---', '---', '===']);
	});

	it('maps lane pointer position onto schema field ranges', () => {
		const volume = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find((lane) => lane.fieldKey === 'volume');
		const instrument = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find(
			(lane) => lane.fieldKey === 'instrument'
		);
		expect(volume).toBeDefined();
		expect(instrument).toBeDefined();
		expect(pianoLaneValueFromRatio(0, volume!)).toBe(-1);
		expect(pianoLaneValueFromRatio(1, volume!)).toBe(15);
		expect(pianoLaneValueFromRatio(0, instrument!)).toBe(0);
		expect(pianoLaneBarValue(-1, volume!)).toBe(0);
		expect(pianoLaneBarValue(0, volume!)).toBeNull();
		expect(pianoLaneBarValue(8, volume!)).toBe(8);
	});

	it('writes global fields separately from channel fields', () => {
		const generic = {
			id: 0,
			length: 2,
			channels: [{ rows: [{ volume: 0 }, { volume: 0 }] }],
			patternRows: [{ envelopeValue: 0 }, { envelopeValue: 0 }]
		};
		const volume = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find((lane) => lane.fieldKey === 'volume')!;
		const envelope = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find(
			(lane) => lane.fieldKey === 'envelopeValue'
		)!;
		expect(setPianoFieldValue(generic, volume, 0, 1, 12)).toBe(true);
		expect(setPianoFieldValue(generic, envelope, 0, 0, 40)).toBe(true);
		expect(generic.channels[0].rows[1].volume).toBe(12);
		expect(generic.patternRows[0].envelopeValue).toBe(40);
		expect(generic.channels[0].rows[0].volume).toBe(0);
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
		expect(notes.blocks[1]?.gestures).toEqual([{ kind: 'portamento', amount: 0.5, fromPitch: 36 }]);
	});

	it('reads a gesture from a later effect column', () => {
		const notes = collectPianoNotes(
			[
				{
					note: 'C-4',
					effect1: { effect: 'V'.charCodeAt(0), delay: 0, parameter: 0x48 }
				}
			],
			'note'
		);
		expect(notes.blocks[0]?.gestures).toEqual([{ kind: 'vibrato', speed: 4 / 15, depth: 8 / 15 }]);
	});

	it('uses the supplied picture and drops commands that have none', () => {
		const notes = collectPianoNotes(
			[{ note: 'A-2', effect: { effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x14 } }],
			'note',
			(effect) => (effect.delay === 2 ? { kind: 'slide-up', amount: 0.5 } : null)
		);
		expect(notes.blocks[0]?.gestures).toEqual([{ kind: 'slide-up', amount: 0.5 }]);
	});

	it('fades a note from the amplitude column and keeps that level for the next pattern', () => {
		const volume = [{ key: 'volume', max: 15, allowZeroValue: true }];
		const carry = new Map<string, number>();
		const first = collectPianoNotes(
			[
				{ note: 'C-4', volume: 15 },
				{ note: '---', volume: 8 },
				{ note: 'E-4' },
				{ note: 'G-4', volume: -1 },
				{ note: 'OFF' }
			],
			'note',
			undefined,
			volume,
			carry
		);
		expect(first.blocks.map((block) => block.level)).toEqual([1, 8 / 15, 0]);
		const next = collectPianoNotes([{ note: 'G-4' }, { note: 'A-4', volume: 0 }], 'note', undefined, volume, carry);
		expect(next.blocks.map((block) => block.level)).toEqual([0, 0]);
		expect(noteLevelAlpha(1)).toBeCloseTo(0.92);
		expect(noteLevelAlpha(0)).toBeCloseTo(0.26);
		expect(noteLevelAlpha(0.5)).toBeLessThan(0.55);
		expect(noteLevelAlpha(null)).toBeCloseTo(0.92);
	});

	it('uses the louder side when a chip has two amplitude columns', () => {
		const sides = [
			{ key: 'left', max: 15, allowZeroValue: true },
			{ key: 'right', max: 15, allowZeroValue: true }
		];
		const notes = collectPianoNotes(
			[{ note: 'C-4', left: 2, right: 15 }, { note: 'E-4', left: -1 }],
			'note',
			undefined,
			sides
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
			undefined,
			[],
			new Map(),
			{ lookup, carry }
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

describe('piano roll notes across a pattern boundary', () => {
	it('keeps a block length that crosses into the next pattern', () => {
		const first = rows(['---', 'C-4', '---', '---']);
		const second = rows(['---', '---', '---', 'E-4']);
		const spans = buildPianoTimeline([0, 1], (id) => (id === 0 ? first.length : second.length));
		const patterns = new Map([
			[0, first],
			[1, second]
		]);
		const rowsFor = (span: { patternId: number }) => patterns.get(span.patternId);
		writeSpilledNoteTail(spans, 'note', 1, 4, false, rowsFor);
		expect(first.map((row) => row.note)).toEqual(['---', 'C-4', '---', '---']);
		expect(second.map((row) => row.note)).toEqual(['---', 'OFF', '---', 'E-4']);
		const blocks = [
			...collectPianoNotes(first, 'note').blocks.map((block) => ({
				...block,
				startRow: block.startRow,
				endRow: block.endRow
			})),
			...collectPianoNotes(second, 'note').blocks.map((block) => ({
				...block,
				startRow: block.startRow + first.length,
				endRow: block.endRow + first.length
			}))
		];
		continueOpenNoteBlocks(blocks, spans, 'note', rowsFor);
		expect(blocks.find((block) => block.note === 'C-4')).toMatchObject({ startRow: 1, endRow: 5 });
		expect(blocks.find((block) => block.note === 'E-4')).toMatchObject({ startRow: 7, endRow: 8 });
	});

	it('removes the gate left in the next pattern when the note moves away', () => {
		const first = rows(['C-4', '---', '---', '---']);
		const second = rows(['---', 'OFF', '---', '---']);
		const spans = buildPianoTimeline([0, 1], () => 4);
		const patterns = new Map([
			[0, first],
			[1, second]
		]);
		const rowsFor = (span: { patternId: number }) => patterns.get(span.patternId);
		expect(clearSpilledNoteGate(spans, 'note', 4, rowsFor).has(1)).toBe(true);
		expect(second.map((row) => row.note)).toEqual(['---', '---', '---', '---']);
		expect(clearSpilledNoteGate(spans, 'note', 4, rowsFor).size).toBe(0);
	});
});
