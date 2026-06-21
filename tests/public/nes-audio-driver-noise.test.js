import { describe, expect, it } from 'vitest';
import NesAudioDriver, {
	resolveNesNoisePeriodFromSemitoneOffset
} from '../../public/nes/nes-audio-driver.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';

describe('resolveNesNoisePeriodFromSemitoneOffset', () => {
	it('maps C-1 to period 0 and each semitone increments by 1 through 15', () => {
		expect(resolveNesNoisePeriodFromSemitoneOffset(0)).toBe(0);
		expect(resolveNesNoisePeriodFromSemitoneOffset(1)).toBe(1);
		expect(resolveNesNoisePeriodFromSemitoneOffset(14)).toBe(14);
		expect(resolveNesNoisePeriodFromSemitoneOffset(15)).toBe(15);
	});

	it('loops back to 0 after period 15', () => {
		expect(resolveNesNoisePeriodFromSemitoneOffset(16)).toBe(0);
		expect(resolveNesNoisePeriodFromSemitoneOffset(17)).toBe(1);
		expect(resolveNesNoisePeriodFromSemitoneOffset(32)).toBe(0);
	});

	it('wraps negative offsets', () => {
		expect(resolveNesNoisePeriodFromSemitoneOffset(-1)).toBe(15);
		expect(resolveNesNoisePeriodFromSemitoneOffset(-16)).toBe(0);
	});
});

describe('NesAudioDriver noise period', () => {
	it('derives noise period from channel note index', () => {
		const driver = new NesAudioDriver();
		const state = {
			channelCurrentNotes: [0, 0, 0, 5, 0],
			channelToneSliding: [0, 0, 0, 0, 0],
			channelVibratoSliding: [0, 0, 0, 0, 0],
			channelDetune: [0, 0, 0, 0, 0]
		};

		expect(driver.resolveNoisePeriod(state, 3)).toBe(5);
	});

	it('writes mapped noise period to register state', () => {
		const driver = new NesAudioDriver();
		const registerState = new NesChipRegisterState();
		const state = {
			channelMuted: [false, false, false, false, false],
			channelSoundEnabled: [false, false, false, true, false],
			channelInstruments: [-1, -1, -1, 0, -1],
			instruments: [
				{
					rows: [
						{
							pulseWidth: 2,
							retrigger: false,
							soundLength: 0,
							envelope: false,
							volumeOrRate: 15,
							toneAdd: 0,
							toneAccumulation: false,
							sweep: false,
							sweepRate: 0,
							sweepShift: 0
						}
					],
					loop: 0
				}
			],
			instrumentPositions: [0, 0, 0, 0, 0],
			channelPatternVolumes: [15, 15, 15, 15, 15],
			channelCurrentNotes: [0, 0, 0, 0, 0],
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

		driver.processInstruments(state, registerState);

		expect(registerState.channels[3].noisePeriod).toBe(0);
	});
});
