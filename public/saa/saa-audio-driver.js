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
import { combineSaaLevel, SAA_TONE_CODE_MAX, saaPitchCode } from './saa-levels.js';
import {
	advanceSaaEffectTables,
	applySaaAutoEnvelopeCommand,
	applySaaMixerCommand
} from './saa-effect-tables.js';

const NOTE_OFF = 1;
const NOTE_RELEASE = 14;
const CHIP_EFFECT = 'E'.charCodeAt(0);
const STEREO_INVERT_SUBCOMMAND = 1;
const NOISE_LOCK_SUBCOMMAND = 2;
const MIXER_SUBCOMMAND = 6;
const AUTO_ENVELOPE_SUBCOMMAND = 0x0a;
const MIXER_FOLLOW_INSTRUMENT = 4;
const ENVELOPE_CLOCK_CHANNELS = [1, 4];
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

function applyEnvelopeMode(state, byteKey, raw) {
	if (raw === -1) {
		state[byteKey] = ENVELOPE_BYTES[0];
		return;
	}
	if (typeof raw !== 'number' || raw === 0) return;
	const index = raw & 15;
	if (index >= ENVELOPE_BYTES.length) return;
	state[byteKey] = ENVELOPE_BYTES[index];
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

function writeEnvelope(state, registerState, channelIndex, shape) {
	if (channelIndex !== ENVELOPE_CHANNEL_0 && channelIndex !== ENVELOPE_CHANNEL_1) return;
	const index = shape | 0;
	const override = index > 0 && index < ENVELOPE_BYTES.length ? ENVELOPE_BYTES[index] : null;
	const commanded = override != null ? override : envelopeCommandByte(state, channelIndex);
	const byte = commanded == null ? 0 : commanded & 0xff;
	if (channelIndex === ENVELOPE_CHANNEL_0) registerState.envelope0 = byte;
	else registerState.envelope1 = byte;
}

function storeSourceMask(state, channelIndex, parameter) {
	if (!state.channelSourceMask) return;
	const value = parameter | 0;
	state.channelSourceMask[channelIndex] = value >= MIXER_FOLLOW_INSTRUMENT ? null : value & 3;
}

function applySourceMask(channel, state, channelIndex) {
	const mask = state.channelSourceMask?.[channelIndex];
	if (mask === null || mask === undefined || mask >= MIXER_FOLLOW_INSTRUMENT) return;
	channel.tone = (mask & 1) !== 0;
	channel.noise = (mask & 2) !== 0;
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
		} else if (effect.delay === MIXER_SUBCOMMAND) {
			applySaaMixerCommand(state, channelIndex, effect, (value) =>
				storeSourceMask(state, channelIndex, value)
			);
		} else if (effect.delay === AUTO_ENVELOPE_SUBCOMMAND) {
			applySaaAutoEnvelopeCommand(state, channelIndex, effect, (source, value) =>
				storeAutoEnvelope(state, source, value)
			);
		}
	}
}

function ensureAutoEnvelope(state) {
	if (state.autoEnvelopeActive) return;
	state.autoEnvelopeActive = [false, false];
	state.autoEnvelopeNumerator = [0, 0];
	state.autoEnvelopeDenominator = [0, 0];
	state.autoEnvelopeSource = [-1, -1];
}

function storeAutoEnvelope(state, channelIndex, parameter) {
	ensureAutoEnvelope(state);
	const group = channelIndex < 3 ? 0 : 1;
	const numerator = (parameter >> 4) & 0xf;
	const denominator = parameter & 0xf;
	if (numerator > 0 && denominator > 0) {
		state.autoEnvelopeActive[group] = true;
		state.autoEnvelopeNumerator[group] = numerator;
		state.autoEnvelopeDenominator[group] = denominator;
		state.autoEnvelopeSource[group] = channelIndex;
		return;
	}
	state.autoEnvelopeActive[group] = false;
	state.autoEnvelopeNumerator[group] = 0;
	state.autoEnvelopeDenominator[group] = 0;
	state.autoEnvelopeSource[group] = -1;
}

function envelopeClockSteps(byte) {
	if (typeof byte !== 'number' || (byte & 0x80) === 0) return 0;
	const shape = (byte >> 1) & 7;
	if (shape !== 3 && shape !== 5 && shape !== 7) return 0;
	const stepsPerPhase = (byte & 0x10) !== 0 ? 8 : 16;
	return (shape === 5 ? 2 : 1) * stepsPerPhase;
}

function sourceTonePeriod(state, channelIndex) {
	if (!state.channelSoundEnabled?.[channelIndex]) return 0;
	const table = state.currentTuningTable;
	const note = state.channelBaseNotes?.[channelIndex];
	const index = typeof note === 'number' ? note : state.channelCurrentNotes?.[channelIndex];
	if (!table || typeof index !== 'number' || index < 0 || index >= table.length) return 0;
	let period = (table[index] | 0) + pitchOffset(state, channelIndex);
	if (period < 0) period = 0;
	if (period > SAA_TONE_CODE_MAX) period = SAA_TONE_CODE_MAX;
	return period;
}

function applyAutoEnvelope(state, registerState) {
	if (!state.autoEnvelopeActive) return;
	for (let group = 0; group < 2; group++) {
		if (!state.autoEnvelopeActive[group]) continue;
		const channel = registerState.channels[ENVELOPE_CLOCK_CHANNELS[group]];
		if (!channel) continue;
		const steps = envelopeClockSteps(
			group === 0 ? registerState.envelope0 : registerState.envelope1
		);
		if (!steps) continue;
		const period = sourceTonePeriod(state, state.autoEnvelopeSource[group]);
		if (period <= 0) continue;
		const scaled = Math.round(
			(period * state.autoEnvelopeNumerator[group]) / state.autoEnvelopeDenominator[group]
		);
		const code = saaPitchCode(scaled, 0);
		channel.octave = (code >> 8) & 7;
		channel.freq = code & 0xff;
		channel.tone = false;
		channel.noise = false;
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
		applyEnvelopeMode(state, 'envelopeCommand0', patternRow?.env0);
		applyEnvelopeMode(state, 'envelopeCommand1', patternRow?.env1);
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
			if (row.retriggerEnvelope) {
				if (channelIndex === ENVELOPE_CHANNEL_0) registerState.envelopeRetrigger0 = true;
				else if (channelIndex === ENVELOPE_CHANNEL_1)
					registerState.envelopeRetrigger1 = true;
			}
			if (row.amplitudeSliding) {
				const slide = state.channelAmplitudeSliding[channelIndex] | 0;
				if (row.amplitudeSlideUp) {
					state.channelAmplitudeSliding[channelIndex] = Math.min(
						SAA_LEVEL_MAX,
						slide + 1
					);
				} else {
					state.channelAmplitudeSliding[channelIndex] = Math.max(
						-SAA_LEVEL_MAX,
						slide - 1
					);
				}
			}
			const slide = state.channelAmplitudeSliding[channelIndex] | 0;
			const tone = packedTone(
				state,
				channelIndex,
				sampleToneOffset(state, channelIndex, row)
			);
			if (!tone) {
				silenceChannel(registerState, channelIndex);
				writeEnvelope(state, registerState, channelIndex, row.envelopeShape);
			} else {
				channel.octave = tone.octave;
				channel.freq = tone.freq;
				channel.tone = row.tone !== false;
				channel.noise = row.noise === true;
				applySourceMask(channel, state, channelIndex);
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
				writeEnvelope(state, registerState, channelIndex, row.envelopeShape);
			}
			state.instrumentPositions[channelIndex] =
				(state.instrumentPositions[channelIndex] | 0) + 1;
		}
		if (state.noiseLock0) registerState.noise0 = 3;
		if (state.noiseLock1) registerState.noise1 = 3;
		processChannelOnOffCounters(state, channelCount);
		applyAutoEnvelope(state, registerState);
		advanceSaaEffectTables(
			state,
			(channelIndex, value) => storeSourceMask(state, channelIndex, value),
			(channelIndex, value) => storeAutoEnvelope(state, channelIndex, value)
		);
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
