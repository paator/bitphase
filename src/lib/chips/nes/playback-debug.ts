import {
	formatPlaybackFrequencyHz,
	type ChipPlaybackDebugSpec
} from '../base/playback-debug';

const NES_REGISTER_COUNT = 0x18;

const NES_REGISTER_NAMES = [
	'Pulse 1 duty/volume',
	'Pulse 1 sweep',
	'Pulse 1 timer low',
	'Pulse 1 length',
	'Pulse 2 duty/volume',
	'Pulse 2 sweep',
	'Pulse 2 timer low',
	'Pulse 2 length',
	'Triangle linear',
	'Unused',
	'Triangle timer low',
	'Triangle length',
	'Noise volume',
	'Unused',
	'Noise period',
	'Noise length',
	'DMC frequency',
	'DMC load',
	'DMC address',
	'DMC length',
	'Unused',
	'Status',
	'Unused',
	'Frame counter'
] as const;

const NES_DEFAULT_REGISTERS = Array.from({ length: NES_REGISTER_COUNT }, () => 0);

export const NES_PLAYBACK_DEBUG: ChipPlaybackDebugSpec = {
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
		count: NES_REGISTER_COUNT,
		names: NES_REGISTER_NAMES,
		defaultValues: NES_DEFAULT_REGISTERS,
		normalizeRegisters: (registers) =>
			registers?.length === NES_REGISTER_COUNT ? registers : NES_DEFAULT_REGISTERS
	}
};
