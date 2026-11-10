import { describe, expect, it } from 'vitest';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { NES_CHIP_SCHEMA } from '@/lib/chips/nes/schema';
import { SAA_CHIP_SCHEMA } from '@/lib/chips/saa/schema';
import type { ChipSchema } from '@/lib/chips/base/schema';
import {
	amplitudeFields,
	findNoteFieldKey,
	listPianoRollChannels,
	listPianoRollLanes,
	pianoLaneBarValue,
	pianoLaneValueFromRatio,
	pianoRollFieldKeys,
	readPianoFieldValue,
	setPianoFieldValue
} from '@/lib/services/piano-roll/piano-roll-schema';

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
		expect(nes.map((lane) => lane.fieldKey)).toEqual([
			'instrument',
			'table',
			'volume',
			'effect'
		]);
	});

	it('adds extra effect columns from the channel layout', () => {
		const lanes = listPianoRollLanes(AY_CHIP_SCHEMA, 2);
		expect(lanes.filter((lane) => lane.kind === 'effect').map((lane) => lane.fieldKey)).toEqual(
			['effect', 'effect1', 'envelopeEffect']
		);
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
		expect(channels[0]).toMatchObject({
			songIndex: 0,
			channelIndex: 0,
			label: 'A',
			chipType: 'ay'
		});
		expect(channels[3]).toMatchObject({ songIndex: 1, channelIndex: 0, chipType: 'ay' });
		expect(channels[6]).toMatchObject({ songIndex: 2, channelIndex: 0, chipType: 'saa' });
		expect(channels.at(-1)?.label).toBe('F');
	});

	it('reads the note, instrument, and table keys from each chip schema', () => {
		for (const schema of [AY_CHIP_SCHEMA, SAA_CHIP_SCHEMA, NES_CHIP_SCHEMA]) {
			expect(pianoRollFieldKeys(schema)).toEqual({
				note: 'note',
				instrument: 'instrument',
				table: 'table'
			});
		}
		const bare = {
			...AY_CHIP_SCHEMA,
			fields: { volume: AY_CHIP_SCHEMA.fields.volume }
		} as ChipSchema;
		expect(pianoRollFieldKeys(bare)).toEqual({ note: null, instrument: null, table: null });
	});

	it('lists the amplitude columns with their range', () => {
		expect(amplitudeFields(AY_CHIP_SCHEMA)).toContainEqual(
			expect.objectContaining({ key: 'volume', max: 15 })
		);
	});

	it('maps lane pointer position onto schema field ranges', () => {
		const volume = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find(
			(lane) => lane.fieldKey === 'volume'
		);
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
		const volume = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find(
			(lane) => lane.fieldKey === 'volume'
		)!;
		const envelope = listPianoRollLanes(AY_CHIP_SCHEMA, 1).find(
			(lane) => lane.fieldKey === 'envelopeValue'
		)!;
		expect(setPianoFieldValue(generic, volume, 0, 1, 12)).toBe(true);
		expect(setPianoFieldValue(generic, volume, 0, 1, 12)).toBe(false);
		expect(setPianoFieldValue(generic, envelope, 0, 0, 40)).toBe(true);
		expect(generic.channels[0].rows[1].volume).toBe(12);
		expect(generic.patternRows[0].envelopeValue).toBe(40);
		expect(generic.channels[0].rows[0].volume).toBe(0);
		expect(readPianoFieldValue(generic, envelope, 0, 0)).toBe(40);
		expect(readPianoFieldValue(generic, volume, 0, 1)).toBe(12);
	});
});
