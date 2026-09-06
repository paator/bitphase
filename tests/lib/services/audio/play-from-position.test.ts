import { describe, expect, it } from 'vitest';
import type { ChipSchema } from '../../../../src/lib/chips/base/schema';
import type { Pattern } from '../../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../../src/lib/chips/ay/schema';
import { NES_CHIP_SCHEMA } from '../../../../src/lib/chips/nes/schema';
import { collectPlaybackCarry } from '../../../../src/lib/services/audio/play-from-position';

const schema: ChipSchema = {
	chipType: 'test',
	template: '{note}',
	channelLabels: ['A'],
	fields: {
		note: {
			key: 'note',
			type: 'note',
			length: 3,
			usedForBacktracking: true,
			backtrackWhen: 'nonZero'
		}
	}
};

function makePattern(id: number, noteNames: number[]): Pattern {
	return {
		id,
		length: noteNames.length,
		channels: [
			{
				label: 'A',
				effectColumnCount: 1,
				rows: noteNames.map((name) => ({
					note: { name, octave: 1 },
					effects: [null]
				}))
			}
		],
		patternRows: noteNames.map(() => ({}))
	} as Pattern;
}

describe('collectPlaybackCarry', () => {
	it('carries the last persist fields from earlier order positions', () => {
		const schema: ChipSchema = {
			chipType: 'custom',
			template: '{note} {instrument} {duty}',
			channelLabels: ['A'],
			fields: {
				note: {
					key: 'note',
					type: 'note',
					length: 3,
					usedForBacktracking: true,
					backtrackWhen: 'nonZero'
				},
				instrument: {
					key: 'instrument',
					type: 'symbol',
					length: 2,
					usedForBacktracking: true,
					backtrackWhen: 'nonZero'
				},
				duty: {
					key: 'duty',
					type: 'hex',
					length: 1,
					usedForBacktracking: true,
					backtrackWhen: 'nonZero'
				}
			}
		};
		const patterns = new Map([
			[
				0,
				{
					id: 0,
					length: 1,
					channels: [
						{
							label: 'A',
							effectColumnCount: 1,
							rows: [
								{
									note: { name: 2, octave: 4 },
									instrument: 1,
									duty: 2,
									effects: [null]
								}
							]
						}
					],
					patternRows: [{}]
				} as Pattern
			],
			[
				1,
				{
					id: 1,
					length: 1,
					channels: [
						{
							label: 'A',
							effectColumnCount: 1,
							rows: [
								{
									note: { name: 2, octave: 4 },
									instrument: 0,
									duty: 0,
									effects: [null]
								}
							]
						}
					],
					patternRows: [{}]
				} as Pattern
			]
		]);

		expect(
			collectPlaybackCarry([0, 1], (id) => patterns.get(id), 1, 0, schema)
		).toEqual({
			channelFields: [{ instrument: 1, duty: 2 }]
		});
	});

	it('does not collect notes or fields the chip schema does not persist', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.instrument = 1;
		(first.patternRows[0] as Record<string, unknown>).noiseValue = 12;
		const second = makePattern(1, [2]);

		const nesCarry = collectPlaybackCarry(
			[0, 1],
			(id) => (id === 0 ? first : second),
			1,
			0,
			NES_CHIP_SCHEMA
		);
		expect(nesCarry?.channelFields?.[0]).toEqual({ instrument: 1 });
		expect(nesCarry?.globalFields).toBeUndefined();
		expect(nesCarry?.channelFields?.[0]).not.toHaveProperty('note');
	});

	it('collects schema global persist fields when the chip has them', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.instrument = 1;
		(first.patternRows[0] as Record<string, unknown>).noiseValue = 12;
		(first.patternRows[0] as Record<string, unknown>).envelopeValue = 256;
		const second = makePattern(1, [2]);

		const ayCarry = collectPlaybackCarry(
			[0, 1],
			(id) => (id === 0 ? first : second),
			1,
			0,
			AY_CHIP_SCHEMA
		);
		expect(ayCarry?.channelFields?.[0]).toMatchObject({ instrument: 1 });
		expect(ayCarry?.globalFields).toEqual({
			noiseValue: 12,
			envelopeValue: 256
		});
	});

	it('carries the last speed command from any effect column', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.effects = [
			null,
			{ effect: 'S'.charCodeAt(0), delay: 0, parameter: 8 }
		];
		const second = makePattern(1, [2]);

		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : second), 1, 0, schema)
				?.speed
		).toBe(8);
	});
});
