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
const CHIP_EFFECT = 'E'.charCodeAt(0);
const STEREO_INVERT_SUBCOMMAND = 1;
const NOISE_LOCK_SUBCOMMAND = 2;
const ENVELOPE_CHANNEL_0 = 2;
const ENVELOPE_CHANNEL_1 = 5;
const ENVELOPE_BYTES = [
	0x00, 0x96, 0x9e, 0x9a, 0x86, 0x8e, 0x8a, 0x97, 0x9f, 0x9b, 0x87, 0x8f, 0x8b
];

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

function applyEnvelopeMode(state, byteKey, retriggerKey, raw) {
	if (raw === -1) {
		state[byteKey] = ENVELOPE_BYTES[0];
		state[retriggerKey] = true;
		return;
	}
	if (typeof raw !== 'number' || raw === 0) return;
	const index = raw & 15;
	if (index >= ENVELOPE_BYTES.length) return;
	state[byteKey] = ENVELOPE_BYTES[index];
	state[retriggerKey] = true;
}

function envelopeCommandByte(state, channelIndex) {
	if (channelIndex === ENVELOPE_CHANNEL_0) return state.envelopeCommand0;
	if (channelIndex === ENVELOPE_CHANNEL_1) return state.envelopeCommand1;
	return undefined;
}

function clearEnvelope(state, registerState, channelIndex) {
	if (channelIndex !== ENVELOPE_CHANNEL_0 && channelIndex !== ENVELOPE_CHANNEL_1) return;
	writeEnvelope(state, registerState, channelIndex);
}

function writeEnvelope(state, registerState, channelIndex) {
	if (channelIndex !== ENVELOPE_CHANNEL_0 && channelIndex !== ENVELOPE_CHANNEL_1) return;
	const commanded = envelopeCommandByte(state, channelIndex);
	const byte = commanded == null ? 0 : commanded & 0xff;
	if (channelIndex === ENVELOPE_CHANNEL_0) registerState.envelope0 = byte;
	else registerState.envelope1 = byte;
}

function processSaaEffects(state, channelIndex, row) {
	const effects = row?.effects;
	if (!effects) return;
	for (const effect of effects) {
		if (!effect || effect.effect !== CHIP_EFFECT) continue;
		const parameter = effect.parameter | 0;
		if (effect.delay === STEREO_INVERT_SUBCOMMAND) {
			if (state.channelStereoInvert) {
				state.channelStereoInvert[channelIndex] = (parameter & 1) !== 0;
			}
		} else if (effect.delay === NOISE_LOCK_SUBCOMMAND) {
			if (channelIndex < 3) state.noiseLock0 = (parameter & 1) !== 0;
			else state.noiseLock1 = (parameter & 1) !== 0;
		}
	}
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

function resetInstrumentAccumulators(state, channelIndex) {
	if (state.channelToneAccumulator) state.channelToneAccumulator[channelIndex] = 0;
	if (state.channelNoiseAccumulator) state.channelNoiseAccumulator[channelIndex] = 0;
}

function sampleToneOffset(state, channelIndex, row) {
	let offset = state.channelToneAccumulator?.[channelIndex] ?? 0;
	if (row.toneAdd) offset += row.toneAdd | 0;
	if (row.toneAccumulation && state.channelToneAccumulator) {
		state.channelToneAccumulator[channelIndex] = offset;
	}
	return offset;
}

function packedTone(state, channelIndex, toneOffset) {
	const note = state.channelCurrentNotes?.[channelIndex] ?? 0;
	const table = state.currentTuningTable;
	if (!table || note < 0 || note >= table.length) return null;
	const code = saaPitchCode(table[note], pitchOffset(state, channelIndex) + toneOffset);
	return {
		octave: (code >> 8) & 7,
		freq: code & 0xff
	};
}

function applyInstrumentNoise(registerState, state, channelIndex, row) {
	if (row.noise !== true && channelIndex % 3 !== 0) return;
	let offset = (state.channelNoiseAccumulator?.[channelIndex] ?? 0) + (row.noiseAdd | 0);
	if (row.noiseAccumulation && state.channelNoiseAccumulator) {
		state.channelNoiseAccumulator[channelIndex] = offset & 3;
	}
	const base = channelIndex < 3 ? (state.noiseClock0 ?? 0) : (state.noiseClock1 ?? 0);
	const value = (base + offset) & 3;
	if (channelIndex < 3) registerState.noise0 = value;
	else registerState.noise1 = value;
}

class SaaAudioDriver {
	processPatternRow(state, pattern, rowIndex, patternRow) {
		applyNoiseClock(state, 'noiseClock0', patternRow?.noise0);
		applyNoiseClock(state, 'noiseClock1', patternRow?.noise1);
		applyEnvelopeMode(state, 'envelopeCommand0', 'envelopeRetrigger0', patternRow?.env0);
		applyEnvelopeMode(state, 'envelopeCommand1', 'envelopeRetrigger1', patternRow?.env1);
		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const row = pattern.channels[channelIndex]?.rows?.[rowIndex];
			if (!row) continue;
			processSaaEffects(state, channelIndex, row);
			if (state.channelMuted?.[channelIndex]) continue;
			applyPatternSide(state, channelIndex, 'left', row.left);
			applyPatternSide(state, channelIndex, 'right', row.right);
			if (row.note?.name === NOTE_OFF) {
				state.channelAmplitudeSliding[channelIndex] = 0;
				resetInstrumentAccumulators(state, channelIndex);
				continue;
			}
			if (row.note?.name === NOTE_RELEASE) {
				releaseChannelInstrument(state, channelIndex);
				continue;
			}
			if (row.note && row.note.name !== 0) {
				state.channelAmplitudeSliding[channelIndex] = 0;
				resetInstrumentAccumulators(state, channelIndex);
				if (channelIndex === ENVELOPE_CHANNEL_0) state.envelopeRetrigger0 = true;
				if (channelIndex === ENVELOPE_CHANNEL_1) state.envelopeRetrigger1 = true;
			}
			const assigned = assignPatternRowInstrument(state, channelIndex, row);
			if (assigned.changed) resetInstrumentAccumulators(state, channelIndex);
		}
	}

	processInstruments(state, registerState) {
		registerState.noise0 = (state.noiseClock0 ?? 0) & 3;
		registerState.noise1 = (state.noiseClock1 ?? 0) & 3;
		registerState.envelopeRetrigger0 = Boolean(state.envelopeRetrigger0);
		registerState.envelopeRetrigger1 = Boolean(state.envelopeRetrigger1);
		state.envelopeRetrigger0 = false;
		state.envelopeRetrigger1 = false;
		const channelCount = registerState.channelCount;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const channel = registerState.channels[channelIndex];
			if (!channel) continue;
			if (state.channelMuted?.[channelIndex] || !state.channelSoundEnabled?.[channelIndex]) {
				silenceChannel(registerState, channelIndex);
				clearEnvelope(state, registerState, channelIndex);
				continue;
			}
			const { instrument } = getChannelInstrument(state, channelIndex);
			if (!instrument) {
				silenceChannel(registerState, channelIndex);
				clearEnvelope(state, registerState, channelIndex);
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
			const tone = packedTone(state, channelIndex, sampleToneOffset(state, channelIndex, row));
			if (!tone) {
				silenceChannel(registerState, channelIndex);
				clearEnvelope(state, registerState, channelIndex);
			} else {
				channel.octave = tone.octave;
				channel.freq = tone.freq;
				channel.tone = row.tone !== false;
				channel.noise = row.noise === true;
				applyInstrumentNoise(registerState, state, channelIndex, row);
				let left = combineSaaLevel(
					state.channelPatternLeft[channelIndex],
					row.left ?? SAA_LEVEL_MAX,
					slide
				);
				let right = combineSaaLevel(
					state.channelPatternRight[channelIndex],
					row.right ?? SAA_LEVEL_MAX,
					slide
				);
				if (state.channelStereoInvert?.[channelIndex]) {
					const swapped = left;
					left = right;
					right = swapped;
				}
				channel.left = left;
				channel.right = right;
				writeEnvelope(state, registerState, channelIndex);
			}
			state.instrumentPositions[channelIndex] =
				(state.instrumentPositions[channelIndex] | 0) + 1;
		}
		if (state.noiseLock0) registerState.noise0 = 3;
		if (state.noiseLock1) registerState.noise1 = 3;
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
