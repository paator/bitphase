import { describe, expect, it } from 'vitest';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import { buildSquareSweepReg } from '../../public/nes/nes-instrument-utils.js';

function createLoopingSweepState() {
	return {
		channelMuted: [false],
		channelSoundEnabled: [true],
		channelInstruments: [0],
		instruments: [
			{
				rows: [
					{
						pulseWidth: 2,
						retrigger: false,
						sweep: true,
						sweepRate: 4,
						sweepShift: -1
					},
					{
						pulseWidth: 2,
						retrigger: false,
						sweep: true,
						sweepRate: 4,
						sweepShift: 2
					}
				],
				loop: 0
			}
		],
		instrumentPositions: [0],
		channelPatternVolumes: [15],
		channelCurrentNotes: [60],
		currentTuningTable: Array.from({ length: 96 }, (_, i) => 400 + i),
		channelToneSliding: [0],
		channelVibratoSliding: [0],
		channelDetune: [0],
		channelKeyOn: [false],
		channelToneAccumulator: [0],
		channelOnOffCounter: [0],
		channelOnDuration: [0],
		channelOffDuration: [0]
	};
}

describe('NesAudioDriver hardware sweep macro', () => {
	it('cycles sweep register when macro rows loop', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createLoopingSweepState();
		const row0Sweep = buildSquareSweepReg(true, 4, -1);
		const row1Sweep = buildSquareSweepReg(true, 4, 2);

		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].sweepReg).toBe(row0Sweep);
		expect(state.instrumentPositions[0]).toBe(1);

		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].sweepReg).toBe(row1Sweep);
		expect(state.instrumentPositions[0]).toBe(0);

		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].sweepReg).toBe(row0Sweep);
		expect(state.instrumentPositions[0]).toBe(1);
	});
});
