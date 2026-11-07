import { describe, expect, it } from 'vitest';
import type { ChipSchema } from '../../../../src/lib/chips/base/schema';
import type { Pattern } from '../../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../../src/lib/chips/ay/schema';
import { NES_CHIP_SCHEMA } from '../../../../src/lib/chips/nes/schema';
import { SAA_CHIP_SCHEMA } from '../../../../src/lib/chips/saa/schema';
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

		expect(collectPlaybackCarry([0, 1], (id) => patterns.get(id), 1, 0, schema)).toEqual({
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

	it('does not carry empty AY envelope shape from a previous pattern', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.instrument = 1;
		first.channels[0]!.rows[0]!.envelopeShape = 0;
		const second = makePattern(1, [2]);

		const ayCarry = collectPlaybackCarry(
			[0, 1],
			(id) => (id === 0 ? first : second),
			1,
			0,
			AY_CHIP_SCHEMA
		);
		expect(ayCarry?.channelFields?.[0]).toEqual({ instrument: 1 });
		expect(ayCarry?.channelFields?.[0]).not.toHaveProperty('envelopeShape');
	});

	it('carries the last speed command from any effect column', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.effects = [
			null,
			{ effect: 'S'.charCodeAt(0), delay: 0, parameter: 8 }
		];
		const second = makePattern(1, [2]);

		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : second), 1, 0, schema)?.speed
		).toBe(8);
	});

	it('carries the last detune effect per channel', () => {
		const first = makePattern(0, [2, 2]);
		first.channels[0]!.rows[0]!.effects = [
			{ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x70 }
		];
		first.channels[0]!.rows[1]!.effects = [
			{ effect: '1'.charCodeAt(0), delay: 0, parameter: 0x10 },
			{ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x85 }
		];
		const second = makePattern(1, [2]);

		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : second), 1, 0, schema)
				?.channelStickyEffects?.[0]
		).toEqual([{ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x85 }]);
	});

	it('carries a detune table and an explicit zero offset', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.effects = [
			{ effect: 'D'.charCodeAt(0), delay: 2, parameter: 0, tableIndex: 3 }
		];
		const later = makePattern(1, [2, 2]);
		later.channels[0]!.rows[0]!.effects = [
			{ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x80 }
		];

		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : later), 1, 0, schema)
				?.channelStickyEffects?.[0]?.[0]
		).toEqual({
			effect: 'D'.charCodeAt(0),
			delay: 2,
			parameter: 0,
			tableIndex: 3
		});
		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : later), 1, 1, schema)
				?.channelStickyEffects?.[0]?.[0]
		).toEqual({ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x80 });
	});

	it('carries an AY envelope detune command', () => {
		const first = makePattern(0, [2]);
		(first.patternRows[0] as Record<string, unknown>).envelopeEffect = {
			effect: 'D'.charCodeAt(0),
			delay: 0,
			parameter: 0x90
		};
		const second = makePattern(1, [2]);
		(second.patternRows[0] as Record<string, unknown>).envelopeEffect = {
			effect: '1'.charCodeAt(0),
			delay: 0,
			parameter: 4
		};

		const carry = collectPlaybackCarry(
			[0, 1],
			(id) => (id === 0 ? first : second),
			1,
			0,
			AY_CHIP_SCHEMA
		);
		expect(carry?.globalStickyEffects).toEqual({
			fieldKey: 'envelopeEffect',
			commands: [{ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x90 }]
		});
	});

	it('carries S.TY table speed from a previous pattern', () => {
		const first = makePattern(0, [2]);
		first.channels[0]!.rows[0]!.effects = [
			null,
			{ effect: 'S'.charCodeAt(0), delay: 0, parameter: 0, tableIndex: 4 }
		];
		const second = makePattern(1, [2]);
		const tables = [{ id: 4, rows: [0, 7, 2], loop: 0, name: 'T', additive: false }];

		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : second), 1, 0, schema, tables)
		).toMatchObject({
			speed: 7,
			speedTable: 4,
			speedTablePosition: 1
		});
	});

	it('carries volume slide across later notes', () => {
		const pattern = makePattern(0, [2, 2, 2]);
		pattern.channels[0]!.rows[0]!.effects = [{ effect: 8, delay: 1, parameter: 0x13 }];
		pattern.channels[0]!.rows[1]!.effects = [
			{ effect: 'A'.charCodeAt(0), delay: 0, parameter: 0x37 }
		];

		expect(
			collectPlaybackCarry([0], (id) => (id === 0 ? pattern : undefined), 0, 2, schema)
				?.channelStickyEffects?.[0]
		).toEqual([{ effect: 8, delay: 1, parameter: 0x13 }]);
	});

	it('keeps the newest volume slide', () => {
		const pattern = makePattern(0, [2, 2]);
		pattern.channels[0]!.rows[0]!.effects = [{ effect: 8, delay: 0, parameter: 0x01 }];
		pattern.channels[0]!.rows[1]!.effects = [{ effect: 8, delay: 2, parameter: 0x20 }];

		expect(
			collectPlaybackCarry([0], (id) => pattern, 0, 2, schema)?.channelStickyEffects?.[0]
		).toEqual([{ effect: 8, delay: 2, parameter: 0x20 }]);
	});

	it('carries NES effects that stay active after a new note', () => {
		const pattern = makePattern(0, [2, 2, 0]);
		pattern.channels[0]!.rows[0]!.effects = [
			{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 2 },
			{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x11 },
			{ effect: 'E'.charCodeAt(0), delay: 4, parameter: 0x20 },
			{ effect: 'E'.charCodeAt(0), delay: 5, parameter: 0x0a },
			{ effect: 'E'.charCodeAt(0), delay: 6, parameter: 1 },
			{ effect: 'E'.charCodeAt(0), delay: 7, parameter: 0x04 },
			{ effect: 'E'.charCodeAt(0), delay: 8, parameter: 0x7f }
		];

		expect(
			collectPlaybackCarry([0], (id) => pattern, 0, 2, NES_CHIP_SCHEMA)
				?.channelStickyEffects?.[0]
		).toEqual([
			{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 2 },
			{ effect: 'E'.charCodeAt(0), delay: 4, parameter: 0x20 },
			{ effect: 'E'.charCodeAt(0), delay: 5, parameter: 0x0a },
			{ effect: 'E'.charCodeAt(0), delay: 6, parameter: 1 },
			{ effect: 'E'.charCodeAt(0), delay: 8, parameter: 0x7f }
		]);
	});

	it('keeps an AY auto-envelope across later notes', () => {
		const pattern = makePattern(0, [2, 2, 0]);
		(pattern.patternRows[0] as Record<string, unknown>).envelopeEffect = {
			effect: 'E'.charCodeAt(0),
			delay: 0x0a,
			parameter: 0x23
		};
		(pattern.patternRows[1] as Record<string, unknown>).envelopeEffect = {
			effect: 'E'.charCodeAt(0),
			delay: 0x0a,
			parameter: 0x01
		};

		expect(
			collectPlaybackCarry([0], (id) => pattern, 0, 2, AY_CHIP_SCHEMA)?.globalStickyEffects
		).toEqual({
			fieldKey: 'envelopeEffect',
			commands: [{ effect: 'E'.charCodeAt(0), delay: 0x0a, parameter: 0x23 }]
		});
	});

	it('drops AY envelope effects cleared by a later envelope period', () => {
		const pattern = makePattern(0, [2, 2, 2, 0]);
		(pattern.patternRows[0] as Record<string, unknown>).envelopeEffect = {
			effect: 'D'.charCodeAt(0),
			delay: 0,
			parameter: 0x90
		};
		(pattern.patternRows[1] as Record<string, unknown>).envelopeEffect = {
			effect: 'V'.charCodeAt(0),
			delay: 0,
			parameter: 0x34
		};
		(pattern.patternRows[1] as Record<string, unknown>).envelopeValue = 80;
		(pattern.patternRows[2] as Record<string, unknown>).envelopeValue = 100;

		const carry = collectPlaybackCarry([0], (id) => pattern, 0, 3, AY_CHIP_SCHEMA);
		expect(carry?.globalStickyEffects).toEqual({
			fieldKey: 'envelopeEffect',
			commands: [{ effect: 'D'.charCodeAt(0), delay: 0, parameter: 0x90 }]
		});
		expect(carry?.globalFields).toEqual({ envelopeValue: 100 });
	});

	it('carries AY envelope commands that survive notes, and keeps a portamento target off the period', () => {
		const pattern = makePattern(0, [2, 2, 0]);
		(pattern.patternRows[0] as Record<string, unknown>).envelopeValue = 100;
		(pattern.patternRows[0] as Record<string, unknown>).envelopeEffect = {
			effect: 'V'.charCodeAt(0),
			delay: 1,
			parameter: 0x34
		};
		(pattern.patternRows[1] as Record<string, unknown>).envelopeValue = 200;
		(pattern.patternRows[1] as Record<string, unknown>).envelopeEffect = {
			effect: 'P'.charCodeAt(0),
			delay: 0,
			parameter: 4
		};

		const carry = collectPlaybackCarry([0], (id) => pattern, 0, 2, AY_CHIP_SCHEMA);
		expect(carry?.globalFields).toEqual({ envelopeValue: 100 });
		expect(carry?.globalStickyEffects).toEqual({
			fieldKey: 'envelopeEffect',
			commands: [
				{ effect: 'V'.charCodeAt(0), delay: 1, parameter: 0x34 },
				{
					effect: 'P'.charCodeAt(0),
					delay: 0,
					parameter: 4,
					patternRowFields: { envelopeValue: 200 }
				}
			]
		});
	});
});

const CHIP_EFFECT = 'E'.charCodeAt(0);

function saaPattern(id: number, length: number): Pattern {
	return {
		id,
		length,
		channels: Array.from({ length: 6 }, (_, index) => ({
			label: 'ABCDEF'[index] ?? 'A',
			effectColumnCount: 1,
			rows: Array.from({ length }, () => ({
				note: { name: 0, octave: 0 },
				effects: [null]
			}))
		})),
		patternRows: Array.from({ length }, () => ({
			noise0: 0,
			noise1: 0,
			env0: 0,
			env1: 0
		}))
	} as Pattern;
}

function saaEffect(channel: number, pattern: Pattern, row: number, parameter: number): void {
	pattern.channels[channel]!.rows[row]!.effects = [
		{ effect: CHIP_EFFECT, delay: 0x0a, parameter }
	];
}

describe('SAA playback carry', () => {
	it('carries the last noise and envelope columns across blank cells', () => {
		const first = saaPattern(0, 2);
		(first.patternRows[0] as Record<string, unknown>).noise0 = 2;
		(first.patternRows[0] as Record<string, unknown>).env0 = 4;
		(first.patternRows[0] as Record<string, unknown>).noise1 = 1;
		(first.patternRows[0] as Record<string, unknown>).env1 = 6;
		const second = saaPattern(1, 1);

		expect(
			collectPlaybackCarry([0, 1], (id) => (id === 0 ? first : second), 1, 0, SAA_CHIP_SCHEMA)
				?.globalFields
		).toEqual({
			noise0: 2,
			env0: 4,
			noise1: 1,
			env1: 6
		});
	});

	it('lets an explicit column off replace the earlier value', () => {
		const pattern = saaPattern(0, 3);
		(pattern.patternRows[0] as Record<string, unknown>).env0 = 4;
		(pattern.patternRows[1] as Record<string, unknown>).env0 = -1;

		expect(
			collectPlaybackCarry([0], () => pattern, 0, 2, SAA_CHIP_SCHEMA)?.globalFields
		).toEqual({
			env0: -1
		});
	});

	it('carries the newest auto-envelope in each channel group', () => {
		const pattern = saaPattern(0, 3);
		saaEffect(2, pattern, 0, 0x32);
		saaEffect(5, pattern, 0, 0x21);
		saaEffect(0, pattern, 1, 0x11);

		const carry = collectPlaybackCarry([0], () => pattern, 0, 2, SAA_CHIP_SCHEMA);
		expect(carry?.channelStickyEffects?.[0]).toEqual([
			{ effect: CHIP_EFFECT, delay: 0x0a, parameter: 0x11 }
		]);
		expect(carry?.channelStickyEffects?.[2]).toEqual([]);
		expect(carry?.channelStickyEffects?.[5]).toEqual([
			{ effect: CHIP_EFFECT, delay: 0x0a, parameter: 0x21 }
		]);
	});

	it('carries an auto-envelope off so an earlier ratio does not return', () => {
		const pattern = saaPattern(0, 3);
		saaEffect(2, pattern, 0, 0x32);
		saaEffect(0, pattern, 1, 0x00);

		const carry = collectPlaybackCarry([0], () => pattern, 0, 2, SAA_CHIP_SCHEMA);
		expect(carry?.channelStickyEffects?.[0]).toEqual([
			{ effect: CHIP_EFFECT, delay: 0x0a, parameter: 0 }
		]);
		expect(carry?.channelStickyEffects?.[2]).toEqual([]);
	});
});
