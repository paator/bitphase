import { describe, expect, it } from 'vitest';
import { appearanceSettings, settingsItems } from '../../../src/lib/config/settings';

describe('settings', () => {
	it('shares hex numerals between instrument and table editors', () => {
		const item = appearanceSettings.find((setting) => setting.setting === 'hexNumerals');
		expect(item).toEqual(
			expect.objectContaining({
				type: 'toggle',
				defaultValue: false,
				category: 'appearance'
			})
		);
		expect(settingsItems.some((setting) => setting.setting === 'hexNumerals')).toBe(true);
	});

	it('keeps piano roll ghost notes off unless enabled', () => {
		const item = appearanceSettings.find((setting) => setting.setting === 'pianoRollGhostNotes');
		expect(item).toEqual(
			expect.objectContaining({
				type: 'toggle',
				defaultValue: false,
				category: 'appearance'
			})
		);
	});

	it('keeps experimental features off unless enabled', () => {
		const item = settingsItems.find((setting) => setting.setting === 'experimentalFeatures');
		expect(item).toEqual(
			expect.objectContaining({
				type: 'toggle',
				defaultValue: false,
				category: 'general'
			})
		);
	});
});
