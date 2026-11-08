import { getTotalVirtualChannelCount } from '../../models/virtual-channels';

export function channelCountForMute(options: {
	hardwareChannelCount: number;
	virtualChannelMap?: Record<number, number>;
	patternChannelCounts?: number[];
	existingMuteCount?: number;
}): number {
	const virtualCount = getTotalVirtualChannelCount(
		Math.max(0, options.hardwareChannelCount),
		options.virtualChannelMap ?? {}
	);
	let patternCount = 0;
	for (const count of options.patternChannelCounts ?? []) {
		if (count > patternCount) patternCount = count;
	}
	return Math.max(
		options.hardwareChannelCount,
		virtualCount,
		patternCount,
		options.existingMuteCount ?? 0
	);
}

export function soloChannelMutes(
	channelCount: number,
	soloChannel: number,
	isSoloChip: boolean
): boolean[] {
	const mutes = new Array<boolean>(channelCount);
	for (let channel = 0; channel < channelCount; channel++) {
		mutes[channel] = !(isSoloChip && channel === soloChannel);
	}
	return mutes;
}

export function clearedChannelMutes(channelCount: number): boolean[] {
	return new Array<boolean>(channelCount).fill(false);
}
