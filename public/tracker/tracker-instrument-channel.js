export function getChannelInstrument(state, channelIndex) {
	const instrumentIndex = state.channelInstruments?.[channelIndex] ?? -1;
	if (instrumentIndex < 0) {
		return { instrumentIndex: -1, instrument: null };
	}
	const instrument = state.instruments?.[instrumentIndex] ?? null;
	return { instrumentIndex, instrument };
}

export function channelHasAssignedInstrument(state, channelIndex) {
	const { instrumentIndex, instrument } = getChannelInstrument(state, channelIndex);
	return instrumentIndex >= 0 && instrument != null;
}

export function isChannelOnOffHalted(state, channelIndex) {
	return (
		state.channelOnOffCounter?.[channelIndex] > 0 && !state.channelSoundEnabled[channelIndex]
	);
}

export function assignPatternRowInstrument(state, channelIndex, row) {
	if (!state.channelInstruments || !state.instruments || state.channelMuted?.[channelIndex]) {
		return { changed: false, assigned: false, instrument: null, instrumentIndex: -1 };
	}

	if (!row.instrument || row.instrument <= 0) {
		const { instrumentIndex, instrument } = getChannelInstrument(state, channelIndex);
		return {
			changed: false,
			assigned: instrumentIndex >= 0 && instrument != null,
			instrument,
			instrumentIndex
		};
	}

	const instrumentIndex = state.instrumentIdToIndex?.get(row.instrument);
	if (instrumentIndex === undefined || !state.instruments[instrumentIndex]) {
		state.channelInstruments[channelIndex] = -1;
		return { changed: true, assigned: false, instrument: null, instrumentIndex: -1 };
	}

	state.channelInstruments[channelIndex] = instrumentIndex;
	state.instrumentPositions[channelIndex] = 0;
	return {
		changed: true,
		assigned: true,
		instrument: state.instruments[instrumentIndex],
		instrumentIndex
	};
}
