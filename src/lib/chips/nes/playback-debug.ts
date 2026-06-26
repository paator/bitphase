import {
	formatPlaybackFrequencyHz,
	type ChipPlaybackDebugSpec
} from '../base/playback-debug';

export const NES_PLAYBACK_DEBUG: ChipPlaybackDebugSpec = {
	metrics: [
		{
			key: 'tone',
			label: 'Tone',
			icon: 'tone',
			accentClass: 'text-[var(--color-pattern-note)]',
			readHz: (state, channelIndex) => state?.toneHz[channelIndex] ?? null,
			formatHz: formatPlaybackFrequencyHz
		}
	]
};
