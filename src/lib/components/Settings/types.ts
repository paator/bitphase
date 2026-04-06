export interface Settings {
	volume: number;
	envelopeAsNote: boolean;
	autoEnterInstrument: boolean;
	midiInputDeviceId: string;
	patternEditorFontSize: number;
	patternEditorFontFamily: string;
	uiFontFamily: string;
	channelSeparatorWidth: number;
	decimalRowNumbers: boolean;
	showOscilloscopes: boolean;
	showInstrumentPreview: boolean;
	debugMode: boolean;
	selectionStyle: 'inverted' | 'filled';
}

export interface SettingsItem {
	label: string;
	description: string;
	type: string;
	defaultValue: any;
	setting: keyof Settings;
	category?: 'general' | 'keyboard' | 'appearance' | 'ayYm';
	min?: number;
	max?: number;
	step?: number;
	options?: { value: string; label: string }[];
}

export interface SettingsTabState {
	hasUnsavedValue: boolean;
	hasConflictsValue: boolean;
	revert: () => void;
}
