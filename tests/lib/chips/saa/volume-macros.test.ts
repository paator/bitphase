import { describe, expect, it } from 'vitest';
import { combineSaaLevel } from '../../../../public/saa/saa-levels.js';
import { createDefaultInstrumentMacros } from '@/lib/chips/base/instrument-macros';
import { SAA_VOLUME_MACRO_FIELDS } from '@/lib/chips/saa/volume-macros';

describe('SAA volume macro', () => {
	it('defaults both sides to full and the slide to off', () => {
		const macros = createDefaultInstrumentMacros(SAA_VOLUME_MACRO_FIELDS);
		expect(macros.left.values).toEqual([15]);
		expect(macros.right.values).toEqual([15]);
		expect(macros.amplitudeSlide.values).toEqual([0]);
		expect(SAA_VOLUME_MACRO_FIELDS.map((field) => field.group)).toEqual([
			'Volume',
			'Volume',
			'Volume',
			'Waveform',
			'Tone parameters',
			'Tone parameters',
			'Waveform',
			'Noise parameters',
			'Noise parameters'
		]);
		expect(macros.toneAdd.values).toEqual([0]);
		expect(macros.toneAccumulation.values).toEqual([false]);
		expect(macros.noiseAdd.values).toEqual([0]);
		expect(macros.noiseAccumulation.values).toEqual([false]);
		expect(macros.tone.values).toEqual([true]);
		expect(macros.noise.values).toEqual([false]);
	});

	it('scales each side by the pattern level after the slide', () => {
		expect(combineSaaLevel(15, 15, 0)).toBe(15);
		expect(combineSaaLevel(8, 15, 0)).toBe(8);
		expect(combineSaaLevel(15, 10, 2)).toBe(12);
		expect(combineSaaLevel(15, 2, -5)).toBe(0);
		expect(combineSaaLevel(0, 15, 0)).toBe(0);
		expect(combineSaaLevel(-1, 15, 0)).toBe(0);
	});
});
