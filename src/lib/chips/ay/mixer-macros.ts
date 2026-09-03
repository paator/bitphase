import type { InstrumentMacroField } from '../base/instrument-macros';

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;

export const AY_AMPLITUDE_SLIDE_OFF = 0;
export const AY_AMPLITUDE_SLIDE_UP = 1;
export const AY_AMPLITUDE_SLIDE_DOWN = -1;

export const AY_MIXER_MACRO_FIELDS: InstrumentMacroField[] = [
	{
		id: 'volume',
		label: 'Volume',
		title: 'Volume Level',
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
		title: 'Amplitude Slide: ↑ up / ↓ down / blank off',
		kind: 'enum',
		accent: 'volume',
		group: 'Volume',
		shareSequence: true,
		min: AY_AMPLITUDE_SLIDE_DOWN,
		max: AY_AMPLITUDE_SLIDE_UP,
		defaultValue: AY_AMPLITUDE_SLIDE_OFF,
		enumValues: [
			{ value: AY_AMPLITUDE_SLIDE_OFF, label: '' },
			{ value: AY_AMPLITUDE_SLIDE_UP, label: '↑' },
			{ value: AY_AMPLITUDE_SLIDE_DOWN, label: '↓' }
		],
		fromRow: (row) => {
			if (!row.amplitudeSliding) return AY_AMPLITUDE_SLIDE_OFF;
			return row.amplitudeSlideUp ? AY_AMPLITUDE_SLIDE_UP : AY_AMPLITUDE_SLIDE_DOWN;
		},
		toRow: (value, row) => {
			row.amplitudeSliding = value !== AY_AMPLITUDE_SLIDE_OFF;
			row.amplitudeSlideUp = value === AY_AMPLITUDE_SLIDE_UP;
		}
	},
	{
		id: 'tone',
		label: 'Tone',
		title: 'Tone Generator',
		kind: 'boolean',
		accent: 'tone',
		group: 'Waveform',
		shareSequence: true,
		defaultValue: true
	},
	{
		id: 'toneAdd',
		label: 'Offset',
		title: 'Tone Offset',
		kind: 'integer',
		accent: 'tone',
		group: 'Tone parameters',
		shareSequence: true,
		min: TONE_ADD_MIN,
		max: TONE_ADD_MAX,
		defaultValue: 0
	},
	{
		id: 'toneAccumulation',
		label: 'Accumulation',
		title: 'Tone Accumulation',
		kind: 'boolean',
		accent: 'tone',
		group: 'Tone parameters',
		shareSequence: true,
		defaultValue: false
	},
	{
		id: 'noise',
		label: 'Noise',
		title: 'Noise Generator',
		kind: 'boolean',
		accent: 'noise',
		group: 'Waveform',
		shareSequence: true,
		defaultValue: false
	},
	{
		id: 'noiseAdd',
		label: 'Offset',
		title: 'Noise Offset',
		kind: 'integer',
		accent: 'noise',
		group: 'Noise parameters',
		shareSequence: true,
		min: -31,
		max: 31,
		defaultValue: 0
	},
	{
		id: 'noiseAccumulation',
		label: 'Accumulation',
		title: 'Noise Accumulation',
		kind: 'boolean',
		accent: 'noise',
		group: 'Noise parameters',
		shareSequence: true,
		defaultValue: false
	},
	{
		id: 'envelope',
		label: 'Envelope',
		title: 'Hardware Envelope',
		kind: 'boolean',
		accent: 'envelope',
		group: 'Waveform',
		shareSequence: true,
		defaultValue: false
	},
	{
		id: 'envelopeAdd',
		label: 'Offset',
		title: 'Envelope Offset',
		kind: 'integer',
		accent: 'envelope',
		group: 'Envelope parameters',
		shareSequence: true,
		min: -255,
		max: 255,
		defaultValue: 0
	},
	{
		id: 'envelopeAccumulation',
		label: 'Accumulation',
		title: 'Envelope Accumulation',
		kind: 'boolean',
		accent: 'envelope',
		group: 'Envelope parameters',
		shareSequence: true,
		defaultValue: false
	},
	{
		id: 'retriggerEnvelope',
		label: 'Retrigger',
		title: 'Retrigger envelope when this step is played',
		kind: 'boolean',
		accent: 'envelope',
		group: 'Envelope retrigger',
		shareSequence: true,
		defaultValue: false
	}
];

export function createDefaultAyMixerRow(): Record<string, unknown> {
	return {
		tone: true,
		noise: false,
		envelope: false,
		retriggerEnvelope: false,
		toneAdd: 0,
		noiseAdd: 0,
		envelopeAdd: 0,
		volume: 15,
		loop: false,
		amplitudeSliding: false,
		amplitudeSlideUp: false,
		toneAccumulation: false,
		noiseAccumulation: false,
		envelopeAccumulation: false
	};
}
