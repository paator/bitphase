import { describe, expect, it } from 'vitest';
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
		instruments: [
			{
				rows: [
					{
						pulseWidth: 2,
						retrigger: false,
						soundLength: 40,
						envelopeMode: 'decay',
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
		],
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
	it('writes decay envelope and length counter settings for pulse channels', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState();

		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].volumeReg).toBe(
			buildSquareEnvelopeVolumeReg(2, 'decay', 6, 40)
		);
		expect(registerState.channels[0].lengthNibble).toBe(
			buildLengthCounterNibble('decay', 40)
		);
	});

	it('uses triangle linear counter for short sound lengths', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState({ soundLength: 64, envelopeMode: 'hold' });

		driver.processInstruments(state, registerState);

		expect(registerState.channels[2].linearReg).toBe(buildTriangleLinearReg('hold', 64));
		expect(registerState.channels[2].lengthNibble).toBe(NES_REGISTER_UNCHANGED);
	});

	it('skips envelope register updates in unchanged mode', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createEnvelopeState({ envelopeMode: 'unchanged' });

		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].volumeReg).toBe(NES_REGISTER_UNCHANGED);
		expect(registerState.channels[0].lengthNibble).toBe(NES_REGISTER_UNCHANGED);
	});
});
