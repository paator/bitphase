import { describe, expect, it } from 'vitest';
import {
	appearanceSettings,
	PATTERN_EDITOR_PAGE_STEP_DEFAULT,
	PATTERN_EDITOR_SCROLL_ROWS_DEFAULT,
	settingsItems
} from '../../../src/lib/config/settings';

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

	it('exposes pattern editor page and wheel steps', () => {
		expect(settingsItems.find((setting) => setting.setting === 'patternEditorPageStep')).toEqual(
			expect.objectContaining({
				type: 'number',
				defaultValue: PATTERN_EDITOR_PAGE_STEP_DEFAULT,
				category: 'general',
				min: 1,
				max: 256
			})
		);
		expect(settingsItems.find((setting) => setting.setting === 'patternEditorScrollRows')).toEqual(
			expect.objectContaining({
				type: 'number',
				defaultValue: PATTERN_EDITOR_SCROLL_ROWS_DEFAULT,
				category: 'general',
				min: 1,
				max: 64
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
