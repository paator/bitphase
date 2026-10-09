import { calculatePt3Volume, getEffectiveTuningPeriod } from '../tracker/tracker-audio-utils.js';
import { sampleNesApuRow } from '../tracker/tracker-instrument-macros.js';
import {
	assignPatternRowInstrument,
	channelHasAssignedInstrument,
	channelInstrumentReleaseTick,
	clearChannelInstrumentRelease,
	isChannelOnOffHalted,
	NOTE_RELEASE,
	processChannelOnOffCounters,
	releaseChannelInstrument
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
import { resolveNesDpcmAssignment } from './nes-dpcm.js';
import {
	advanceNesPulseWidthTable,
	processNesPulseWidthCycleEffect
} from './nes-pulse-width-cycle.js';
import {
	processNesSweepEffect,
	resetNesChannelSweepOverride,
	advanceNesSweepTable
} from './nes-sweep-effect.js';
import {
	NES_DPCM_HARDWARE_CHANNEL,
	advanceNesDeltaCounterTable,
	cutNesDeltaCounter,
	processNesDeltaCounterEffect
} from './nes-delta-counter.js';
import { applyNesLengthCounter, processNesLengthCounterEffect } from './nes-length-counter.js';
import { applyNesEnvelopeMode, processNesEnvelopeModeEffect } from './nes-envelope-mode.js';
import { processNesDpcmPitchEffect } from './nes-dpcm-pitch.js';
import { applyNesLinearCounter, processNesLinearCounterEffect } from './nes-linear-counter.js';

const NES_NOISE_PERIOD_COUNT = 16;

function resolveNesNoisePeriodFromSemitoneOffset(semitoneOffset) {
	const wrapped =
		((semitoneOffset % NES_NOISE_PERIOD_COUNT) + NES_NOISE_PERIOD_COUNT) %
		NES_NOISE_PERIOD_COUNT;
	return NES_NOISE_PERIOD_COUNT - 1 - wrapped;
}

function calculateNesNoiseVolume(patternVolume, instrumentVolume) {
	const pattern = Math.max(0, Math.min(15, patternVolume | 0));
	const instrument = Math.max(0, Math.min(15, instrumentVolume | 0));
	const volume = ((instrument * pattern) / 15) | 0;
	if (volume === 0 && instrument > 0 && pattern > 0) return 1;
	return volume;
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
				if (row.note?.name === NOTE_RELEASE) {
					releaseChannelInstrument(state, channelIndex);
				}
				processNesPulseWidthCycleEffect(state, channelIndex, row);
				processNesSweepEffect(state, channelIndex, row);
			}
			const hardwareType = this._getHardwareChannelType(channelIndex);
			processNesDeltaCounterEffect(state, channelIndex, row, hardwareType);
			if (row.note?.name === 1 && hardwareType === NES_DPCM_HARDWARE_CHANNEL) {
				cutNesDeltaCounter(state, channelIndex);
			}
			processNesLengthCounterEffect(state, channelIndex, row, hardwareType);
			processNesEnvelopeModeEffect(state, channelIndex, row, hardwareType);
			processNesDpcmPitchEffect(state, channelIndex, row, hardwareType);
			processNesLinearCounterEffect(state, channelIndex, row, hardwareType);
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
		channel.lengthReload = false;
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
			channel.dpcmBytes = null;
			channel.dpcmLoop = false;
		}
	}

	_applyEnvelopeAndLength(channel, channelIndex, row, patternVolume, state) {
		const hwType = this._getHardwareChannelType(channelIndex);
		const combinedVolume =
			hwType === 3
				? calculateNesNoiseVolume(patternVolume, row.volumeOrRate)
				: this.calculateVolume(patternVolume, row.volumeOrRate);
		const volumeNibble = resolveEnvelopeVolumeOrRate(
			row.envelope,
			patternVolume,
			row.volumeOrRate,
			combinedVolume
		);
		channel.volume = combinedVolume;

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
			channel.noiseMode = (row.pulseWidth & 1) !== 0;
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

	_sampleToneOffset(state, channelIndex, instrumentRow) {
		let sampleTone = state.channelToneAccumulator[channelIndex] ?? 0;
		if (instrumentRow.toneAdd !== 0) {
			sampleTone += instrumentRow.toneAdd;
		}
		if (instrumentRow.toneAccumulation) {
			state.channelToneAccumulator[channelIndex] = sampleTone;
		}
		return sampleTone;
	}

	_applyToneOffset(state, channelIndex, instrumentRow, basePeriod) {
		if (basePeriod <= 0) return 0;
		const period = basePeriod + this._sampleToneOffset(state, channelIndex, instrumentRow);
		if (period < 0) return 0;
		if (period > 2048) return 2048;
		return period;
	}

	_processNote(state, channelIndex, row) {
		if (state.channelMuted[channelIndex]) return;

		if (row.note.name === NOTE_RELEASE) {
			return;
		}

		if (row.note.name === 1) {
			clearChannelInstrumentRelease(state, channelIndex);
			state.channelSoundEnabled[channelIndex] = false;
			state.instrumentPositions[channelIndex] = 0;
			state.channelKeyOn[channelIndex] = false;
			this._resetToneAccumulator(state, channelIndex);
			resetNesChannelSweepOverride(state, channelIndex);
		} else if (row.note.name !== 0) {
			clearChannelInstrumentRelease(state, channelIndex);
			state.channelSoundEnabled[channelIndex] = true;
			state.instrumentPositions[channelIndex] = 0;
			state.channelKeyOn[channelIndex] = true;
			this._resetToneAccumulator(state, channelIndex);
			resetNesChannelSweepOverride(state, channelIndex);
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

	resolveNoisePeriod(state, channelIndex, toneOffset = 0) {
		const noteIndex = state.channelCurrentNotes[channelIndex];
		const toneSliding = state.channelToneSliding?.[channelIndex] || 0;
		const vibratoSliding = state.channelVibratoSliding?.[channelIndex] || 0;
		const detune = state.channelDetune?.[channelIndex] || 0;
		const semitoneOffset = noteIndex + toneSliding + vibratoSliding + detune + toneOffset;
		return resolveNesNoisePeriodFromSemitoneOffset(semitoneOffset);
	}

	_applyDpcmChannel(state, registerState, channelIndex) {
		const channel = registerState.channels[channelIndex];
		const instrumentIndex = state.channelInstruments[channelIndex];
		const instrument = state.instruments[instrumentIndex];
		const noteIndex = state.channelCurrentNotes[channelIndex] | 0;
		const assignment = resolveNesDpcmAssignment(instrument, noteIndex);
		const keyOn = state.channelKeyOn[channelIndex];
		if (!assignment) {
			if (state.channelDpcmPitchWrite) state.channelDpcmPitchWrite[channelIndex] = false;
			this._silenceChannel(registerState, channelIndex);
			state.channelKeyOn[channelIndex] = false;
			return;
		}
		channel.enabled = true;
		channel.volume = assignment.delta ?? 0;
		channel.dpcmPitch = state.channelDpcmPitchActive?.[channelIndex]
			? state.channelDpcmPitch[channelIndex] & 15
			: assignment.pitch;
		channel.dpcmLoop = assignment.loop;
		channel.dpcmDelta = assignment.delta;
		channel.dpcmLengthReg = assignment.lengthReg;
		channel.dpcmBytes = assignment.data;
		channel.retrigger = Boolean(keyOn);
		channel.dpcmPitchWrite = state.channelDpcmPitchWrite?.[channelIndex] === true;
		if (state.channelDpcmPitchWrite) state.channelDpcmPitchWrite[channelIndex] = false;
		state.channelKeyOn[channelIndex] = false;
	}

	resolveInstrumentRow(state, channelIndex) {
		const instrumentIndex = state.channelInstruments[channelIndex];
		const instrument = state.instruments[instrumentIndex];
		return sampleNesApuRow(
			instrument,
			state.instrumentPositions[channelIndex],
			channelInstrumentReleaseTick(state, channelIndex)
		);
	}

	refreshSoundingRow(state, registerState) {
		const channelCount = registerState.channelCount ?? NES_CHANNEL_COUNT;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const channel = registerState.channels[channelIndex];
			if (!channel?.enabled) continue;
			if (state.channelMuted?.[channelIndex] || !state.channelSoundEnabled?.[channelIndex]) {
				continue;
			}
			if (!channelHasAssignedInstrument(state, channelIndex)) continue;
			if (this._getHardwareChannelType(channelIndex) === 4) continue;

			const row = this.resolveInstrumentRow(state, channelIndex);
			const patternVolume = state.channelPatternVolumes?.[channelIndex] ?? 15;
			const period = channel.period;
			const noisePeriod = channel.noisePeriod;
			const sweepReg = channel.sweepReg;
			this._applyEnvelopeAndLength(channel, channelIndex, row, patternVolume, state);
			channel.retrigger = false;
			channel.period = period;
			channel.noisePeriod = noisePeriod;
			channel.sweepReg = sweepReg;
			channel.sweepUpdateOnly = false;
		}
		this._syncLengthCounter(state, registerState, false);
		this._syncEnvelopeMode(state, registerState);
		this._syncLinearCounter(state, registerState, false);
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
				if (state.channelDpcmPitchWrite) state.channelDpcmPitchWrite[channelIndex] = false;
				this._silenceChannel(registerState, channelIndex);
				continue;
			}

			if (!channelHasAssignedInstrument(state, channelIndex)) {
				this._silenceChannel(registerState, channelIndex);
				continue;
			}

			if (hwType === 4) {
				this._applyDpcmChannel(state, registerState, channelIndex);
				continue;
			}

			const row = this.resolveInstrumentRow(state, channelIndex);
			const patternVolume = state.channelPatternVolumes[channelIndex] ?? 15;
			const combinedVolume =
				hwType === 3
					? calculateNesNoiseVolume(patternVolume, row.volumeOrRate)
					: this.calculateVolume(patternVolume, row.volumeOrRate);
			const basePeriod = this.getEffectivePeriod(state, channelIndex);
			const period =
				hwType <= 2
					? this._applyToneOffset(state, channelIndex, row, basePeriod)
					: basePeriod;
			const noiseToneOffset =
				hwType === 3 ? this._sampleToneOffset(state, channelIndex, row) : 0;
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
				channel.noisePeriod = this.resolveNoisePeriod(state, channelIndex, noiseToneOffset);
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
		this._syncDpcmDeltaCounter(state, registerState);
		this._syncLengthCounter(state, registerState, true);
		this._syncEnvelopeMode(state, registerState);
		this._syncLinearCounter(state, registerState, true);
	}

	_syncLinearCounter(state, registerState, consumeReload) {
		const active = state.channelLinearCounterActive;
		const reload = state.channelLinearCounterReload;
		if (!active || !reload) return;
		const channelCount = registerState.channelCount ?? active.length;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const reloadNow = consumeReload && reload[channelIndex] === true;
			if (consumeReload) reload[channelIndex] = false;
			if (!active[channelIndex]) continue;
			const channel = registerState.channels[channelIndex];
			if (!channel?.enabled) continue;
			applyNesLinearCounter(
				channel,
				this._getHardwareChannelType(channelIndex),
				state.channelLinearCounter[channelIndex] ?? 0xff
			);
			if (reloadNow) channel.lengthReload = true;
		}
	}

	_syncEnvelopeMode(state, registerState) {
		const active = state.channelEnvelopeModeActive;
		if (!active) return;
		const channelCount = registerState.channelCount ?? active.length;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			if (!active[channelIndex]) continue;
			const channel = registerState.channels[channelIndex];
			if (!channel?.enabled) continue;
			applyNesEnvelopeMode(
				channel,
				this._getHardwareChannelType(channelIndex),
				state.channelEnvelopeMode[channelIndex] ?? 3
			);
		}
	}

	_syncLengthCounter(state, registerState, consumeReload) {
		const active = state.channelLengthCounterActive;
		const reload = state.channelLengthCounterReload;
		if (!active || !reload) return;
		const channelCount = registerState.channelCount ?? active.length;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const reloadNow = consumeReload && reload[channelIndex] === true;
			if (consumeReload) reload[channelIndex] = false;
			if (!active[channelIndex]) continue;
			const channel = registerState.channels[channelIndex];
			if (!channel?.enabled) continue;
			const hardwareType = this._getHardwareChannelType(channelIndex);
			applyNesLengthCounter(
				channel,
				hardwareType,
				state.channelLengthCounterIndex[channelIndex] ?? 0
			);
			if (reloadNow) channel.lengthReload = true;
		}
	}

	_syncDpcmDeltaCounter(state, registerState) {
		const writes = state.channelDpcmDeltaWrite;
		if (!writes) return;
		const channelCount = registerState.channelCount ?? writes.length;
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
			const channel = registerState.channels[channelIndex];
			if (!writes[channelIndex]) {
				if (channel) channel.dpcmDeltaWrite = false;
				continue;
			}
			writes[channelIndex] = false;
			if (!channel) continue;
			if (this._getHardwareChannelType(channelIndex) !== NES_DPCM_HARDWARE_CHANNEL) continue;
			channel.dpcmDelta = state.channelDpcmDelta[channelIndex] & 0x7f;
			channel.dpcmDeltaHold = channel.dpcmDelta;
			channel.dpcmDeltaWrite = true;
		}
	}

	advancePulseWidthTable(state) {
		advanceNesPulseWidthTable(state);
	}

	advanceSweepTable(state) {
		advanceNesSweepTable(state);
	}

	advanceDeltaCounterTable(state) {
		advanceNesDeltaCounterTable(state);
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
