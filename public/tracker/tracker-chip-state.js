export const TRACKER_CHANNEL_ARRAY_SKIP_ON_RESET = ['channelMuted'];

export function buildInstrumentIdToIndex(instruments) {
	const instrumentIdToIndex = new Map();
	instruments.forEach((instrument, index) => {
		if (instrument && instrument.id !== undefined) {
			let numericId;
			if (typeof instrument.id === 'string') {
				numericId = parseInt(instrument.id, 36);
			} else {
				numericId = instrument.id;
			}
			instrumentIdToIndex.set(numericId, index);
		}
	});
	return instrumentIdToIndex;
}

export function initChipChannelArrays(state, channelCount, specs) {
	for (const [name, defaultVal] of specs) {
		state[name] = Array(channelCount).fill(defaultVal);
	}
}

export function resizeChipChannelArrays(state, newCount, specs) {
	for (const [name, defaultVal] of specs) {
		const arr = state[name];
		while (arr.length < newCount) arr.push(defaultVal);
		if (arr.length > newCount) arr.length = newCount;
	}
}

export function resetChipChannelArrays(
	state,
	specs,
	skipNames = TRACKER_CHANNEL_ARRAY_SKIP_ON_RESET
) {
	for (const [name, defaultVal] of specs) {
		if (skipNames.includes(name)) continue;
		state[name].fill(defaultVal);
	}
}
