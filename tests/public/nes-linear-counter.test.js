import { describe, expect, it } from 'vitest';
import { legacyInstruments } from '../helpers/instrument-fixtures.ts';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import NesState from '../../public/nes/nes-state.js';
import { processNesLinearCounterEffect } from '../../public/nes/nes-linear-counter.js';

const E8 = { effect: 'E'.charCodeAt(0), delay: 8 };
const E5 = { effect: 'E'.charCodeAt(0), delay: 5 };

function linearState() {
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

function pattern(channelIndex, channelRow) {
	const channels = Array.from({ length: 5 }, () => ({ rows: [row(null)] }));
	channels[channelIndex].rows[0] = channelRow;
	return { channels };
}

function play(channelIndex, channelRow) {
	const driver = new NesAudioDriver();
	const state = linearState();
	const registerState = new NesChipRegisterState();
	driver.processPatternRow(state, pattern(channelIndex, channelRow), 0, null, registerState);
	driver.processInstruments(state, registerState);
	return { driver, state, registerState };
}

describe('NES linear counter', () => {
	it('writes E840 to the triangle linear register and reloads the timer', () => {
		const { state, registerState } = play(2, row({ ...E8, parameter: 0x140 }, 2));
		expect(state.channelLinearCounterActive[2]).toBe(true);
		expect(state.channelLinearCounter[2]).toBe(0x40);
		expect(registerState.channels[2].linearReg).toBe(0x40);
		expect(registerState.channels[2].lengthReload).toBe(true);
		expect(state.channelLinearCounterReload[2]).toBe(false);
	});

	it('halts the counter when bit 7 is set', () => {
		const { registerState } = play(2, row({ ...E8, parameter: 0xff }, 2));
		expect(registerState.channels[2].linearReg).toBe(0xff);
	});

	it('keeps the value across the next note', () => {
		const { driver, state, registerState } = play(2, row({ ...E8, parameter: 0x40 }, 2));
		registerState.channels[2].lengthReload = false;
		driver.processPatternRow(state, pattern(2, row(null, 2)), 0, null, registerState);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[2].linearReg).toBe(0x40);
		expect(registerState.channels[2].lengthReload).toBe(false);
		expect(registerState.channels[2].retrigger).toBe(true);
	});

	it('lets E8 replace the length-counter halt bit', () => {
		const { registerState } = play(2, {
			note: { name: 2 },
			instrument: -1,
			effects: [
				{ ...E5, parameter: 0x01 },
				{ ...E8, parameter: 0xff }
			]
		});
		expect(registerState.channels[2].lengthNibble).toBe(0x01);
		expect(registerState.channels[2].linearReg).toBe(0xff);
	});

	it('ignores other channels, mute, and table effects', () => {
		const state = linearState();
		processNesLinearCounterEffect(state, 0, row({ ...E8, parameter: 0x40 }), 0);
		state.channelMuted[2] = true;
		processNesLinearCounterEffect(state, 2, row({ ...E8, parameter: 0x40 }), 2);
		state.channelMuted[2] = false;
		processNesLinearCounterEffect(
			state,
			2,
			{ effects: [{ ...E8, parameter: 0x40, tableIndex: 1 }] },
			2
		);
		expect(state.channelLinearCounterActive[2]).toBe(false);
	});

	it('leaves the instrument register when the arrays are missing', () => {
		const driver = new NesAudioDriver();
		const state = linearState();
		delete state.channelLinearCounterActive;
		delete state.channelLinearCounter;
		delete state.channelLinearCounterReload;
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern(2, row({ ...E8, parameter: 0x40 }, 2)),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[2].linearReg).toBe(0xff);
	});
});
