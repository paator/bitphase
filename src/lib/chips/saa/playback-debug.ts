import {
	formatPlaybackFrequencyHz,
	type ChipPlaybackDebugSpec
} from '../base/playback-debug';

const SAA_REGISTER_COUNT = 32;
const SAA_REG_ENABLE = 28;
const SAA_ENABLE_OUTPUT = 0x01;

const SAA_REGISTER_NAMES = [
	'Level 0',
	'Level 1',
	'Level 2',
	'Level 3',
	'Level 4',
	'Level 5',
	'Unused',
	'Unused',
	'Frequency 0',
	'Frequency 1',
	'Frequency 2',
	'Frequency 3',
	'Frequency 4',
	'Frequency 5',
	'Unused',
	'Unused',
	'Octave 0/1',
	'Octave 2/3',
	'Octave 4/5',
	'Unused',
	'Tone enable',
	'Noise enable',
	'Noise clock',
	'Unused',
	'Envelope 0',
	'Envelope 1',
	'Unused',
	'Unused',
	'Sound enable',
	'Unused',
	'Unused',
	'Unused'
] as const;

const SAA_DEFAULT_REGISTERS = Array.from({ length: SAA_REGISTER_COUNT }, (_, index) =>
	index === SAA_REG_ENABLE ? SAA_ENABLE_OUTPUT : 0
);

export const SAA_PLAYBACK_DEBUG: ChipPlaybackDebugSpec = {
	metrics: [
		{
			key: 'tone',
			label: 'Freq',
			icon: 'tone',
			accentClass: 'text-[var(--color-pattern-note)]',
			readHz: (state, channelIndex) => state?.toneHz[channelIndex] ?? null,
			formatHz: formatPlaybackFrequencyHz
		}
	],
	registers: {
		count: SAA_REGISTER_COUNT,
		names: SAA_REGISTER_NAMES,
		defaultValues: SAA_DEFAULT_REGISTERS,
		normalizeRegisters: (registers) =>
			registers?.length === SAA_REGISTER_COUNT ? registers : SAA_DEFAULT_REGISTERS
	}
};
