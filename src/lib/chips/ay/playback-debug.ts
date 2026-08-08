import {
	formatPlaybackFrequencyHz,
	type ChipPlaybackDebugSpec
} from '../base/playback-debug';
import {
	AY_REGISTER_COUNT,
	DEFAULT_AY_REGISTERS
} from '../../services/file/ay/ay-export-utils';
import { AY_REGISTER_NAMES, formatTimerFrequencyHz } from '../../services/file/tmr/tmr-parser';

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
			formatHz: (hz) =>
				hz === null || hz <= 0 ? '—' : formatTimerFrequencyHz(hz)
		},
		{
			key: 'sync',
			label: 'Syncbuzzer',
			icon: 'sync',
			accentClass: 'text-[var(--color-pattern-envelope)]',
			readHz: (state, channelIndex) => state?.syncbuzzerTimerHz[channelIndex] ?? null,
			formatHz: (hz) =>
				hz === null || hz <= 0 ? '—' : formatTimerFrequencyHz(hz)
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
