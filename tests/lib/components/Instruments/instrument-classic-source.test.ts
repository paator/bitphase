import { describe, expect, it } from 'vitest';
import { Instrument } from '@/lib/models/song';
import { AY_MIXER_MACRO_FIELDS } from '@/lib/chips/ay/mixer-macros';
import { resolveInstrumentMacros } from '@/lib/chips/base/instrument-macros';
import {
	classicTableFromMacros,
	commitClassicTableMacros
} from '@/lib/components/Instruments/instrument-classic-source';

describe('classic instrument table source', () => {
	it('projects macros into a shared row table without storing rows on the instrument', () => {
		const instrument = new Instrument('01', 'Lead', 'ay');
		instrument.macros = {
			volume: { values: [15, 12, 8], loop: 1 },
			tone: { values: [true, true, false], loop: 1 },
			toneAdd: { values: [0, 1, 2], loop: 1 }
		};
		const macros = resolveInstrumentMacros(instrument, AY_MIXER_MACRO_FIELDS);
		const table = classicTableFromMacros(instrument, AY_MIXER_MACRO_FIELDS, macros);
		expect(table.rows).toHaveLength(3);
		expect(table.loop).toBe(1);
		expect(table.rows[1]?.volume).toBe(12);
		expect(table.rows[2]?.tone).toBe(false);
		expect(instrument).not.toHaveProperty('rows');
	});

	it('writes table edits back to macros with a shared loop', () => {
		const instrument = new Instrument('01', 'Lead', 'ay');
		const next = commitClassicTableMacros(
			instrument,
			AY_MIXER_MACRO_FIELDS,
			[
				{ tone: true, volume: 15, toneAdd: 0, amplitudeSliding: false },
				{ tone: false, volume: 8, toneAdd: 4, amplitudeSliding: true, amplitudeSlideUp: true }
			],
			1
		);
		expect(next.macros?.volume?.values).toEqual([15, 8]);
		expect(next.macros?.tone?.values).toEqual([true, false]);
		expect(next.macros?.toneAdd?.values).toEqual([0, 4]);
		expect(next.macros?.amplitudeSlide?.values).toEqual([0, 1]);
		expect(next.macros?.volume?.loop).toBe(1);
		expect(next.macros?.tone?.loop).toBe(1);
		expect(next).not.toHaveProperty('rows');
	});
});
