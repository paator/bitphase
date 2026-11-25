import { describe, expect, it } from 'vitest';
import {
	describeSaaNoise,
	saaNoiseAccumulationTooltip,
	saaNoiseColumnTooltip,
	saaNoiseEnableTooltip,
	saaNoiseOffsetTooltip
} from '@/lib/chips/saa/noise';

describe('SAA noise clocks', () => {
	it('names the pattern clock and keeps a blank cell', () => {
		expect(describeSaaNoise(0, 'A')).toBe('blank, keeps current');
		expect(describeSaaNoise(-1, 'A')).toBe('high');
		expect(describeSaaNoise(1, 'A')).toBe('mid');
		expect(describeSaaNoise(2, 'D')).toBe('low');
		expect(describeSaaNoise(3, 'A')).toBe('locked to A');
		expect(describeSaaNoise(3, 'D')).toBe('locked to D');
		expect(describeSaaNoise(5, 'A')).toBe('mid, from 5');
	});

	it('draws the column clock and leaves a blank cell without a shape', () => {
		const blank = saaNoiseColumnTooltip(0, 'A');
		const high = saaNoiseColumnTooltip(-1, 'A');
		const locked = saaNoiseColumnTooltip(3, 'D');
		expect(blank.heading).toBe('.');
		expect(blank.detail).toBe('Keeps the current clock');
		expect(blank.series).toBeUndefined();
		expect(blank.legend).toHaveLength(4);
		expect(high.heading).toBe('0');
		expect(high.detail).toBe('Fixed fast clock');
		expect(high.series?.[0]?.levels[0]).toBe(15);
		expect(high.legend?.find((item) => item.active)?.label).toBe('0');
		expect(locked.detail).toBe('Locked to channel D');
		expect(locked.series).toBeUndefined();
		expect(locked.icon).toBe('music');
		expect(locked.legend?.find((item) => item.active)?.icon).toBe('music');
	});

	it('explains the noise macros', () => {
		expect(saaNoiseEnableTooltip(true).heading).toBe('On');
		expect(saaNoiseEnableTooltip(false).detail).toContain('leaves the group noise out');
		const offset = saaNoiseOffsetTooltip(-1);
		expect(offset.heading).toBe('-1');
		expect(offset.detail).toContain('locked');
		expect(offset.icon).toBe('music');
		expect(offset.legend?.find((item) => item.active)?.label).toBe('3');
		expect(saaNoiseOffsetTooltip(0).series).toBeUndefined();
		expect(saaNoiseAccumulationTooltip(true).detail).toContain('following noise steps');
		expect(saaNoiseAccumulationTooltip(false).heading).toBe('Off');
	});
});
