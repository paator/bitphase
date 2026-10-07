import EffectAlgorithms from './effect-algorithms.js';

export const NOTE_RELEASE = 14;

export function releaseChannelInstrument(state, channelIndex) {
	if (!state.channelMacroReleased) state.channelMacroReleased = [];
	if (!state.channelMacroReleaseTick) state.channelMacroReleaseTick = [];
	if (state.channelMacroReleased[channelIndex]) return;
	state.channelMacroReleased[channelIndex] = true;
	state.channelMacroReleaseTick[channelIndex] = state.instrumentPositions?.[channelIndex] | 0;
}

export function clearChannelInstrumentRelease(state, channelIndex) {
	if (state.channelMacroReleased) state.channelMacroReleased[channelIndex] = false;
	if (state.channelMacroReleaseTick) state.channelMacroReleaseTick[channelIndex] = -1;
}

export function channelInstrumentReleaseTick(state, channelIndex) {
	if (!state.channelMacroReleased?.[channelIndex]) return -1;
	const tick = state.channelMacroReleaseTick?.[channelIndex];
	return typeof tick === 'number' ? tick : -1;
}

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

export function processChannelOnOffCounters(state, channelCount) {
	for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
		if (state.channelOnOffCounter?.[channelIndex] > 0) {
			const result = EffectAlgorithms.processOnOffCounter(
				state.channelOnOffCounter[channelIndex],
				state.channelOnDuration[channelIndex],
				state.channelOffDuration[channelIndex],
				state.channelSoundEnabled[channelIndex]
			);
			state.channelOnOffCounter[channelIndex] = result.counter;
			state.channelSoundEnabled[channelIndex] = result.enabled;
		}
	}
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
	clearChannelInstrumentRelease(state, channelIndex);
	return {
		changed: true,
		assigned: true,
		instrument: state.instruments[instrumentIndex],
		instrumentIndex
	};
}
