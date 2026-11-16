import type { Settings } from '../components/Settings/types';
import {
	clampIntegerSetting,
	PATTERN_EDITOR_PAGE_STEP_DEFAULT,
	PATTERN_EDITOR_PAGE_STEP_MAX,
	PATTERN_EDITOR_PAGE_STEP_MIN,
	PATTERN_EDITOR_SCROLL_ROWS_DEFAULT,
	PATTERN_EDITOR_SCROLL_ROWS_MAX,
	PATTERN_EDITOR_SCROLL_ROWS_MIN,
	settingsItems
} from '../config/settings';

const STORAGE_KEY = 'settings';

class SettingsStore {
	volume = $state(60);
	envelopeAsNote = $state(false);
	autoEnterInstrument = $state(true);
	midiInputDeviceId = $state('');
	patternEditorFontSize = $state(14);
	patternEditorPageStep = $state(PATTERN_EDITOR_PAGE_STEP_DEFAULT);
	patternEditorScrollRows = $state(PATTERN_EDITOR_SCROLL_ROWS_DEFAULT);
	patternEditorFontFamily = $state('JetBrains Mono');
	uiFontFamily = $state('Fira Code');
	channelSeparatorWidth = $state(1);
	decimalRowNumbers = $state(false);
	hexNumerals = $state(false);
	showOscilloscopes = $state(true);
	showChannelVolumeBars = $state(true);
	showInstrumentPreview = $state(true);
	previewFullRow = $state(true);
	debugMode = $state(false);
	experimentalFeatures = $state(false);
	selectionStyle = $state<'inverted' | 'filled'>('inverted');
	emptyNoteAlignment = $state<'center' | 'baseline'>('center');
	classicInstrumentEditor = $state(false);
	pianoRollGhostNotes = $state(false);

	init(): void {
		const stored = localStorage.getItem(STORAGE_KEY);
		const defaults = Object.fromEntries(
			settingsItems.map((item) => [item.setting, item.defaultValue])
		);
		const merged = stored
			? { ...defaults, ...(JSON.parse(stored) as Partial<Settings>) }
			: defaults;

		for (const item of settingsItems) {
			(this as Record<string, unknown>)[item.setting] = this.normalize(
				item.setting,
				merged[item.setting as keyof typeof merged]
			);
		}
		this.save();
	}

	set<K extends keyof Settings>(key: K, value: Settings[K]): void {
		(this as Record<string, unknown>)[key] = this.normalize(key, value);
		this.save();
	}

	private normalize(key: keyof Settings, value: unknown): unknown {
		if (key === 'patternEditorPageStep') {
			return clampIntegerSetting(
				value,
				PATTERN_EDITOR_PAGE_STEP_MIN,
				PATTERN_EDITOR_PAGE_STEP_MAX,
				PATTERN_EDITOR_PAGE_STEP_DEFAULT
			);
		}
		if (key === 'patternEditorScrollRows') {
			return clampIntegerSetting(
				value,
				PATTERN_EDITOR_SCROLL_ROWS_MIN,
				PATTERN_EDITOR_SCROLL_ROWS_MAX,
				PATTERN_EDITOR_SCROLL_ROWS_DEFAULT
			);
		}
		return value;
	}

	private save(): void {
		const data: Record<string, unknown> = {};
		for (const item of settingsItems) {
			data[item.setting] = (this as Record<string, unknown>)[item.setting];
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}
}

export const settingsStore = new SettingsStore();
