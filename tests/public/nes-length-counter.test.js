import { describe, expect, it } from 'vitest';
import { legacyInstruments } from '../helpers/instrument-fixtures.ts';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import NesState from '../../public/nes/nes-state.js';
import { NES_REGISTER_UNCHANGED } from '../../public/nes/nes-instrument-utils.js';
import { processNesLengthCounterEffect } from '../../public/nes/nes-length-counter.js';

const E5 = { effect: 'E'.charCodeAt(0), delay: 5 };

function lengthState() {
	const state = new NesState();
	state.setInstruments(
		legacyInstruments([
			{
				chipType: 'nes',
				rows: [
					{
						pulseWidth: 2,
						retrigger: false,
						soundLength: 0,
						envelope: true,
						volumeOrRate: 6,
						toneAdd: 0,
						toneAccumulation: false,
						sweep: false,
						sweepRate: 0,
						sweepShift: 0
					}
				],
				loop: 0
			}
		])
	);
	state.channelInstruments = [0, 0, 0, 0, -1];
	state.channelSoundEnabled = [true, true, true, true, false];
	state.channelCurrentNotes = [60, 60, 60, 60, 0];
	state.currentTuningTable = Array.from({ length: 96 }, (_, index) => 400 + index);
	return state;
}

function row(effect, noteName = 0) {
	return {
		note: { name: noteName },
		instrument: -1,
		effects: effect ? [effect] : [null]
	};
}

function pattern(rows) {
	const channels = Array.from({ length: 5 }, () => ({ rows: [row(null)] }));
	for (const [channelIndex, channelRow] of rows) {
		channels[channelIndex].rows[0] = channelRow;
	}
	return { channels };
}

describe('NES length counter', () => {
	it('loads E5XY on pulse, clears the halt bit, and reloads the timer', () => {
		const driver = new NesAudioDriver();
		const state = lengthState();
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern([[0, row({ ...E5, parameter: 0x21 }, 2)]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);

		expect(state.channelLengthCounterActive[0]).toBe(true);
		expect(state.channelLengthCounterIndex[0]).toBe(0x01);
		expect(registerState.channels[0].lengthNibble).toBe(0x01);
		expect(registerState.channels[0].volumeReg & (1 << 5)).toBe(0);
		expect(registerState.channels[0].lengthReload).toBe(true);
		expect(state.channelLengthCounterReload[0]).toBe(false);
	});

	it('reloads the same index when E5 repeats on a held note', () => {
		const driver = new NesAudioDriver();
		const state = lengthState();
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern([[0, row({ ...E5, parameter: 0x01 }, 2)]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);
		registerState.channels[0].lengthReload = false;
		state.instrumentPositions[0] = 0;

		driver.processPatternRow(
			state,
			pattern([[0, row({ ...E5, parameter: 0x01 })]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].lengthNibble).toBe(0x01);
		expect(registerState.channels[0].lengthReload).toBe(true);
		expect(registerState.channels[0].retrigger).toBe(false);
	});

	it('keeps the latched length across note off and the next note', () => {
		const driver = new NesAudioDriver();
		const state = lengthState();
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern([[0, row({ ...E5, parameter: 0x03 }, 2)]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);

		driver.processPatternRow(state, pattern([[0, row(null, 1)]]), 0, null, registerState);
		driver.processInstruments(state, registerState);
		expect(state.channelLengthCounterActive[0]).toBe(true);
		expect(registerState.channels[0].enabled).toBe(false);

		driver.processPatternRow(state, pattern([[0, row(null, 2)]]), 0, null, registerState);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].lengthNibble).toBe(0x03);
		expect(registerState.channels[0].lengthReload).toBe(false);
		expect(registerState.channels[0].retrigger).toBe(true);
	});

	it('lets the triangle linear counter run while the length counter is loaded', () => {
		const driver = new NesAudioDriver();
		const state = lengthState();
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern([[2, row({ ...E5, parameter: 0x1f }, 2)]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[2].lengthNibble).toBe(0x1f);
		expect(registerState.channels[2].linearReg).toBe(0x7f);
		expect(registerState.channels[2].lengthReload).toBe(true);
	});

	it('ignores E5 on DPCM, while muted, and as a table effect', () => {
		const state = lengthState();
		processNesLengthCounterEffect(state, 4, row({ ...E5, parameter: 0x04 }), 4);
		state.channelMuted[0] = true;
		processNesLengthCounterEffect(state, 0, row({ ...E5, parameter: 0x04 }), 0);
		processNesLengthCounterEffect(
			state,
			1,
			{ effects: [{ ...E5, parameter: 0x04, tableIndex: 1 }] },
			1
		);

		expect(state.channelLengthCounterActive).toEqual([false, false, false, false, false]);
	});

	it('leaves channels alone when the length-counter arrays are missing', () => {
		const driver = new NesAudioDriver();
		const state = lengthState();
		delete state.channelLengthCounterActive;
		delete state.channelLengthCounterReload;
		const registerState = new NesChipRegisterState();

		driver.processPatternRow(
			state,
			pattern([[0, row({ ...E5, parameter: 0x01 }, 2)]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].lengthNibble).toBe(NES_REGISTER_UNCHANGED);
	});
});
