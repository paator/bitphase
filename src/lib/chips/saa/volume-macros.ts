import type { InstrumentMacroField } from '../base/instrument-macros';

export const SAA_AMPLITUDE_SLIDE_OFF = 0;
export const SAA_AMPLITUDE_SLIDE_UP = 1;
export const SAA_AMPLITUDE_SLIDE_DOWN = -1;

export const SAA_VOLUME_MACRO_FIELDS: InstrumentMacroField[] = [
	{
		id: 'left',
		label: 'Left',
		title: 'Left volume',
		kind: 'integer',
		accent: 'volume',
		group: 'Volume',
		shareSequence: true,
		min: 0,
		max: 15,
		defaultValue: 15
	},
	{
		id: 'right',
		label: 'Right',
		title: 'Right volume',
		kind: 'integer',
		accent: 'volume',
		group: 'Volume',
		shareSequence: true,
		min: 0,
		max: 15,
		defaultValue: 15
	},
	{
		id: 'amplitudeSlide',
		label: 'Amplitude slide',
		title: 'Amplitude slide: up, down, or off. Applied to both left and right.',
		kind: 'enum',
		accent: 'volume',
		group: 'Volume',
		shareSequence: true,
		min: SAA_AMPLITUDE_SLIDE_DOWN,
		max: SAA_AMPLITUDE_SLIDE_UP,
		defaultValue: SAA_AMPLITUDE_SLIDE_OFF,
		enumValues: [
			{ value: SAA_AMPLITUDE_SLIDE_OFF, label: '', icon: 'close' },
			{ value: SAA_AMPLITUDE_SLIDE_UP, label: '↑', icon: 'up' },
			{ value: SAA_AMPLITUDE_SLIDE_DOWN, label: '↓', icon: 'down' }
		],
		fromRow: (row) => {
			if (!row.amplitudeSliding) return SAA_AMPLITUDE_SLIDE_OFF;
			return row.amplitudeSlideUp ? SAA_AMPLITUDE_SLIDE_UP : SAA_AMPLITUDE_SLIDE_DOWN;
		},
		toRow: (value, row) => {
			row.amplitudeSliding = value !== SAA_AMPLITUDE_SLIDE_OFF;
			row.amplitudeSlideUp = value === SAA_AMPLITUDE_SLIDE_UP;
		}
	},
	{
		id: 'tone',
		label: 'Tone',
		title: 'Square wave',
		kind: 'boolean',
		accent: 'tone',
		group: 'Waveform',
		shareSequence: true,
		defaultValue: true
	},
	{
		id: 'noise',
		label: 'Noise',
		title: 'Noise',
		kind: 'boolean',
		accent: 'noise',
		group: 'Waveform',
		shareSequence: true,
		defaultValue: false
	}
];
