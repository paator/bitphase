import { describe, expect, it } from 'vitest';
import {
	buildLengthCounterNibble,
	buildNoiseEnvelopeVolumeReg,
	buildSquareEnvelopeVolumeReg,
	buildSquareSweepReg,
	buildTriangleLinearReg,
	createDefaultNesInstrumentRow,
	cyclePulseWidth,
	ensureNesInstrumentRows,
	isNesVolumeField,
	NES_LENGTH_COUNTER_LENGTHS,
	NES_SQUARE_SWEEP_DISABLED,
	normalizeNesInstrumentRow,
	resolveLengthCounterIndex,
	usesTriangleLinearCounter
} from '@/lib/chips/nes/instrument';

describe('nes instrument', () => {
	it('creates a default macro row with constant volume and retrigger off', () => {
		expect(createDefaultNesInstrumentRow()).toEqual({
			pulseWidth: 2,
			retrigger: false,
			soundLength: 0,
			envelope: false,
			volumeOrRate: 15,
			toneAdd: 0,
			toneAccumulation: false,
			sweep: false,
			sweepRate: 0,
			sweepShift: 0
		});
	});

	it('normalizes partial rows and ensures at least one row', () => {
		expect(
			normalizeNesInstrumentRow({
				retrigger: 1,
				pulseWidth: 99,
				toneAdd: -2,
				soundLength: 999,
				envelope: true,
				volumeOrRate: 20
			})
		).toEqual({
			pulseWidth: 2,
			retrigger: true,
			soundLength: 511,
			envelope: true,
			volumeOrRate: 15,
			toneAdd: -2,
			toneAccumulation: false,
			sweep: false,
			sweepRate: 0,
			sweepShift: 0
		});
		expect(normalizeNesInstrumentRow({ toneAccumulation: true, toneAdd: 5000 })).toEqual({
			pulseWidth: 2,
			retrigger: false,
			soundLength: 0,
			envelope: false,
			volumeOrRate: 15,
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
				sweepShift: -9,
				envelope: true,
				volumeOrRate: 7
			})
		).toEqual({
			pulseWidth: 2,
			retrigger: false,
			soundLength: 0,
			envelope: true,
			volumeOrRate: 7,
			toneAdd: 0,
			toneAccumulation: false,
			sweep: true,
			sweepRate: 7,
			sweepShift: -7
		});
		expect(ensureNesInstrumentRows([])).toHaveLength(1);
	});

	it('exposes length counter table and volume field helper', () => {
		expect(NES_LENGTH_COUNTER_LENGTHS).toHaveLength(32);
		expect(isNesVolumeField(false)).toBe(true);
		expect(isNesVolumeField(true)).toBe(false);
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

	it('maps envelope bool and sound length to APU register bytes', () => {
		expect(buildSquareEnvelopeVolumeReg(2, false, 15, 0)).toBe(0xbf);
		expect(buildSquareEnvelopeVolumeReg(2, true, 7, 40)).toBe(0x87);
		expect(buildSquareEnvelopeVolumeReg(2, true, 7, 0)).toBe(0xa7);
		expect(buildSquareEnvelopeVolumeReg(2, true, 4, 40)).toBe(0x84);
		expect(buildNoiseEnvelopeVolumeReg(false, 10, 40)).toBe(0x1a);
		expect(buildLengthCounterNibble(0)).toBe(-1);
		expect(buildLengthCounterNibble(20)).toBe(resolveLengthCounterIndex(20));
		expect(buildTriangleLinearReg(0)).toBe(0xff);
		expect(buildTriangleLinearReg(64)).toBe(64);
		expect(usesTriangleLinearCounter(64)).toBe(true);
		expect(usesTriangleLinearCounter(200)).toBe(false);
	});
});
