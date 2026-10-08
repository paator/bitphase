import { describe, expect, it } from 'vitest';
import { legacyInstruments } from '../helpers/instrument-fixtures.ts';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import NesState from '../../public/nes/nes-state.js';
import { processNesEnvelopeModeEffect } from '../../public/nes/nes-envelope-mode.js';

const E6 = { effect: 'E'.charCodeAt(0), delay: 6 };
const E5 = { effect: 'E'.charCodeAt(0), delay: 5 };

function envelopeState() {
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

function play(channelIndex, effect, noteName = 2) {
	const driver = new NesAudioDriver();
	const state = envelopeState();
	const registerState = new NesChipRegisterState();
	driver.processPatternRow(
		state,
		pattern([[channelIndex, row(effect, noteName)]]),
		0,
		null,
		registerState
	);
	driver.processInstruments(state, registerState);
	return { driver, state, registerState };
}

describe('NES envelope mode', () => {
	it('writes E600 into bits 4-5 and keeps duty and volume', () => {
		const { state, registerState } = play(0, { ...E6, parameter: 0x10 });
		const volumeReg = registerState.channels[0].volumeReg;

		expect(state.channelEnvelopeModeActive[0]).toBe(true);
		expect(state.channelEnvelopeMode[0]).toBe(0);
		expect(volumeReg & 0x30).toBe(0x00);
		expect(volumeReg & 0xc0).toBe(0x80);
		expect(volumeReg & 0x0f).toBe(6);
	});

	it('writes length, looping, and constant modes', () => {
		expect(play(0, { ...E6, parameter: 0x01 }).registerState.channels[0].volumeReg & 0x30).toBe(
			0x10
		);
		expect(play(0, { ...E6, parameter: 0x02 }).registerState.channels[0].volumeReg & 0x30).toBe(
			0x20
		);
		expect(play(0, { ...E6, parameter: 0x07 }).registerState.channels[0].volumeReg & 0x30).toBe(
			0x30
		);
	});

	it('writes the mode on noise', () => {
		const { registerState } = play(3, { ...E6, parameter: 0x01 });
		expect(registerState.channels[3].volumeReg & 0x30).toBe(0x10);
		expect(registerState.channels[3].volumeReg & 0x0f).toBe(6);
	});

	it('keeps the mode after the effect row', () => {
		const { driver, state, registerState } = play(0, { ...E6, parameter: 0x00 });
		state.instrumentPositions[0] = 0;
		driver.processPatternRow(state, pattern([[0, row(null)]]), 0, null, registerState);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].volumeReg & 0x30).toBe(0x00);
	});

	it('lets E6 override the length-counter halt bit', () => {
		const driver = new NesAudioDriver();
		const state = envelopeState();
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern([
				[
					0,
					{
						note: { name: 2 },
						instrument: -1,
						effects: [
							{ ...E5, parameter: 0x01 },
							{ ...E6, parameter: 0x02 }
						]
					}
				]
			]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].lengthNibble).toBe(0x01);
		expect(registerState.channels[0].volumeReg & 0x30).toBe(0x20);
	});

	it('ignores triangle, DPCM, mute, and table effects', () => {
		const state = envelopeState();
		processNesEnvelopeModeEffect(state, 2, row({ ...E6, parameter: 0x01 }), 2);
		processNesEnvelopeModeEffect(state, 4, row({ ...E6, parameter: 0x01 }), 4);
		state.channelMuted[0] = true;
		processNesEnvelopeModeEffect(state, 0, row({ ...E6, parameter: 0x01 }), 0);
		processNesEnvelopeModeEffect(
			state,
			1,
			{ effects: [{ ...E6, parameter: 0x01, tableIndex: 1 }] },
			1
		);
		expect(state.channelEnvelopeModeActive).toEqual([false, false, false, false, false]);
	});

	it('leaves the volume register alone when the mode arrays are missing', () => {
		const driver = new NesAudioDriver();
		const state = envelopeState();
		delete state.channelEnvelopeModeActive;
		delete state.channelEnvelopeMode;
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern([[0, row({ ...E6, parameter: 0x01 }, 2)]]),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[0].volumeReg & 0x30).toBe(0x20);
	});
});
