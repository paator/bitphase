import { describe, expect, it } from 'vitest';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import {
	advanceNesDeltaCounterTable,
	processNesDeltaCounterEffect
} from '../../public/nes/nes-delta-counter.js';

const E4 = { effect: 'E'.charCodeAt(0), delay: 4 };

function emptyRow() {
	return { note: { name: 0 }, instrument: -1, effects: [null] };
}

function deltaState() {
	return {
		channelMuted: [false, false, false, false, false],
		channelSoundEnabled: [false, false, false, false, false],
		channelInstruments: [-1, -1, -1, -1, 0],
		instruments: [
			{
				dpcmSamples: [{ name: 'kick', data: [0xaa] }],
				dpcmAssignments: [{ sampleIndex: 0, pitch: 15, loop: false, delta: 48 }]
			}
		],
		instrumentPositions: [0, 0, 0, 0, 0],
		channelPatternVolumes: [15, 15, 15, 15, 15],
		channelCurrentNotes: [0, 0, 0, 0, 0],
		channelKeyOn: [false, false, false, false, false],
		channelToneAccumulator: [0, 0, 0, 0, 0],
		channelOnOffCounter: [0, 0, 0, 0, 0],
		channelOnDuration: [0, 0, 0, 0, 0],
		channelOffDuration: [0, 0, 0, 0, 0],
		channelDpcmDelta: [0, 0, 0, 0, 0],
		channelDpcmDeltaWrite: [false, false, false, false, false],
		channelDpcmDeltaTableMode: [false, false, false, false, false],
		channelDpcmDeltaTableIndex: [-1, -1, -1, -1, -1],
		channelDpcmDeltaTablePosition: [0, 0, 0, 0, 0],
		channelSweepOverrideActive: [false, false, false, false, false],
		channelSweepOverrideReg: [0x08, 0x08, 0x08, 0x08, 0x08],
		channelSweepTableMode: [false, false, false, false, false],
		channelSweepTableIndex: [-1, -1, -1, -1, -1],
		channelSweepTablePosition: [0, 0, 0, 0, 0],
		channelSweepDown: [false, false, false, false, false],
		channelSweepTableTick: [false, false, false, false, false]
	};
}

function patternWith(channelIndex, effect, noteName = 0) {
	const channels = Array.from({ length: 5 }, () => ({ rows: [emptyRow()] }));
	channels[channelIndex].rows[0] = {
		note: { name: noteName },
		instrument: -1,
		effects: [effect]
	};
	return { channels };
}

describe('NES delta counter', () => {
	it('latches E4XY on the DPCM channel and ignores it elsewhere', () => {
		const state = deltaState();
		processNesDeltaCounterEffect(
			state,
			0,
			{ effects: [{ ...E4, parameter: 0x11 }] },
			0
		);
		processNesDeltaCounterEffect(
			state,
			4,
			{ effects: [{ ...E4, parameter: 0xff }] },
			4
		);
		expect(state.channelDpcmDeltaWrite[0]).toBe(false);
		expect(state.channelDpcmDelta[4]).toBe(0x7f);
		expect(state.channelDpcmDeltaWrite[4]).toBe(true);
	});

	it('writes the latched level after instruments run, without retriggering a silent channel', () => {
		const driver = new NesAudioDriver();
		const state = deltaState();
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			patternWith(4, { ...E4, parameter: 0x5a }),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[4].dpcmDelta).toBe(0x5a);
		expect(registerState.channels[4].dpcmDeltaHold).toBe(0x5a);
		expect(registerState.channels[4].dpcmDeltaWrite).toBe(true);
		expect(registerState.channels[4].enabled).toBe(false);
		expect(registerState.channels[4].retrigger).toBe(false);
		expect(state.channelDpcmDeltaWrite[4]).toBe(false);

		registerState.channels[4].dpcmDeltaWrite = true;
		driver.processInstruments(state, registerState);
		expect(registerState.channels[4].dpcmDeltaWrite).toBe(false);
	});

	it('writes the delta counter back to 0 when the DPCM note is cut', () => {
		const driver = new NesAudioDriver();
		const state = deltaState();
		state.channelDpcmDelta[4] = 0x5a;
		state.channelDpcmDeltaTableMode[4] = true;
		state.channelDpcmDeltaTableIndex[4] = 0;
		const registerState = new NesChipRegisterState();
		registerState.channels[4].dpcmDeltaHold = 0x5a;

		driver.processPatternRow(state, patternWith(4, null, 1), 0, null, registerState);
		driver.processInstruments(state, registerState);

		expect(state.channelDpcmDelta[4]).toBe(0);
		expect(state.channelDpcmDeltaTableMode[4]).toBe(false);
		expect(registerState.channels[4].dpcmDelta).toBe(0);
		expect(registerState.channels[4].dpcmDeltaHold).toBe(0);
		expect(registerState.channels[4].dpcmDeltaWrite).toBe(true);
		expect(registerState.channels[4].enabled).toBe(false);
	});

	it('lets a DPCM note cut override E4 on the same row', () => {
		const driver = new NesAudioDriver();
		const state = deltaState();
		const registerState = new NesChipRegisterState();

		driver.processPatternRow(
			state,
			patternWith(4, { ...E4, parameter: 0x7f }, 1),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[4].dpcmDelta).toBe(0);
		expect(registerState.channels[4].dpcmDeltaWrite).toBe(true);
	});

	it('replaces the instrument delta when E4XY shares a DPCM note', () => {
		const driver = new NesAudioDriver();
		const state = deltaState();
		state.channelSoundEnabled[4] = true;
		state.channelKeyOn[4] = true;
		const registerState = new NesChipRegisterState();
		processNesDeltaCounterEffect(
			state,
			4,
			{ effects: [{ ...E4, parameter: 0x22 }] },
			4
		);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[4].dpcmDelta).toBe(0x22);
		expect(registerState.channels[4].dpcmDeltaWrite).toBe(true);
		expect(registerState.channels[4].retrigger).toBe(true);
		expect(registerState.channels[4].enabled).toBe(true);
	});

	it('steps E4TX through the table and stops when a fixed E4 replaces it', () => {
		const driver = new NesAudioDriver();
		const state = deltaState();
		const table = { rows: [0x10, 0x20, 0x7f], loop: 1 };
		state.getTable = () => table;
		const registerState = new NesChipRegisterState();

		processNesDeltaCounterEffect(
			state,
			4,
			{ effects: [{ ...E4, parameter: 0, tableIndex: 0 }] },
			4
		);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[4].dpcmDelta).toBe(0x10);
		expect(state.channelDpcmDeltaTableMode[4]).toBe(true);

		registerState.channels[4].dpcmDeltaWrite = false;
		advanceNesDeltaCounterTable(state);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[4].dpcmDelta).toBe(0x20);
		expect(state.channelDpcmDeltaTablePosition[4]).toBe(1);

		registerState.channels[4].dpcmDeltaWrite = false;
		advanceNesDeltaCounterTable(state);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[4].dpcmDelta).toBe(0x7f);
		expect(state.channelDpcmDeltaTablePosition[4]).toBe(2);

		registerState.channels[4].dpcmDeltaWrite = false;
		advanceNesDeltaCounterTable(state);
		expect(state.channelDpcmDeltaTablePosition[4]).toBe(1);
		expect(state.channelDpcmDelta[4]).toBe(0x20);

		processNesDeltaCounterEffect(
			state,
			4,
			{ effects: [{ ...E4, parameter: 0x01 }] },
			4
		);
		expect(state.channelDpcmDeltaTableMode[4]).toBe(false);
		expect(state.channelDpcmDelta[4]).toBe(0x01);
		advanceNesDeltaCounterTable(state);
		expect(state.channelDpcmDelta[4]).toBe(0x01);
	});
});
