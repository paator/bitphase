import {
	assignPatternRowInstrument,
	channelInstrumentReleaseTick,
	getChannelInstrument,
	processChannelOnOffCounters,
	releaseChannelInstrument
} from '../tracker/tracker-instrument-channel.js';
import EffectAlgorithms from '../tracker/effect-algorithms.js';
import { sampleSaaVolumeRow } from '../tracker/tracker-instrument-macros.js';
import { SAA_LEVEL_MAX } from './saa-constants.js';
import { combineSaaLevel, saaPitchCode } from './saa-levels.js';

const NOTE_OFF = 1;
const NOTE_RELEASE = 14;

function silenceChannel(registerState, channelIndex) {
	const channel = registerState.channels[channelIndex];
	if (!channel) return;
	channel.tone = false;
	channel.noise = false;
	channel.left = 0;
	channel.right = 0;
}

function applyNoiseClock(state, key, raw) {
	if (raw === -1) {
		state[key] = 0;
		return;
	}
	if (typeof raw !== 'number' || raw === 0) return;
	state[key] = raw & 3;
}

function applyPatternSide(state, channelIndex, side, value) {
	const key = side === 'left' ? 'channelPatternLeft' : 'channelPatternRight';
	if (value === -1) {
		state[key][channelIndex] = 0;
		return;
	}
	if (typeof value === 'number' && value > 0) {
		state[key][channelIndex] = Math.min(SAA_LEVEL_MAX, value);
	}
}

function pitchOffset(state, channelIndex) {
	return (
		(state.channelToneSliding?.[channelIndex] || 0) +
		(state.channelVibratoSliding?.[channelIndex] || 0) +
		(state.channelDetune?.[channelIndex] || 0)
	);
}

function packedTone(state, channelIndex) {
	const note = state.channelCurrentNotes?.[channelIndex] ?? 0;
	const table = state.currentTuningTable;
	if (!table || note < 0 || note >= table.length) return null;
	const code = saaPitchCode(table[note], pitchOffset(state, channelIndex));
	return {
		octave: (code >> 8) & 7,
		freq: code & 0xff
	};
}

class SaaAudioDriver {
	processPatternRow(state, pattern, rowIndex, patternRow) {
		applyNoiseClock(state, 'noiseClock0', patternRow?.noise0);
		applyNoiseClock(state, 'noiseClock1', patternRow?.noise1);
		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const row = pattern.channels[channelIndex]?.rows?.[rowIndex];
			if (!row || state.channelMuted?.[channelIndex]) continue;
			applyPatternSide(state, channelIndex, 'left', row.left);
			applyPatternSide(state, channelIndex, 'right', row.right);
			if (row.note?.name === NOTE_OFF) {
				state.channelAmplitudeSliding[channelIndex] = 0;
				continue;
			}
			if (row.note?.name === NOTE_RELEASE) {
				releaseChannelInstrument(state, channelIndex);
				continue;
			}
			if (row.note && row.note.name !== 0) {
				state.channelAmplitudeSliding[channelIndex] = 0;
			}
			assignPatternRowInstrument(state, channelIndex, row);
		}
	}

	processInstruments(state, registerState) {
		registerState.noise0 = (state.noiseClock0 ?? 0) & 3;
		registerState.noise1 = (state.noiseClock1 ?? 0) & 3;
		const channelCount = registerState.channelCount;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const channel = registerState.channels[channelIndex];
			if (!channel) continue;
			if (state.channelMuted?.[channelIndex] || !state.channelSoundEnabled?.[channelIndex]) {
				silenceChannel(registerState, channelIndex);
				continue;
			}
			const { instrument } = getChannelInstrument(state, channelIndex);
			if (!instrument) {
				silenceChannel(registerState, channelIndex);
				continue;
			}
			const row =
				sampleSaaVolumeRow(
					instrument,
					state.instrumentPositions[channelIndex] | 0,
					channelInstrumentReleaseTick(state, channelIndex)
				) ?? {};
			if (row.amplitudeSliding) {
				const slide = state.channelAmplitudeSliding[channelIndex] | 0;
				if (row.amplitudeSlideUp) {
					state.channelAmplitudeSliding[channelIndex] = Math.min(SAA_LEVEL_MAX, slide + 1);
				} else {
					state.channelAmplitudeSliding[channelIndex] = Math.max(-SAA_LEVEL_MAX, slide - 1);
				}
			}
			const slide = state.channelAmplitudeSliding[channelIndex] | 0;
			const tone = packedTone(state, channelIndex);
			if (!tone) {
				silenceChannel(registerState, channelIndex);
			} else {
				channel.octave = tone.octave;
				channel.freq = tone.freq;
				channel.tone = row.tone !== false;
				channel.noise = row.noise === true;
				if (!channel.tone && !channel.noise) {
					channel.left = 0;
					channel.right = 0;
				} else {
					channel.left = combineSaaLevel(
						state.channelPatternLeft[channelIndex],
						row.left ?? SAA_LEVEL_MAX,
						slide
					);
					channel.right = combineSaaLevel(
						state.channelPatternRight[channelIndex],
						row.right ?? SAA_LEVEL_MAX,
						slide
					);
				}
			}
			state.instrumentPositions[channelIndex] =
				(state.instrumentPositions[channelIndex] | 0) + 1;
		}
		processChannelOnOffCounters(state, channelCount);
	}

	applyVolumeSlide(state, channelIndex, param) {
		const left = state.channelPatternLeft;
		const right = state.channelPatternRight;
		if (left) left[channelIndex] = EffectAlgorithms.slideVolume(left[channelIndex], param);
		if (right) right[channelIndex] = EffectAlgorithms.slideVolume(right[channelIndex], param);
	}

	resizeChannels(_channelCount) {}
}

export default SaaAudioDriver;
