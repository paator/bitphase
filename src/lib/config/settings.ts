import type { SettingsItem } from '../components/Settings/types';

const MONOSPACE_FONTS = [
	{ value: 'monospace', label: 'System Default' },
	{ value: 'Fira Code', label: 'Fira Code' },
	{ value: 'JetBrains Mono', label: 'JetBrains Mono' },
	{ value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
	{ value: 'Source Code Pro', label: 'Source Code Pro' },
	{ value: 'Iosevka Charon Mono', label: 'Iosevka Charon Mono' },
	{ value: 'Press Start 2P', label: 'Press Start 2P' }
] as const;

const SANS_FONTS = [
	{ value: 'sans-serif', label: 'System Default' },
	{ value: 'Inter', label: 'Inter' },
	{ value: 'Roboto', label: 'Roboto' },
	{ value: 'Open Sans', label: 'Open Sans' }
] as const;

export const settingsItems: SettingsItem[] = [
	{
		label: 'Volume',
		description: 'Changes the master volume of the audio output',
		type: 'range',
		defaultValue: 60,
		setting: 'volume',
		category: 'general'
	},
	{
		label: 'Envelope as Note',
		description: 'Enable envelope input as note for AY chips',
		type: 'toggle',
		defaultValue: false,
		setting: 'envelopeAsNote',
		category: 'ayYm'
	},
	{
		label: 'Auto-enter Instrument',
		description: 'Automatically insert the current instrument index when entering notes',
		type: 'toggle',
		defaultValue: false,
		setting: 'autoEnterInstrument',
		category: 'general'
	},
	{
		label: 'MIDI device',
		description: 'Which MIDI keyboard to use for note input',
		type: 'select',
		defaultValue: '',
		setting: 'midiInputDeviceId',
		category: 'keyboard',
		options: []
	},
	{
		label: 'Show Preview Playground',
		description: 'Display the preview playground in the right panel',
		type: 'toggle',
		defaultValue: true,
		setting: 'showInstrumentPreview',
		category: 'general'
	},
	{
		label: 'Preview Full Row',
		description:
			'When enabled, pattern input previews every channel on the current row. When disabled, only the edited channel is previewed',
		type: 'toggle',
		defaultValue: true,
		setting: 'previewFullRow',
		category: 'general'
	},
	{
		label: 'Debug Mode',
		description: 'Show playback debug panel and log each playback row in the console',
		type: 'toggle',
		defaultValue: false,
		setting: 'debugMode',
		category: 'general'
	},
	{
		label: 'Pattern Editor Font Size',
		description: 'Adjust the font size in the pattern editor',
		type: 'number',
		defaultValue: 14,
		setting: 'patternEditorFontSize',
		category: 'appearance',
		min: 8,
		max: 30,
		step: 1
	},
	{
		label: 'Pattern Editor Font Family',
		description: 'Choose the font for the pattern editor',
		type: 'select',
		defaultValue: 'monospace',
		setting: 'patternEditorFontFamily',
		category: 'appearance',
		options: [...MONOSPACE_FONTS]
	},
	{
		label: 'UI Font Family',
		description: 'Choose the font for the user interface',
		type: 'select',
		defaultValue: 'Fira Code',
		setting: 'uiFontFamily',
		category: 'appearance',
		options: [
			...MONOSPACE_FONTS.map((font) => ({
				value: font.value,
				label: `${font.label} (Monospace)`
			})),
			...SANS_FONTS.map((font) => ({
				value: font.value,
				label: `${font.label} (Sans-serif)`
			}))
		]
	},
	{
		label: 'Channel Separator Width',
		description: 'Adjust the width of channel separators in the pattern editor',
		type: 'range',
		defaultValue: 1,
		setting: 'channelSeparatorWidth',
		category: 'appearance',
		min: 0,
		max: 3,
		step: 0.1
	},
	{
		label: 'Decimal Row Numbers',
		description: 'Display row numbers in decimal instead of hexadecimal',
		type: 'toggle',
		defaultValue: false,
		setting: 'decimalRowNumbers',
		category: 'appearance'
	},
	{
		label: 'Show Oscilloscopes',
		description: 'Display per-channel waveform oscilloscopes',
		type: 'toggle',
		defaultValue: true,
		setting: 'showOscilloscopes',
		category: 'appearance'
	},
	{
		label: 'Show Channel Volume Bars',
		description: 'Display live volume meters under pattern editor channel headers',
		type: 'toggle',
		defaultValue: true,
		setting: 'showChannelVolumeBars',
		category: 'appearance'
	},
	{
		label: 'Selection Style',
		description:
			'Inverted uses a negative filter for high visibility; Filled uses a semi-transparent overlay',
		type: 'select',
		defaultValue: 'inverted',
		setting: 'selectionStyle',
		category: 'appearance',
		options: [
			{ value: 'inverted', label: 'Inverted' },
			{ value: 'filled', label: 'Filled' }
		]
	}
];

export const generalSettings = settingsItems.filter((item) => item.category === 'general');
export const keyboardSettings = settingsItems.filter((item) => item.category === 'keyboard');
export const appearanceSettings = settingsItems.filter((item) => item.category === 'appearance');
export const ayYmSettings = settingsItems.filter((item) => item.category === 'ayYm');
