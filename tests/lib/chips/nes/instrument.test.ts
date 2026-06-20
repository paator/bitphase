import { describe, expect, it } from 'vitest';
import {
	buildSquareSweepReg,
	createDefaultNesInstrumentRow,
	cyclePulseWidth,
	ensureNesInstrumentRows,
	NES_SQUARE_SWEEP_DISABLED,
	normalizeNesInstrumentRow
} from '@/lib/chips/nes/instrument';

describe('nes instrument', () => {
	it('creates a default macro row with retrigger off', () => {
		expect(createDefaultNesInstrumentRow()).toEqual({
			pulseWidth: 2,
			retrigger: false,
			toneAdd: 0,
			toneAccumulation: false,
			sweep: false,
			sweepRate: 0,
			sweepShift: 0
		});
	});

	it('normalizes partial rows and ensures at least one row', () => {
		expect(normalizeNesInstrumentRow({ retrigger: 1, pulseWidth: 99, toneAdd: -2 })).toEqual({
			pulseWidth: 2,
			retrigger: true,
			toneAdd: -2,
			toneAccumulation: false,
			sweep: false,
			sweepRate: 0,
			sweepShift: 0
		});
		expect(normalizeNesInstrumentRow({ toneAccumulation: true, toneAdd: 5000 })).toEqual({
			pulseWidth: 2,
			retrigger: false,
			toneAdd: 4095,
			toneAccumulation: true,
			sweep: false,
			sweepRate: 0,
			sweepShift: 0
		});
		expect(
			normalizeNesInstrumentRow({
				sweep: true,
				sweepRate: 12,
				sweepShift: -9
			})
		).toEqual({
			pulseWidth: 2,
			retrigger: false,
			toneAdd: 0,
			toneAccumulation: false,
			sweep: true,
			sweepRate: 7,
			sweepShift: -7
		});
		expect(ensureNesInstrumentRows([])).toHaveLength(1);
	});

	it('cycles pulse width through duty options', () => {
		expect(cyclePulseWidth(0)).toBe(1);
		expect(cyclePulseWidth(3)).toBe(0);
	});

	it('builds hardware sweep register bytes', () => {
		expect(buildSquareSweepReg(false, 3, 4)).toBe(NES_SQUARE_SWEEP_DISABLED);
		expect(buildSquareSweepReg(true, 0, 0)).toBe(NES_SQUARE_SWEEP_DISABLED);
		expect(buildSquareSweepReg(true, 3, 4)).toBe(0x80 | 0x34);
		expect(buildSquareSweepReg(true, 7, -5)).toBe(0x88 | 0x75);
	});
});
