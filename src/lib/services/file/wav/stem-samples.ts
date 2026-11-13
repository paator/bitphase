export function stemBufferCount(channelCount: number, stereo: boolean): number {
	return stereo ? channelCount * 2 : channelCount;
}

export function pushStemSample(
	buffers: number[][],
	channelIndex: number,
	stereo: boolean,
	mono: number,
	left: number,
	right: number
): void {
	if (!stereo) {
		buffers[channelIndex]!.push(mono);
		return;
	}
	buffers[channelIndex * 2]!.push(left);
	buffers[channelIndex * 2 + 1]!.push(right);
}

export function appendStemSample(
	channels: number[],
	stereo: boolean,
	mono: number,
	left: number,
	right: number
): void {
	if (!stereo) {
		channels.push(mono);
		return;
	}
	channels.push(left, right);
}
