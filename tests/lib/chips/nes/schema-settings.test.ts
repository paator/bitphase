import { describe, expect, it } from 'vitest';
import {
	collectSettingSideEffects,
	normalizeChipSettingsRecord
} from '@/lib/chips/base/chip-settings';
import {
	NES_CHIP_SCHEMA,
	NES_DENDY_CPU_FREQUENCY,
	NES_NTSC_CPU_FREQUENCY,
	NES_PAL_CPU_FREQUENCY,
	resolveNesApuTimingType,
	resolveNesCpuFrequency
} from '@/lib/chips/nes/schema';

describe('NES chip settings schema hooks', () => {
	it('maps each system to the correct CPU frequency and APU timing type', () => {
		expect(resolveNesCpuFrequency('NTSC')).toBe(NES_NTSC_CPU_FREQUENCY);
		expect(resolveNesApuTimingType('NTSC')).toBe('NTSC');

		expect(resolveNesCpuFrequency('PAL')).toBe(NES_PAL_CPU_FREQUENCY);
		expect(resolveNesApuTimingType('PAL')).toBe('PAL');

		expect(resolveNesCpuFrequency('Dendy')).toBe(NES_DENDY_CPU_FREQUENCY);
		expect(resolveNesApuTimingType('Dendy')).toBe('NTSC');
	});

	it('normalizes chip frequency from the selected system', () => {
		expect(
			normalizeChipSettingsRecord(NES_CHIP_SCHEMA, {
				chipVariant: 'PAL'
			})
		).toEqual({
			chipVariant: 'PAL',
			chipFrequency: NES_PAL_CPU_FREQUENCY
		});

		expect(
			normalizeChipSettingsRecord(NES_CHIP_SCHEMA, {
				chipVariant: 'Dendy',
				chipFrequency: 1_789_772
			})
		).toEqual({
			chipVariant: 'Dendy',
			chipFrequency: NES_DENDY_CPU_FREQUENCY
		});
	});

	it('sets chip frequency as a side effect when system changes', () => {
		expect(
			collectSettingSideEffects(NES_CHIP_SCHEMA, 'chipVariant', 'Dendy', {
				chipVariant: 'Dendy'
			})
		).toEqual([{ key: 'chipFrequency', value: NES_DENDY_CPU_FREQUENCY }]);
	});
});
