import { describe, expect, it } from 'vitest';
import {
	MAX_CHANNEL_EFFECT_COLUMNS,
	MIN_CHANNEL_EFFECT_COLUMNS,
	assignEffectsToGenericRow,
	clampChannelEffectColumnCount,
	expandChannelTemplate,
	getChannelEffectColumnLabel,
	getChannelEffectFieldKey,
	getChannelLayout,
	getEffectColumnCountFromGenericRow,
	isChannelEffectFieldKey,
	isEffectFieldKey,
	padEffectsArray,
	readEffectsFromGenericRow,
	resolveChannelEffectColumnCount,
	schemaHasChannelEffects
} from '@/lib/chips/base/channel-effect-columns';
import { Effect, EffectType } from '@/lib/models/song';
import { AYFormatter } from '@/lib/chips/ay/formatter';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import type { GenericRow } from '@/lib/models/song/generic';

describe('channel-effect-columns', () => {
	it('names extra slots as effect1, effect2, ...', () => {
		expect(getChannelEffectFieldKey(0)).toBe('effect');
		expect(getChannelEffectFieldKey(1)).toBe('effect1');
		expect(getChannelEffectFieldKey(7)).toBe('effect7');
		expect(isChannelEffectFieldKey('effect')).toBe(true);
		expect(isChannelEffectFieldKey('effect1')).toBe(true);
		expect(isChannelEffectFieldKey('envelopeEffect')).toBe(false);
		expect(isEffectFieldKey('envelopeEffect')).toBe(true);
		expect(getChannelEffectColumnLabel('effect')).toBe('Effect');
		expect(getChannelEffectColumnLabel('effect1')).toBe('Effect 2');
		expect(getChannelEffectColumnLabel('effect2')).toBe('Effect 3');
		expect(getChannelEffectColumnLabel('envelopeEffect')).toBeNull();
	});

	it('clamps column counts to 1-4', () => {
		expect(clampChannelEffectColumnCount(0)).toBe(MIN_CHANNEL_EFFECT_COLUMNS);
		expect(clampChannelEffectColumnCount(99)).toBe(MAX_CHANNEL_EFFECT_COLUMNS);
		expect(clampChannelEffectColumnCount(3.9)).toBe(3);
	});

	it('pads and truncates effect arrays', () => {
		expect(padEffectsArray([null], 3)).toEqual([null, null, null]);
		expect(padEffectsArray([null, null, null, null], 2)).toEqual([null, null]);
	});

	it('expands channel templates with extra effect fields', () => {
		expect(expandChannelTemplate('{note} {effect}', 1)).toBe('{note} {effect}');
		expect(expandChannelTemplate('{note} {effect}', 3)).toBe('{note} {effect} {effect1} {effect2}');
		expect(expandChannelTemplate('{note} {instrument}', 3)).toBe('{note} {instrument}');
	});

	it('treats channel effects as a schema capability', () => {
		expect(schemaHasChannelEffects(AY_CHIP_SCHEMA)).toBe(true);
		const noEffectSchema = {
			...AY_CHIP_SCHEMA,
			template: '{note} {instrument}',
			fields: { note: AY_CHIP_SCHEMA.fields.note, instrument: AY_CHIP_SCHEMA.fields.instrument }
		};
		expect(schemaHasChannelEffects(noEffectSchema)).toBe(false);
		const layout = getChannelLayout(noEffectSchema, 4);
		expect(layout.template).toBe('{note} {instrument}');
		expect(layout.fields.effect1).toBeUndefined();
	});

	it('infers column count from explicit value or longest effects array', () => {
		expect(resolveChannelEffectColumnCount({ effectColumnCount: 4 })).toBe(4);
		expect(
			resolveChannelEffectColumnCount({
				rows: [{ effects: [null] }, { effects: [null, null, null] }]
			})
		).toBe(3);
	});

	it('round-trips extra effect slots through generic rows', () => {
		const genericRow: GenericRow = {};
		const effects = [
			new Effect(EffectType.Arpeggio, 1, 0x37),
			new Effect(EffectType.Vibrato, 4, 0x44)
		];
		assignEffectsToGenericRow(genericRow, effects, 2);
		expect(getEffectColumnCountFromGenericRow(genericRow)).toBe(2);
		expect(genericRow.effect1).toEqual(
			expect.objectContaining({ effect: EffectType.Vibrato, parameter: 0x44 })
		);
		expect(readEffectsFromGenericRow(genericRow, 2)).toEqual([
			expect.objectContaining({ effect: EffectType.Arpeggio, parameter: 0x37 }),
			expect.objectContaining({ effect: EffectType.Vibrato, parameter: 0x44 })
		]);
	});

	it('formats extra effect columns in the row string', () => {
		const formatter = new AYFormatter();
		const genericRow: GenericRow = {
			note: 'C-4',
			instrument: 1,
			volume: 15,
			table: 0,
			envelopeShape: 0
		};
		assignEffectsToGenericRow(
			genericRow,
			[new Effect(EffectType.Arpeggio, 1, 0x37), new Effect(EffectType.Vibrato, 4, 0x44)],
			2
		);
		const row = formatter.formatRow({}, [genericRow], 0, AY_CHIP_SCHEMA);
		expect(row).toContain('A137');
		expect(row).toContain('V444');
	});
});
