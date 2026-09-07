import { describe, expect, it } from 'vitest';
import {
	EFFECT_FORMAT_COLORS,
	getEffectFormatCharColors,
	getEffectFormatColorSegments,
	getEffectParamColorSegments,
	getEffectStatusHintColorSegments
} from '@/lib/chips/base/effect-format-color';

describe('effect format colors', () => {
	it('colors format nibbles like the pattern editor', () => {
		expect(getEffectFormatCharColors('AXYZ')).toEqual([
			EFFECT_FORMAT_COLORS.code,
			EFFECT_FORMAT_COLORS.delay,
			EFFECT_FORMAT_COLORS.parameter,
			EFFECT_FORMAT_COLORS.parameter
		]);
		expect(getEffectFormatCharColors('AXTY')).toEqual([
			EFFECT_FORMAT_COLORS.code,
			EFFECT_FORMAT_COLORS.delay,
			EFFECT_FORMAT_COLORS.table,
			EFFECT_FORMAT_COLORS.table
		]);
		expect(getEffectFormatCharColors('4.XY')).toEqual([
			EFFECT_FORMAT_COLORS.code,
			EFFECT_FORMAT_COLORS.literal,
			EFFECT_FORMAT_COLORS.parameter,
			EFFECT_FORMAT_COLORS.parameter
		]);
		expect(getEffectFormatCharColors('E1TY')[2]).toBe(EFFECT_FORMAT_COLORS.table);
	});

	it('merges adjacent format characters that share a color', () => {
		expect(getEffectFormatColorSegments('AXYZ')).toEqual([
			{ text: 'A', color: EFFECT_FORMAT_COLORS.code },
			{ text: 'X', color: EFFECT_FORMAT_COLORS.delay },
			{ text: 'YZ', color: EFFECT_FORMAT_COLORS.parameter }
		]);
	});

	it('colors param placeholders from the format roles', () => {
		expect(getEffectParamColorSegments('AXYZ', 'X: steps; Y: offset; Z: offset')).toEqual([
			{ text: 'X', color: EFFECT_FORMAT_COLORS.delay },
			{ text: ': steps; ', color: EFFECT_FORMAT_COLORS.body },
			{ text: 'Y', color: EFFECT_FORMAT_COLORS.parameter },
			{ text: ': offset; ', color: EFFECT_FORMAT_COLORS.body },
			{ text: 'Z', color: EFFECT_FORMAT_COLORS.parameter },
			{ text: ': offset', color: EFFECT_FORMAT_COLORS.body }
		]);
		expect(getEffectParamColorSegments('1XTY', 'X: delay; Y: table')).toEqual([
			{ text: 'X', color: EFFECT_FORMAT_COLORS.delay },
			{ text: ': delay; ', color: EFFECT_FORMAT_COLORS.body },
			{ text: 'Y', color: EFFECT_FORMAT_COLORS.table },
			{ text: ': table', color: EFFECT_FORMAT_COLORS.body }
		]);
	});

	it('keeps the status-bar wording when colored', () => {
		const hint = {
			format: 'AXYZ',
			name: 'Arpeggio',
			params: 'X: steps; Y: offset; Z: offset'
		};
		expect(
			getEffectStatusHintColorSegments(hint)
				.map((segment) => segment.text)
				.join('')
		).toBe('AXYZ: Arpeggio (X: steps; Y: offset; Z: offset)');
	});
});
