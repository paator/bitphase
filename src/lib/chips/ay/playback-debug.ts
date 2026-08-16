import {
	formatPlaybackFrequencyHz,
	type ChipPlaybackDebugSpec
} from '../base/playback-debug';
import {
	AY_REGISTER_COUNT,
	DEFAULT_AY_REGISTERS
} from '../../services/file/ay/ay-export-utils';

const AY_REGISTER_NAMES = [
	'Tone A fine',
	'Tone A coarse',
	'Tone B fine',
	'Tone B coarse',
	'Tone C fine',
	'Tone C coarse',
	'Noise period',
	'Mixer',
	'Volume A',
	'Volume B',
	'Volume C',
	'Env period fine',
	'Env period coarse',
	'Env shape'
] as const;

export const AY_PLAYBACK_DEBUG: ChipPlaybackDebugSpec = {
	metrics: [
		{
			key: 'tone',
			label: 'Tone',
			icon: 'tone',
			accentClass: 'text-[var(--color-pattern-note)]',
			readHz: (state, channelIndex) => state?.toneHz[channelIndex] ?? null,
			formatHz: formatPlaybackFrequencyHz
		},
		{
			key: 'sid',
			label: 'SID/PWM',
			icon: 'sid',
			accentClass: 'text-[var(--color-pattern-instrument)]',
			readHz: (state, channelIndex) => state?.sidTimerHz[channelIndex] ?? null,
			formatHz: formatPlaybackFrequencyHz
		},
		{
			key: 'sync',
			label: 'Syncbuzzer',
			icon: 'sync',
			accentClass: 'text-[var(--color-pattern-envelope)]',
			readHz: (state, channelIndex) => state?.syncbuzzerTimerHz[channelIndex] ?? null,
			formatHz: formatPlaybackFrequencyHz
		}
	],
	registers: {
		count: AY_REGISTER_COUNT,
		names: AY_REGISTER_NAMES,
		defaultValues: DEFAULT_AY_REGISTERS,
		normalizeRegisters: (registers) =>
			registers?.length === AY_REGISTER_COUNT ? registers : DEFAULT_AY_REGISTERS
	}
};
