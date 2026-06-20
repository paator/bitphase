import { describe, expect, it } from 'vitest';
import {
	collectSettingSideEffects,
	normalizeChipSettingsRecord
} from '@/lib/chips/base/chip-settings';
import {
	NES_CHIP_SCHEMA,
	NES_DENDY_CPU_FREQUENCY,
	NES_MAX_TUNING_PERIOD,
	NES_NTSC_CPU_FREQUENCY,
	NES_PAL_CPU_FREQUENCY,
	resolveNesApuTimingType,
	resolveNesCpuFrequency,
	resolveNesTuningTable
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

	it('exposes configurable interrupt frequency options like AY', () => {
		const setting = NES_CHIP_SCHEMA.settings?.find((s) => s.key === 'interruptFrequency');
		expect(setting).toBeDefined();
		expect(setting?.defaultValue).toBe(50);
		expect(setting?.notifyAudioService).toBe(true);
		expect(setting?.options?.map((option) => option.value)).toEqual([50, 60]);
	});

	it('builds a 12-TET tuning table from CPU frequency and A4', () => {
		const table = resolveNesTuningTable(NES_NTSC_CPU_FREQUENCY, 440);
		expect(table).toHaveLength(96);
		expect(table.every((period) => period <= NES_MAX_TUNING_PERIOD)).toBe(true);
		expect(table[45]).toBe(Math.round(NES_NTSC_CPU_FREQUENCY / 16 / 440));
	});

	it('regenerates tuning table when CPU frequency changes', () => {
		const ntsc = resolveNesTuningTable(NES_NTSC_CPU_FREQUENCY, 440);
		const pal = resolveNesTuningTable(NES_PAL_CPU_FREQUENCY, 440);
		expect(ntsc[45]).not.toBe(pal[45]);
	});

	it('clamps A4 tuning Hz when resolving from song settings', () => {
		const table = NES_CHIP_SCHEMA.resolveTuningTable!({
			chipFrequency: NES_NTSC_CPU_FREQUENCY,
			a4TuningHz: 1000
		});
		const expected = resolveNesTuningTable(NES_NTSC_CPU_FREQUENCY, 880);
		expect(table[45]).toBe(expected[45]);
	});
});
