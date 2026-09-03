import { describe, expect, it } from 'vitest';
import { legacyInstruments } from '../helpers/instrument-fixtures.ts';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import {
	buildLengthCounterNibble,
	buildSquareEnvelopeVolumeReg,
	buildTriangleLinearReg,
	NES_REGISTER_UNCHANGED
} from '../../public/nes/nes-instrument-utils.js';

function createEnvelopeState(rowOverrides = {}) {
	return {
		channelMuted: [false, false, false, false, false],
		channelSoundEnabled: [true, true, true, true, false],
		channelInstruments: [0, 0, 0, 0, -1],
		instruments: legacyInstruments([
			{
				chipType: 'nes',
				rows: [
					{
						pulseWidth: 2,
						retrigger: false,
						soundLength: 40,
						envelope: true,
						volumeOrRate: 6,
						toneAdd: 0,
						toneAccumulation: false,
						sweep: false,
						sweepRate: 0,
						sweepShift: 0,
						...rowOverrides
					}
				],
				loop: 0
			}
		]),
		instrumentPositions: [0, 0, 0, 0, 0],
		channelPatternVolumes: [15, 15, 15, 15, 15],
		channelCurrentNotes: [60, 60, 60, 60, 0],
		currentTuningTable: Array.from({ length: 96 }, (_, i) => 400 + i),
		channelToneSliding: [0, 0, 0, 0, 0],
		channelVibratoSliding: [0, 0, 0, 0, 0],
		channelDetune: [0, 0, 0, 0, 0],
		channelKeyOn: [false, false, false, false, false],
		channelToneAccumulator: [0, 0, 0, 0, 0],
		channelOnOffCounter: [0, 0, 0, 0, 0],
		channelOnDuration: [0, 0, 0, 0, 0],
		channelOffDuration: [0, 0, 0, 0, 0]
	};
}

describe('NesAudioDriver envelope and length macro', () => {
	it('writes envelope and length counter settings for pulse channels', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState();

		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].volumeReg).toBe(
			buildSquareEnvelopeVolumeReg(2, true, 6, 40)
		);
		expect(registerState.channels[0].lengthNibble).toBe(buildLengthCounterNibble(40));
	});

	it('uses pulse width cycle override on square channels', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState();
		state.channelPulseWidthCycleActive = [true, false, false, false, false];
		state.channelPulseWidthCurrent = [1, 0, 0, 0, 0];

		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].duty).toBe(1);
		expect(registerState.channels[0].volumeReg).toBe(
			buildSquareEnvelopeVolumeReg(1, true, 6, 40)
		);
	});

	it('uses triangle linear counter for short sound lengths', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState({ soundLength: 64, envelope: false });

		driver.processInstruments(state, registerState);

		expect(registerState.channels[2].linearReg).toBe(buildTriangleLinearReg(64));
		expect(registerState.channels[2].lengthNibble).toBe(NES_REGISTER_UNCHANGED);
	});

	it('writes constant volume register when envelope is off', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState({ envelope: false, volumeOrRate: 10, soundLength: 40 });

		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].volumeReg).toBe(
			buildSquareEnvelopeVolumeReg(2, false, 10, 40)
		);
	});
});
