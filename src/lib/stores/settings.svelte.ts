import type { Settings } from '../components/Settings/types';
import { settingsItems } from '../config/settings';

const STORAGE_KEY = 'settings';

class SettingsStore {
	volume = $state(60);
	envelopeAsNote = $state(false);
	autoEnterInstrument = $state(false);
	midiInputDeviceId = $state('');
	patternEditorFontSize = $state(14);
	patternEditorFontFamily = $state('monospace');
	uiFontFamily = $state('Fira Code');
	channelSeparatorWidth = $state(1);
	decimalRowNumbers = $state(false);
	showOscilloscopes = $state(true);
	showInstrumentPreview = $state(true);
	debugMode = $state(false);
	selectionStyle = $state<'inverted' | 'filled'>('inverted');

	init(): void {
		const stored = localStorage.getItem(STORAGE_KEY);
		const defaults = Object.fromEntries(
			settingsItems.map((item) => [item.setting, item.defaultValue])
		);
		const merged = stored
			? { ...defaults, ...(JSON.parse(stored) as Partial<Settings>) }
			: defaults;

		for (const item of settingsItems) {
			(this as Record<string, unknown>)[item.setting] =
				merged[item.setting as keyof typeof merged];
		}
		this.save();
	}

	set<K extends keyof Settings>(key: K, value: Settings[K]): void {
		(this as Record<string, unknown>)[key] = value;
		this.save();
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
