import type { InstrumentMacroField } from '../base/instrument-macros';
import { NES_PULSE_WIDTHS, NES_PULSE_WIDTH_LABELS } from './instrument';

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;

export const NES_APU_MACRO_FIELDS: InstrumentMacroField[] = [
	{
		id: 'volumeOrRate',
		label: 'Volume / rate',
		title: 'Volume or envelope rate depending on mode',
		kind: 'integer',
		accent: 'volume',
		group: 'Volume',
		min: 0,
		max: 15,
		defaultValue: 15
	},
	{
		id: 'envelope',
		label: 'Envelope',
		title: 'Envelope (1) or constant volume (0), pulse and noise channels only',
		kind: 'boolean',
		accent: 'envelope',
		group: 'Volume',
		defaultValue: false
	},
	{
		id: 'retrigger',
		label: 'Retrigger',
		title: 'Retrigger',
		kind: 'boolean',
		accent: 'effect',
		group: 'Volume',
		defaultValue: false
	},
	{
		id: 'pulseWidth',
		label: 'Duty',
		title: 'Pulse width / Noise type',
		kind: 'enum',
		accent: 'tone',
		group: 'Waveform',
		min: 0,
		max: 3,
		defaultValue: 2,
		enumValues: NES_PULSE_WIDTHS.map((value) => ({
			value,
			label: NES_PULSE_WIDTH_LABELS[value],
			bar: true
		}))
	},
	{
		id: 'toneAdd',
		label: 'Offset',
		title: 'Tone Offset',
		kind: 'integer',
		accent: 'tone',
		group: 'Tone parameters',
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
		defaultValue: false
	},
	{
		id: 'sweep',
		label: 'Sweep',
		title: 'Hardware sweep, pulse channels only',
		kind: 'boolean',
		accent: 'effect',
		group: 'Sweep',
		defaultValue: false
	},
	{
		id: 'sweepRate',
		label: 'Rate',
		title: 'Hardware sweep rate (0–7), pulse channels only',
		kind: 'integer',
		accent: 'effect',
		group: 'Sweep',
		min: 0,
		max: 7,
		defaultValue: 0
	},
	{
		id: 'sweepShift',
		label: 'Shift',
		title: 'Hardware sweep shift (−7–7), pulse channels only',
		kind: 'integer',
		accent: 'effect',
		group: 'Sweep',
		min: -7,
		max: 7,
		defaultValue: 0
	},
	{
		id: 'soundLength',
		label: 'Sound length',
		title: 'Sound length (0–511, 0 is infinite and enables looping envelope)',
		kind: 'integer',
		accent: 'envelope',
		min: 0,
		max: 511,
		defaultValue: 0
	}
];
