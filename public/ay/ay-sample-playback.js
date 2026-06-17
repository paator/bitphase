import { DEFAULT_AYM_FREQUENCY } from './ayumi-constants.js';
import { mapUint8SampleToVolumeLevel } from './ay-sample-lut.js';

export const SAMPLE_PITCH_REFERENCE_HZ = 261.63;

export function instrumentHasSample(instrument) {
	return (
		instrument != null &&
		Array.isArray(instrument.sampleData) &&
		instrument.sampleData.length > 0
	);
}

export function resolveSamplePlaybackBounds(instrument) {
	const dataLength = instrument?.sampleData?.length ?? 0;
	if (dataLength === 0) {
		return null;
	}

	let start = instrument.sampleStart ?? instrument.sampleLoop ?? 0;
	let end = instrument.sampleEnd;

	if (end == null && instrument.sampleLength != null && Number.isFinite(instrument.sampleLength)) {
		end = start + Math.floor(instrument.sampleLength) - 1;
	}
	if (end == null || !Number.isFinite(end)) {
		end = dataLength - 1;
	}

	start = Math.max(0, Math.min(dataLength - 1, Math.floor(start)));
	end = Math.max(start, Math.min(dataLength - 1, Math.floor(end)));

	let loopStart = instrument.sampleLoopStart ?? instrument.sampleLoop ?? start;
	loopStart = Math.max(start, Math.min(end, Math.floor(loopStart)));

	return {
		start,
		end,
		loopStart,
		length: end - start + 1,
		dataLength
	};
}

export function resolveSampleRegion(instrument) {
	return resolveSamplePlaybackBounds(instrument);
}

export function resolveSampleLoopEnabled(instrument) {
	return instrument?.sampleLoopEnabled !== false;
}

export function resetChannelSamplePlayback(state, channelIndex, instrument) {
	const bounds = resolveSamplePlaybackBounds(instrument);
	if (!bounds || !state.channelSamplePositions) {
		return;
	}
	state.channelSamplePositions[channelIndex] = bounds.start;
	if (state.channelSamplePhase) {
		state.channelSamplePhase[channelIndex] = 0;
	}
}

export function clampSamplePlaybackPosition(instrument, position) {
	const bounds = resolveSamplePlaybackBounds(instrument);
	if (!bounds) {
		return 0;
	}
	return Math.max(bounds.start, Math.min(bounds.end, Math.floor(position)));
}

export function computeSampleSidPeriod(clockHz, sampleRate) {
	if (!sampleRate || sampleRate <= 0 || !clockHz || clockHz <= 0) {
		return 1;
	}
	return Math.max(1, Math.round(clockHz / (8 * sampleRate)));
}

export function resolveSamplePlaybackRate(instrument, outputSampleRate) {
	const rate = instrument?.sampleRate;
	if (typeof rate === 'number' && rate > 0) {
		return rate;
	}
	return outputSampleRate > 0 ? outputSampleRate : 44100;
}

export function mapSampleByteAtPosition(instrument, position, isYM) {
	const data = instrument.sampleData;
	const index = Math.max(0, Math.min(data.length - 1, position | 0));
	return mapUint8SampleToVolumeLevel(data[index], isYM);
}

export function resolveSamplePitchReferencePeriod(clockHz) {
	if (!clockHz || clockHz <= 0) {
		return 0;
	}
	return clockHz / (16 * SAMPLE_PITCH_REFERENCE_HZ);
}

export function computeSamplePitchScale(referencePeriod, effectiveTone) {
	if (referencePeriod <= 0 || effectiveTone <= 0) {
		return 1;
	}
	return referencePeriod / effectiveTone;
}

export function advanceSamplePosition(
	state,
	channelIndex,
	instrument,
	outputSampleRate,
	effectiveTone = 0
) {
	const bounds = resolveSamplePlaybackBounds(instrument);
	if (!bounds) {
		return { active: false, volume: 0 };
	}

	let position = state.channelSamplePositions[channelIndex] | 0;
	if (position < bounds.start || position > bounds.end) {
		position = bounds.start;
		state.channelSamplePositions[channelIndex] = position;
	}

	const volume = mapSampleByteAtPosition(instrument, position, state.isYM);
	const rate = resolveSamplePlaybackRate(instrument, outputSampleRate);
	const clockHz = state.aymFrequency > 0 ? state.aymFrequency : DEFAULT_AYM_FREQUENCY;
	const referencePeriod = resolveSamplePitchReferencePeriod(clockHz);
	const pitchScale = computeSamplePitchScale(referencePeriod, effectiveTone);
	let phase = state.channelSamplePhase[channelIndex] + (rate / outputSampleRate) * pitchScale;

	while (phase >= 1) {
		position++;
		if (position > bounds.end) {
			if (resolveSampleLoopEnabled(instrument)) {
				position = bounds.loopStart;
			} else {
				state.channelSamplePositions[channelIndex] = bounds.end + 1;
				state.channelSamplePhase[channelIndex] = 0;
				return { active: false, volume: 0 };
			}
		}
		phase -= 1;
	}

	state.channelSamplePositions[channelIndex] = position;
	state.channelSamplePhase[channelIndex] = phase;
	return { active: true, volume };
}
