import { describe, expect, it } from 'vitest';
import { Pattern, Effect } from '@/lib/models/song';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { describeAyEffect } from '@/lib/chips/ay/effects';
import { describeNesEffect } from '@/lib/chips/nes/effects';
import {
	describeGeneralEffect,
	describePatternEffect,
	getEffectFromPattern
} from '@/lib/chips/base/effect-status';

describe('effect status descriptions', () => {
	it('names general effect codes', () => {
		expect(
			describeGeneralEffect({ effect: 'A'.charCodeAt(0), delay: 1, parameter: 0x37 })
		).toBe('AXYZ: Arpeggio (X: steps; Y: offset; Z: offset)');
		expect(
			describeGeneralEffect({ effect: 'V'.charCodeAt(0), delay: 1, parameter: 0x44 })
		).toBe('VXYZ: Vibrato (X: delay; Y: speed; Z: depth)');
		expect(
			describeGeneralEffect({ effect: 4, delay: 0, parameter: 5 })
		).toBe('4.XY: Instrument Position (XY: row)');
		expect(
			describeGeneralEffect({ effect: 5, delay: 0, parameter: 3 })
		).toBe('5.XY: Table Position (XY: row)');
		expect(
			describeGeneralEffect({
				effect: 'V'.charCodeAt(0),
				delay: 1,
				parameter: 0,
				tableIndex: 0
			})
		).toBe('VXTY: Vibrato (X: delay; Y: table)');
		expect(describeGeneralEffect({ effect: 0, delay: 0, parameter: 0 })).toBeNull();
	});

	it('uses chip-specific E labels before general names', () => {
		const ayEffect = { effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x80 };
		expect(describeAyEffect(ayEffect)).toBe('E1XY: PWM Min (XY: duty)');
		expect(describePatternEffect(ayEffect, { describeEffect: describeAyEffect })).toBe(
			'E1XY: PWM Min (XY: duty)'
		);
		expect(describePatternEffect(ayEffect, { describeEffect: describeNesEffect })).toBe(
			'E1XY: Pulse Width (XY: duty, 00=inst)'
		);
		expect(
			describePatternEffect(
				{ effect: 'V'.charCodeAt(0), delay: 1, parameter: 0x44 },
				{ describeEffect: describeAyEffect }
			)
		).toBe('VXYZ: Vibrato (X: delay; Y: speed; Z: depth)');
	});

	it('reads the selected channel or envelope effect from the pattern', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].effectColumnCount = 2;
		pattern.channels[0].rows[0].effects = [
			new Effect('A'.charCodeAt(0), 1, 0x37),
			new Effect('V'.charCodeAt(0), 1, 0x44)
		];
		pattern.patternRows[0].envelopeEffect = new Effect('E'.charCodeAt(0), 0xa, 0x32);

		expect(getEffectFromPattern(pattern, 0, 'effect', 0)?.parameter).toBe(0x37);
		expect(getEffectFromPattern(pattern, 0, 'effect1', 0)?.parameter).toBe(0x44);
		expect(getEffectFromPattern(pattern, 0, 'envelopeEffect', 0)?.delay).toBe(0xa);
		expect(getEffectFromPattern(pattern, 0, 'volume', 0)).toBeNull();
	});
});
