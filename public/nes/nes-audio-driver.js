import { calculatePt3Volume, getEffectiveTuningPeriod } from '../tracker/tracker-audio-utils.js';
import { sampleNesApuRow } from '../tracker/tracker-instrument-macros.js';
import {
	assignPatternRowInstrument,
	channelHasAssignedInstrument,
	isChannelOnOffHalted,
	processChannelOnOffCounters
} from '../tracker/tracker-instrument-channel.js';
import {
	buildLengthCounterNibble,
	buildNoiseEnvelopeVolumeReg,
	buildNoiseSilentVolumeReg,
	buildSquareEnvelopeVolumeReg,
	buildSquareSilentVolumeReg,
	buildSquareSweepReg,
	buildTriangleLinearReg,
	buildTriangleSilentLinearReg,
	isChannelAudible,
	NES_REGISTER_UNCHANGED,
	NES_SQUARE_SWEEP_DISABLED,
	resolveEnvelopeVolumeOrRate,
	usesTriangleLinearCounter
} from './nes-instrument-utils.js';
import { NES_CHANNEL_COUNT } from './nes-constants.js';
import {
	advanceNesPulseWidthTable,
	processNesPulseWidthCycleEffect,
	resetNesChannelPulseWidthCycle
} from './nes-pulse-width-cycle.js';
import {
	processNesSweepEffect,
	resetNesChannelSweepOverride,
	advanceNesSweepTable
} from './nes-sweep-effect.js';

const NES_NOISE_PERIOD_COUNT = 16;

function resolveNesNoisePeriodFromSemitoneOffset(semitoneOffset) {
	const wrapped =
		((semitoneOffset % NES_NOISE_PERIOD_COUNT) + NES_NOISE_PERIOD_COUNT) %
		NES_NOISE_PERIOD_COUNT;
	return NES_NOISE_PERIOD_COUNT - 1 - wrapped;
}

class NesAudioDriver {
	constructor() {
		this.resolveHardwareChannel = null;
	}

	setHardwareChannelResolver(resolver) {
		this.resolveHardwareChannel = resolver;
	}

	resetChannelMixerState() {}

	resizeChannels(_newCount) {}

	_getHardwareChannelType(channelIndex) {
		if (typeof this.resolveHardwareChannel === 'function') {
			return this.resolveHardwareChannel(channelIndex);
		}
		return channelIndex;
	}

	processPatternRow(state, pattern, rowIndex, _patternRow, registerState) {
		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const row = pattern.channels[channelIndex].rows[rowIndex];
			const isMuted = state.channelMuted[channelIndex];

			if (isMuted) {
				this._silenceChannel(registerState, channelIndex);
			} else {
				this._processNote(state, channelIndex, row);
				this._processInstrument(state, channelIndex, row);
				processNesPulseWidthCycleEffect(state, channelIndex, row);
				processNesSweepEffect(state, channelIndex, row);
			}
		}
	}

	_silenceChannel(registerState, channelIndex) {
		const channel = registerState.channels[channelIndex];
		if (!channel) return;
		const hwType = this._getHardwareChannelType(channelIndex);
		channel.enabled = false;
		channel.volume = 0;
		channel.retrigger = false;
		channel.lengthNibble = NES_REGISTER_UNCHANGED;
		if (hwType <= 1) {
			channel.period = 0;
			channel.volumeReg = buildSquareSilentVolumeReg(channel.duty);
			channel.linearReg = NES_REGISTER_UNCHANGED;
			channel.sweepReg = NES_SQUARE_SWEEP_DISABLED;
		} else if (hwType === 2) {
			channel.volumeReg = NES_REGISTER_UNCHANGED;
			channel.linearReg = buildTriangleSilentLinearReg();
		} else if (hwType === 3) {
			channel.period = 0;
			channel.volumeReg = buildNoiseSilentVolumeReg();
			channel.linearReg = NES_REGISTER_UNCHANGED;
		} else {
			channel.period = 0;
			channel.volumeReg = NES_REGISTER_UNCHANGED;
			channel.linearReg = NES_REGISTER_UNCHANGED;
		}
	}

	_applyEnvelopeAndLength(channel, channelIndex, row, patternVolume, state) {
		const combinedVolume = this.calculateVolume(patternVolume, row.volumeOrRate);
		const volumeNibble = resolveEnvelopeVolumeOrRate(
			row.envelope,
			patternVolume,
			row.volumeOrRate,
			combinedVolume
		);
		channel.volume = combinedVolume;
		const hwType = this._getHardwareChannelType(channelIndex);

		if (hwType <= 1) {
			const pulseWidth =
				state.channelPulseWidthCycleActive?.[channelIndex] === true
					? (state.channelPulseWidthCurrent[channelIndex] ?? row.pulseWidth)
					: row.pulseWidth;
			channel.volumeReg = buildSquareEnvelopeVolumeReg(
				pulseWidth,
				row.envelope,
				volumeNibble,
				row.soundLength
			);
			channel.duty = pulseWidth;
			channel.lengthNibble = buildLengthCounterNibble(row.soundLength);
			channel.linearReg = NES_REGISTER_UNCHANGED;
		} else if (hwType === 2) {
			channel.volumeReg = NES_REGISTER_UNCHANGED;
			channel.linearReg = buildTriangleLinearReg(row.soundLength);
			channel.lengthNibble = usesTriangleLinearCounter(row.soundLength)
				? NES_REGISTER_UNCHANGED
				: buildLengthCounterNibble(row.soundLength);
			channel.duty = 0;
		} else if (hwType === 3) {
			channel.volumeReg = buildNoiseEnvelopeVolumeReg(
				row.envelope,
				volumeNibble,
				row.soundLength
			);
			channel.noiseMode = row.pulseWidth > 0;
			channel.lengthNibble = buildLengthCounterNibble(row.soundLength);
			channel.linearReg = NES_REGISTER_UNCHANGED;
		}
	}

	_isChannelAudible(row, patternVolume, combinedVolume) {
		return isChannelAudible(row.envelope, patternVolume, row.volumeOrRate, combinedVolume);
	}

	_resetToneAccumulator(state, channelIndex) {
		if (state.channelToneAccumulator) {
			state.channelToneAccumulator[channelIndex] = 0;
		}
	}

	_applyToneOffset(state, channelIndex, instrumentRow, basePeriod) {
		if (basePeriod <= 0) return 0;
		let sampleTone = state.channelToneAccumulator[channelIndex] ?? 0;
		if (instrumentRow.toneAdd !== 0) {
			sampleTone += instrumentRow.toneAdd;
		}
		if (instrumentRow.toneAccumulation) {
			state.channelToneAccumulator[channelIndex] = sampleTone;
		}
		const period = basePeriod + sampleTone;
		if (period < 0) return 0;
		if (period > 2047) return 2047;
		return period;
	}

	_processNote(state, channelIndex, row) {
		if (state.channelMuted[channelIndex]) return;

		if (row.note.name === 1) {
			state.channelSoundEnabled[channelIndex] = false;
			state.instrumentPositions[channelIndex] = 0;
			state.channelKeyOn[channelIndex] = false;
			this._resetToneAccumulator(state, channelIndex);
			resetNesChannelPulseWidthCycle(state, channelIndex);
			resetNesChannelSweepOverride(state, channelIndex);
		} else if (row.note.name !== 0) {
			state.channelSoundEnabled[channelIndex] = true;
			state.instrumentPositions[channelIndex] = 0;
			state.channelKeyOn[channelIndex] = true;
			this._resetToneAccumulator(state, channelIndex);
		}
	}

	_processInstrument(state, channelIndex, row) {
		const assignment = assignPatternRowInstrument(state, channelIndex, row);
		if (assignment.changed) {
			this._resetToneAccumulator(state, channelIndex);
		}
	}

	calculateVolume(patternVolume, instrumentVolume) {
		return calculatePt3Volume(patternVolume, instrumentVolume);
	}

	getEffectivePeriod(state, channelIndex) {
		return getEffectiveTuningPeriod(state, channelIndex, 2048);
	}

	resolveNoisePeriod(state, channelIndex) {
		const noteIndex = state.channelCurrentNotes[channelIndex];
		const toneSliding = state.channelToneSliding?.[channelIndex] || 0;
		const vibratoSliding = state.channelVibratoSliding?.[channelIndex] || 0;
		const detune = state.channelDetune?.[channelIndex] || 0;
		const semitoneOffset = noteIndex + toneSliding + vibratoSliding + detune;
		return resolveNesNoisePeriodFromSemitoneOffset(semitoneOffset);
	}

	resolveInstrumentRow(state, channelIndex) {
		const instrumentIndex = state.channelInstruments[channelIndex];
		const instrument = state.instruments[instrumentIndex];
		return sampleNesApuRow(instrument, state.instrumentPositions[channelIndex]);
	}

	processInstruments(state, registerState) {
		const channelCount = registerState.channelCount ?? NES_CHANNEL_COUNT;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const channel = registerState.channels[channelIndex];
			if (!channel) continue;

			const isMuted = state.channelMuted[channelIndex];
			const isSoundEnabled = state.channelSoundEnabled[channelIndex];
			const onOffHalted = isChannelOnOffHalted(state, channelIndex);
			const hwType = this._getHardwareChannelType(channelIndex);

			if (isMuted || !isSoundEnabled) {
				this._silenceChannel(registerState, channelIndex);
				continue;
			}

			if (!channelHasAssignedInstrument(state, channelIndex)) {
				this._silenceChannel(registerState, channelIndex);
				continue;
			}

			const row = this.resolveInstrumentRow(state, channelIndex);
			const patternVolume = state.channelPatternVolumes[channelIndex] ?? 15;
			const combinedVolume = this.calculateVolume(patternVolume, row.volumeOrRate);
			const basePeriod = this.getEffectivePeriod(state, channelIndex);
			const period =
				hwType <= 2
					? this._applyToneOffset(state, channelIndex, row, basePeriod)
					: basePeriod;
			const keyOn = state.channelKeyOn[channelIndex];

			this._applyEnvelopeAndLength(channel, channelIndex, row, patternVolume, state);
			const audible = this._isChannelAudible(row, patternVolume, combinedVolume);

			if (hwType <= 1) {
				channel.enabled = period > 0 && audible;
				channel.period = period;
				channel.sweepUpdateOnly = false;
				channel.sweepReg =
					state.channelSweepOverrideActive?.[channelIndex] === true
						? state.channelSweepOverrideReg[channelIndex]
						: buildSquareSweepReg(row.sweep, row.sweepRate, row.sweepShift);
				channel.retrigger = row.retrigger || keyOn;
				state.channelKeyOn[channelIndex] = false;
			} else if (hwType === 2) {
				channel.enabled = period > 0 && combinedVolume > 0;
				channel.period = period;
				channel.retrigger = row.retrigger || keyOn;
				state.channelKeyOn[channelIndex] = false;
			} else if (hwType === 3) {
				channel.enabled = audible;
				channel.noisePeriod = this.resolveNoisePeriod(state, channelIndex);
				channel.retrigger = row.retrigger || keyOn;
				state.channelKeyOn[channelIndex] = false;
			} else {
				this._silenceChannel(registerState, channelIndex);
			}

			if (!onOffHalted) {
				state.instrumentPositions[channelIndex] =
					(state.instrumentPositions[channelIndex] | 0) + 1;
			}
		}

		processChannelOnOffCounters(state, channelCount);
	}

	advancePulseWidthTable(state) {
		advanceNesPulseWidthTable(state);
	}

	advanceSweepTable(state) {
		advanceNesSweepTable(state);
	}

	syncSweepTableRegisterState(state, registerState) {
		const channelCount = registerState.channelCount ?? NES_CHANNEL_COUNT;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			if (this._getHardwareChannelType(channelIndex) > 1) continue;
			if (!state.channelSweepTableTick?.[channelIndex]) continue;
			const channel = registerState.channels[channelIndex];
			if (!channel) continue;
			if (state.channelSweepOverrideActive?.[channelIndex] === true) {
				channel.sweepReg = state.channelSweepOverrideReg[channelIndex];
				channel.sweepUpdateOnly = true;
			}
			state.channelSweepTableTick[channelIndex] = false;
		}
	}
}

export default NesAudioDriver;
export { resolveNesNoisePeriodFromSemitoneOffset };
