import { describe, expect, it } from 'vitest';
import NesAudioDriver from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import EffectAlgorithms from '../../public/tracker/effect-algorithms.js';

describe('NesAudioDriver on/off effect', () => {
	it('silences channel when on/off counter is in off phase', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = {
			channelMuted: [false],
			channelSoundEnabled: [false],
			channelInstruments: [0],
			instruments: [{ rows: [{ pulseWidth: 2, retrigger: false }], loop: 0 }],
			instrumentPositions: [0],
			channelPatternVolumes: [15],
			channelCurrentNotes: [60],
			currentTuningTable: Array.from({ length: 96 }, (_, i) => 400 + i),
			channelToneSliding: [0],
			channelVibratoSliding: [0],
			channelDetune: [0],
			channelKeyOn: [false],
			channelToneAccumulator: [0],
			channelOnOffCounter: [2],
			channelOnDuration: [3],
			channelOffDuration: [2]
		};

		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].enabled).toBe(false);
		expect(registerState.channels[0].volume).toBe(0);
	});

	it('processes on/off counter each instrument tick', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const onOff = EffectAlgorithms.initOnOff(0x32);
		const state = {
			channelMuted: [false],
			channelSoundEnabled: [true],
			channelInstruments: [0],
			instruments: [{ rows: [{ pulseWidth: 2, retrigger: false }], loop: 0 }],
			instrumentPositions: [0],
			channelPatternVolumes: [15],
			channelCurrentNotes: [60],
			currentTuningTable: Array.from({ length: 96 }, (_, i) => 400 + i),
			channelToneSliding: [0],
			channelVibratoSliding: [0],
			channelDetune: [0],
			channelKeyOn: [false],
			channelToneAccumulator: [0],
			channelOnOffCounter: [onOff.counter],
			channelOnDuration: [onOff.onDuration],
			channelOffDuration: [onOff.offDuration]
		};

		driver.processInstruments(state, registerState);
		expect(state.channelOnOffCounter[0]).toBe(onOff.counter - 1);
		expect(state.channelSoundEnabled[0]).toBe(true);
		expect(registerState.channels[0].enabled).toBe(true);
	});
});
