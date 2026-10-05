import { describe, expect, it } from 'vitest';
import {
	collectSettingSideEffects,
	normalizeChipSettingsRecord
} from '@/lib/chips/base/chip-settings';
import {
	AY_CHIP_SCHEMA,
	ATARI_ST_CHIP_FREQUENCY,
	SUNSOFT_5B_CHIP_FREQUENCY
} from '@/lib/chips/ay/schema';

describe('AY chip settings schema hooks', () => {
	it('offers Sunsoft 5B as a chip frequency', () => {
		const frequency = AY_CHIP_SCHEMA.settings.find((setting) => setting.key === 'chipFrequency');
		expect(frequency?.options).toContainEqual({
			label: 'Sunsoft 5B (0.8949 MHz)',
			value: SUNSOFT_5B_CHIP_FREQUENCY
		});
	});

	it('forces mono stereo layout when ST mixing is enabled', () => {
		expect(
			normalizeChipSettingsRecord(AY_CHIP_SCHEMA, {
				stMixing: true,
				chipVariant: 'AY',
				stereoLayout: 'ABC',
				chipFrequency: 1773400
			})
		).toEqual({
			stMixing: true,
			chipVariant: 'YM',
			stereoLayout: 'mono',
			chipFrequency: ATARI_ST_CHIP_FREQUENCY
		});
	});

	it('returns YM, mono, and Atari ST frequency as side effects when ST mixing is turned on', () => {
		expect(
			collectSettingSideEffects(AY_CHIP_SCHEMA, 'stMixing', true, {
				stMixing: true,
				chipVariant: 'AY',
				stereoLayout: 'ABC',
				chipFrequency: 1773400
			})
		).toEqual([
			{ key: 'chipVariant', value: 'YM' },
			{ key: 'stereoLayout', value: 'mono' },
			{ key: 'chipFrequency', value: ATARI_ST_CHIP_FREQUENCY }
		]);
	});
});
