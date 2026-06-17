import type { ChipPlaybackHzState } from '../../stores/playback-tone-debug.svelte';

export function formatPlaybackFrequencyHz(hz: number | null): string {
	if (hz === null || !Number.isFinite(hz) || hz <= 0) {
		return '—';
	}
	if (hz >= 1000) {
		return `${(hz / 1000).toFixed(2)} kHz`;
	}
	if (hz >= 100) {
		return `${hz.toFixed(1)} Hz`;
	}
	return `${hz.toFixed(2)} Hz`;
}

export type PlaybackDebugMetricIcon = 'tone' | 'sid' | 'sync';

export interface PlaybackDebugMetricSpec {
	key: string;
	label: string;
	icon: PlaybackDebugMetricIcon;
	accentClass: string;
	readHz: (state: ChipPlaybackHzState | undefined, channelIndex: number) => number | null;
	formatHz: (hz: number | null) => string;
}

export interface PlaybackDebugRegisterSpec {
	count: number;
	names: readonly string[];
	defaultValues: readonly number[];
	normalizeRegisters: (registers: number[] | undefined) => readonly number[];
}

export interface ChipPlaybackDebugSpec {
	metrics: PlaybackDebugMetricSpec[];
	registers?: PlaybackDebugRegisterSpec;
}
