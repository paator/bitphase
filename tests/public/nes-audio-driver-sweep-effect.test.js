import { describe, expect, it } from 'vitest';
import { legacyInstruments } from '../helpers/instrument-fixtures.ts';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import { buildSquareSweepReg } from '../../public/nes/nes-instrument-utils.js';

function createSweepOverrideState() {
	return {
		channelMuted: [false],
		channelSoundEnabled: [true],
		channelInstruments: [0],
		instruments: legacyInstruments([
			{
				chipType: 'nes',
				rows: [
					{
						pulseWidth: 2,
						retrigger: false,
						sweep: true,
						sweepRate: 1,
						sweepShift: 1
					}
				],
				loop: 0
			}
		]),
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
		channelOffDuration: [0],
		channelPulseWidthCycleActive: [false],
		channelPulseWidthCurrent: [0],
		channelPulseWidthTableMode: [false],
		channelPulseWidthTableIndex: [-1],
		channelPulseWidthTablePosition: [0],
		channelSweepOverrideActive: [false],
		channelSweepOverrideReg: [0x08],
		channelSweepTableMode: [false],
		channelSweepTableIndex: [-1],
		channelSweepTablePosition: [0],
		channelSweepDown: [false],
		channelSweepTableTick: [false]
	};
}

describe('NesAudioDriver E2/E3 sweep override', () => {
	it('uses E2 sweep override instead of instrument sweep', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createSweepOverrideState();
		const pattern = {
			channels: [
				{
					rows: [
						{
							note: { name: 60, octave: 0 },
							effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x47 }]
						}
					]
				}
			]
		};

		driver.processPatternRow(state, pattern, 0, pattern.channels[0].rows[0], registerState);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].sweepReg).toBe(buildSquareSweepReg(true, 4, 7));
	});

	it('uses E3 sweep down override', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createSweepOverrideState();
		const pattern = {
			channels: [
				{
					rows: [
						{
							note: { name: 60, octave: 0 },
							effects: [{ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0x23 }]
						}
					]
				}
			]
		};

		driver.processPatternRow(state, pattern, 0, pattern.channels[0].rows[0], registerState);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].sweepReg).toBe(buildSquareSweepReg(true, 2, -3));
	});

	it('clears sweep override on note off', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createSweepOverrideState();
		state.channelSweepOverrideActive[0] = true;
		state.channelSweepOverrideReg[0] = buildSquareSweepReg(true, 4, 4);
		const pattern = {
			channels: [
				{
					rows: [{ note: { name: 1, octave: 0 }, effects: [null] }]
				}
			]
		};

		driver.processPatternRow(state, pattern, 0, pattern.channels[0].rows[0], registerState);

		expect(state.channelSweepOverrideActive[0]).toBe(false);
	});

	it('marks sweep register update-only after table advance', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = createSweepOverrideState();
		state.channelSweepOverrideActive[0] = true;
		state.channelSweepOverrideReg[0] = buildSquareSweepReg(true, 4, 4);
		state.channelSweepTableTick[0] = true;

		driver.syncSweepTableRegisterState(state, registerState);

		expect(registerState.channels[0].sweepReg).toBe(buildSquareSweepReg(true, 4, 4));
		expect(registerState.channels[0].sweepUpdateOnly).toBe(true);
		expect(state.channelSweepTableTick[0]).toBe(false);
	});
});
