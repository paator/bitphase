import { describe, expect, it } from 'vitest';
import {
	createDefaultNesInstrumentRow,
	cyclePulseWidth,
	ensureNesInstrumentRows,
	normalizeNesInstrumentRow
} from '@/lib/chips/nes/instrument';

describe('nes instrument', () => {
	it('creates a default macro row with retrigger off', () => {
		expect(createDefaultNesInstrumentRow()).toEqual({
			pulseWidth: 2,
			retrigger: false,
			toneAdd: 0,
			toneAccumulation: false
		});
	});

	it('normalizes partial rows and ensures at least one row', () => {
		expect(normalizeNesInstrumentRow({ retrigger: 1, pulseWidth: 99, toneAdd: -2 })).toEqual({
			pulseWidth: 2,
			retrigger: true,
			toneAdd: -2,
			toneAccumulation: false
		});
		expect(normalizeNesInstrumentRow({ toneAccumulation: true, toneAdd: 5000 })).toEqual({
			pulseWidth: 2,
			retrigger: false,
			toneAdd: 4095,
			toneAccumulation: true
		});
		expect(ensureNesInstrumentRows([])).toHaveLength(1);
	});

	it('cycles pulse width through duty options', () => {
		expect(cyclePulseWidth(0)).toBe(1);
		expect(cyclePulseWidth(3)).toBe(0);
	});
});
