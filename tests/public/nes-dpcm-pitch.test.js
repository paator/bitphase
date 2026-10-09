import { describe, expect, it } from 'vitest';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import NesState from '../../public/nes/nes-state.js';
import { processNesDpcmPitchEffect } from '../../public/nes/nes-dpcm-pitch.js';

const E7 = { effect: 'E'.charCodeAt(0), delay: 7 };

function pitchState() {
	const state = new NesState();
	state.instruments = [
		{
			dpcmSamples: [{ name: 'kick', data: [0xaa, 0x55] }],
			dpcmAssignments: [{ sampleIndex: 0, pitch: 15, loop: true, delta: 48 }]
		}
	];
	state.channelInstruments[4] = 0;
	state.channelSoundEnabled[4] = true;
	state.channelCurrentNotes[4] = 0;
	return state;
}

function row(effect, noteName = 0) {
	return {
		note: { name: noteName },
		instrument: -1,
		effects: effect ? [effect] : [null]
	};
}

function pattern(channelRow) {
	const channels = Array.from({ length: 5 }, () => ({ rows: [row(null)] }));
	channels[4].rows[0] = channelRow;
	return { channels };
}

function play(channelRow) {
	const driver = new NesAudioDriver();
	const state = pitchState();
	const registerState = new NesChipRegisterState();
	driver.processPatternRow(state, pattern(channelRow), 0, null, registerState);
	driver.processInstruments(state, registerState);
	return { driver, state, registerState };
}

describe('NES DPCM frequency', () => {
	it('replaces the instrument pitch when E7 is on the note', () => {
		const { state, registerState } = play(row({ ...E7, parameter: 0x1a }, 2));
		const channel = registerState.channels[4];

		expect(state.channelDpcmPitchActive[4]).toBe(true);
		expect(state.channelDpcmPitch[4]).toBe(0x0a);
		expect(channel.dpcmPitch).toBe(0x0a);
		expect(channel.retrigger).toBe(true);
		expect(channel.dpcmPitchWrite).toBe(false);
	});

	it('changes the playing sample rate without retriggering', () => {
		const { driver, state, registerState } = play(row(null, 2));
		expect(registerState.channels[4].dpcmPitch).toBe(15);

		driver.processPatternRow(state, pattern(row({ ...E7, parameter: 0x03 })), 0, null, registerState);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[4].dpcmPitch).toBe(0x03);
		expect(registerState.channels[4].retrigger).toBe(false);
		expect(registerState.channels[4].dpcmPitchWrite).toBe(true);
		expect(state.channelDpcmPitchWrite[4]).toBe(false);
	});

	it('uses the instrument pitch on the next note', () => {
		const { driver, state, registerState } = play(row({ ...E7, parameter: 0x0a }, 2));

		driver.processPatternRow(state, pattern(row(null, 2)), 0, null, registerState);
		driver.processInstruments(state, registerState);

		expect(state.channelDpcmPitchActive[4]).toBe(false);
		expect(registerState.channels[4].dpcmPitch).toBe(15);
		expect(registerState.channels[4].retrigger).toBe(true);
	});

	it('ignores other channels, mute, and table effects', () => {
		const state = pitchState();
		processNesDpcmPitchEffect(state, 0, row({ ...E7, parameter: 0x04 }), 0);
		state.channelMuted[4] = true;
		processNesDpcmPitchEffect(state, 4, row({ ...E7, parameter: 0x04 }), 4);
		state.channelMuted[4] = false;
		processNesDpcmPitchEffect(
			state,
			4,
			{ effects: [{ ...E7, parameter: 0x04, tableIndex: 1 }] },
			4
		);
		expect(state.channelDpcmPitchActive[4]).toBe(false);
	});

	it('leaves the pitch alone when the arrays are missing', () => {
		const driver = new NesAudioDriver();
		const state = pitchState();
		delete state.channelDpcmPitchActive;
		delete state.channelDpcmPitch;
		delete state.channelDpcmPitchWrite;
		const registerState = new NesChipRegisterState();
		driver.processPatternRow(
			state,
			pattern(row({ ...E7, parameter: 0x01 }, 2)),
			0,
			null,
			registerState
		);
		driver.processInstruments(state, registerState);
		expect(registerState.channels[4].dpcmPitch).toBe(15);
	});
});
