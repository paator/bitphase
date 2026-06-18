import {
	advanceInstrumentRowPosition,
	calculatePt3Volume,
	getEffectiveTuningPeriod
} from '../tracker/tracker-audio-utils.js';
import {
	assignPatternRowInstrument,
	channelHasAssignedInstrument,
	isChannelOnOffHalted
} from '../tracker/tracker-instrument-channel.js';
import {
	ensureNesInstrumentRows,
	normalizeNesInstrumentRow
} from './nes-instrument-utils.js';
import { NES_CHANNEL_COUNT } from './nes-constants.js';

const NES_NOISE_TABLE = [
	6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 15, 14, 13, 12,
	11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 15, 14, 13, 12, 11, 10, 9, 8, 7,
	6, 5, 4, 3, 2, 1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
	1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
	15, 15
];

class NesAudioDriver {
	resetChannelMixerState() {}

	resizeChannels(_newCount) {}

	processPatternRow(state, pattern, rowIndex, _patternRow, registerState) {
		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const row = pattern.channels[channelIndex].rows[rowIndex];
			const isMuted = state.channelMuted[channelIndex];

			if (isMuted) {
				this._silenceChannel(registerState, channelIndex);
			} else {
				this._processNote(state, channelIndex, row);
				this._processInstrument(state, channelIndex, row);
			}
		}
	}

	_silenceChannel(registerState, channelIndex) {
		const channel = registerState.channels[channelIndex];
		if (!channel) return;
		channel.enabled = false;
		channel.period = 0;
		channel.volume = 0;
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
		let ntPos = noteIndex - 60;
		const toneSliding = state.channelToneSliding?.[channelIndex] || 0;
		const vibratoSliding = state.channelVibratoSliding?.[channelIndex] || 0;
		const detune = state.channelDetune?.[channelIndex] || 0;
		ntPos += toneSliding + vibratoSliding + detune;
		if (ntPos < 0) ntPos = 0;
		if (ntPos >= NES_NOISE_TABLE.length) ntPos = NES_NOISE_TABLE.length - 1;
		return NES_NOISE_TABLE[ntPos];
	}

	resolveInstrumentRow(state, channelIndex) {
		const instrumentIndex = state.channelInstruments[channelIndex];
		const instrument = state.instruments[instrumentIndex];
		const rows = ensureNesInstrumentRows(instrument.rows);
		const loop = instrument.loop ?? 0;
		const rowIndex = state.instrumentPositions[channelIndex] % rows.length;
		return {
			row: normalizeNesInstrumentRow(rows[rowIndex]),
			rowsLength: rows.length,
			loop
		};
	}

	processInstruments(state, registerState) {
		for (let channelIndex = 0; channelIndex < NES_CHANNEL_COUNT; channelIndex++) {
			const channel = registerState.channels[channelIndex];
			if (!channel) continue;

			const isMuted = state.channelMuted[channelIndex];
			const isSoundEnabled = state.channelSoundEnabled[channelIndex];
			const onOffHalted = isChannelOnOffHalted(state, channelIndex);

			if (isMuted || !isSoundEnabled) {
				this._silenceChannel(registerState, channelIndex);
				continue;
			}

			if (!channelHasAssignedInstrument(state, channelIndex)) {
				this._silenceChannel(registerState, channelIndex);
				continue;
			}

			const { row, rowsLength, loop } = this.resolveInstrumentRow(state, channelIndex);
			const patternVolume = state.channelPatternVolumes[channelIndex] ?? 15;
			const volume = this.calculateVolume(patternVolume, 15);
			const basePeriod = this.getEffectivePeriod(state, channelIndex);
			const period =
				channelIndex <= 2
					? this._applyToneOffset(state, channelIndex, row, basePeriod)
					: basePeriod;
			const keyOn = state.channelKeyOn[channelIndex];

			if (channelIndex <= 1) {
				channel.enabled = period > 0 && volume > 0;
				channel.period = period;
				channel.volume = volume;
				channel.duty = row.pulseWidth;
				channel.retrigger = row.retrigger || keyOn;
				state.channelKeyOn[channelIndex] = false;
			} else if (channelIndex === 2) {
				channel.enabled = period > 0;
				channel.period = period;
				channel.volume = 15;
				channel.duty = 0;
				channel.retrigger = row.retrigger || keyOn;
				state.channelKeyOn[channelIndex] = false;
			} else if (channelIndex === 3) {
				channel.enabled = volume > 0;
				channel.volume = volume;
				channel.noisePeriod = this.resolveNoisePeriod(state, channelIndex);
				channel.noiseMode = false;
				channel.retrigger = row.retrigger || keyOn;
				state.channelKeyOn[channelIndex] = false;
			} else {
				this._silenceChannel(registerState, channelIndex);
			}

			if (!onOffHalted) {
				state.instrumentPositions[channelIndex] = advanceInstrumentRowPosition(
					state.instrumentPositions[channelIndex],
					rowsLength,
					loop
				);
			}
		}
	}
}

export default NesAudioDriver;
