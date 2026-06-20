import { describe, expect, it } from 'vitest';
import {
	buildLengthCounterNibble,
	buildNoiseEnvelopeVolumeReg,
	buildSquareEnvelopeVolumeReg,
	buildSquareSweepReg,
	buildTriangleLinearReg,
	createDefaultNesInstrumentRow,
	cycleNesEnvelopeMode,
	cyclePulseWidth,
	ensureNesInstrumentRows,
	isNesSoundLengthEnabled,
	isNesVolumeField,
	NES_LENGTH_COUNTER_LENGTHS,
	NES_REGISTER_UNCHANGED,
	NES_SQUARE_SWEEP_DISABLED,
	normalizeNesInstrumentRow,
	resolveLengthCounterIndex,
	usesTriangleLinearCounter
} from '@/lib/chips/nes/instrument';

describe('nes instrument', () => {
	it('creates a default macro row with infinite envelope and retrigger off', () => {
		expect(createDefaultNesInstrumentRow()).toEqual({
			pulseWidth: 2,
			retrigger: false,
			soundLength: 0,
			envelopeMode: 'infinite',
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
				envelopeMode: 'bogus',
				volumeOrRate: 20
			})
		).toEqual({
			pulseWidth: 2,
			retrigger: true,
			soundLength: 0,
			envelopeMode: 'infinite',
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
			envelopeMode: 'infinite',
			volumeOrRate: 0,
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
				envelopeMode: 'loop',
				volumeOrRate: 7
			})
		).toEqual({
			pulseWidth: 2,
			retrigger: false,
			soundLength: 0,
			envelopeMode: 'loop',
			volumeOrRate: 7,
			toneAdd: 0,
			toneAccumulation: false,
			sweep: true,
			sweepRate: 7,
			sweepShift: -7
		});
		expect(ensureNesInstrumentRows([])).toHaveLength(1);
	});

	it('forces sound length to zero in infinite envelope mode', () => {
		expect(
			normalizeNesInstrumentRow({
				envelopeMode: 'infinite',
				soundLength: 200
			}).soundLength
		).toBe(0);
	});

	it('cycles envelope modes and exposes length counter table', () => {
		expect(cycleNesEnvelopeMode('infinite')).toBe('decay');
		expect(cycleNesEnvelopeMode('unchanged')).toBe('infinite');
		expect(NES_LENGTH_COUNTER_LENGTHS).toHaveLength(32);
		expect(isNesSoundLengthEnabled('decay')).toBe(true);
		expect(isNesSoundLengthEnabled('infinite')).toBe(false);
		expect(isNesVolumeField('infinite')).toBe(true);
		expect(isNesVolumeField('decay')).toBe(false);
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

	it('maps envelope modes and sound length to APU register bytes', () => {
		expect(buildSquareEnvelopeVolumeReg(2, 'infinite', 15, 0)).toBe(0xbf);
		expect(buildSquareEnvelopeVolumeReg(2, 'decay', 7, 40)).toBe(0x87);
		expect(buildSquareEnvelopeVolumeReg(2, 'decay', 7, 0)).toBe(0xa7);
		expect(buildSquareEnvelopeVolumeReg(2, 'loop', 4, 0)).toBe(0xa4);
		expect(buildSquareEnvelopeVolumeReg(2, 'loop', 4, 40)).toBe(0x84);
		expect(buildSquareEnvelopeVolumeReg(2, 'unchanged', 15, 0)).toBe(NES_REGISTER_UNCHANGED);
		expect(buildNoiseEnvelopeVolumeReg('hold', 10, 40)).toBe(0x1a);
		expect(buildLengthCounterNibble('infinite', 200)).toBe(NES_REGISTER_UNCHANGED);
		expect(buildLengthCounterNibble('decay', 0)).toBe(NES_REGISTER_UNCHANGED);
		expect(buildLengthCounterNibble('decay', 20)).toBe(resolveLengthCounterIndex(20));
		expect(buildTriangleLinearReg('infinite', 0)).toBe(0xff);
		expect(buildTriangleLinearReg('decay', 0)).toBe(0xff);
		expect(buildTriangleLinearReg('decay', 64)).toBe(64);
		expect(usesTriangleLinearCounter('decay', 64)).toBe(true);
		expect(usesTriangleLinearCounter('decay', 200)).toBe(false);
	});
});
