import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSaaEffect, saaStickyChannelEffectGroup } from '@/lib/chips/saa/effects';
import { SAA_SAM_CLOCK, resolveSaaTuningTable, saaToneFrequency } from '@/lib/chips/saa/schema';
import SaaAudioDriver from '../../../../public/saa/saa-audio-driver.js';
import SaaRegisterState from '../../../../public/saa/saa-register-state.js';
import SaaState from '../../../../public/saa/saa-state.js';
import TrackerPatternProcessor from '../../../../public/tracker/tracker-pattern-processor.js';
import { createSaaSoundEngine } from '../../../../public/saa/saa-engine.js';
import {
	SAA_CHANNEL_COUNT,
	SAA_FULL_SIDE_PEAK,
	SAA_OUTPUT_GAIN
} from '../../../../public/saa/saa-constants.js';
import { saaWasmImports } from '../../../../public/saa/saa-wasm-imports.js';
import {
	saaEnvelopeControlByte,
	saaNoiseClockByte,
	saaPeriodFromCode,
	saaPitchCode
} from '../../../../public/saa/saa-levels.js';
import EffectAlgorithms from '../../../../public/tracker/effect-algorithms.js';

const toneCodes = resolveSaaTuningTable(SAA_SAM_CLOCK, 440);

function playbackState(note: number) {
	return {
		channelMuted: [false],
		channelSoundEnabled: [true],
		channelPatternLeft: [15],
		channelPatternRight: [8],
		channelAmplitudeSliding: [0],
		channelInstruments: [0],
		instrumentPositions: [0],
		channelCurrentNotes: [note],
		currentTuningTable: toneCodes.map((code) => saaPeriodFromCode(code)),
		instruments: [
			{
				id: '01',
				macros: {
					left: { values: [15], loop: 0 },
					right: { values: [4], loop: 0 },
					amplitudeSlide: { values: [1], loop: 0 }
				}
			}
		]
	};
}

function toneCode(channel: { octave: number; freq: number }) {
	return ((channel.octave & 7) << 8) | (channel.freq & 0xff);
}

describe('SAA tone playback', () => {
	it('applies left and right volumes and an upward amplitude slide', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		const registers = new SaaRegisterState(1);
		driver.processInstruments(state, registers);
		const channel = registers.channels[0];
		expect(channel.tone).toBe(true);
		expect(channel.left).toBe(15);
		expect(channel.right).toBe(3);
		expect(toneCode(channel)).toBe(toneCodes[45]);
		expect(state.channelAmplitudeSliding[0]).toBe(1);
		expect(state.instrumentPositions[0]).toBe(1);
	});

	it('keeps a blank pattern level and treats 0 as silence', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		const pattern = {
			channels: [
				{
					rows: [{ note: { name: 0, octave: 0 }, left: 0, right: -1, instrument: 0 }]
				}
			]
		};
		driver.processPatternRow(state, pattern, 0, new SaaRegisterState(1));
		expect(state.channelPatternLeft[0]).toBe(15);
		expect(state.channelPatternRight[0]).toBe(0);
	});

	it('adds the tone offset to the period and accumulates it when asked', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.channelToneAccumulator = [0];
		state.instruments[0].macros.toneAdd = { values: [16], loop: 0 };
		state.instruments[0].macros.toneAccumulation = { values: [true], loop: 0 };
		const registers = new SaaRegisterState(1);
		const period = saaPeriodFromCode(toneCodes[45]);
		driver.processInstruments(state, registers);
		expect(toneCode(registers.channels[0])).toBe(saaPitchCode(period, 16));
		expect(state.channelToneAccumulator[0]).toBe(16);
		driver.processInstruments(state, registers);
		expect(toneCode(registers.channels[0])).toBe(saaPitchCode(period, 32));
	});

	it('adds the noise offset to the N column while noise is on', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.noiseClock0 = 0;
		state.channelNoiseAccumulator = [0];
		state.instruments[0].macros.noise = { values: [true], loop: 0 };
		state.instruments[0].macros.noiseAdd = { values: [1], loop: 0 };
		state.instruments[0].macros.noiseAccumulation = { values: [true], loop: 0 };
		const registers = new SaaRegisterState(1);
		driver.processInstruments(state, registers);
		expect(registers.noise0).toBe(1);
		expect(state.channelNoiseAccumulator[0]).toBe(1);
		driver.processInstruments(state, registers);
		expect(registers.noise0).toBe(2);
	});

	it('keeps an envelope mode, swaps sides, and locks noise', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.instruments[0].macros.amplitudeSlide = { values: [0], loop: 0 };
		state.channelStereoInvert = [false];
		state.envelopeCommand0 = null;
		state.envelopeRetrigger0 = false;
		state.noiseLock0 = false;
		state.noiseClock0 = 1;
		state.instruments[0].macros.noise = { values: [false], loop: 0 };
		driver.processPatternRow(
			state,
			{
				channels: [
					{
						rows: [
							{
								note: { name: 0, octave: 0 },
								effects: [
									{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 1 },
									{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 1 }
								]
							}
						]
					}
				]
			},
			0,
			{ env0: 1 }
		);
		const registers = new SaaRegisterState(6);
		driver.processInstruments(state, registers);
		expect(state.envelopeCommand0).toBe(0x96);
		expect(registers.envelope0).toBe(0x96);
		expect(registers.channels[0].left).toBe(2);
		expect(registers.channels[0].right).toBe(15);
		expect(registers.noise0).toBe(3);
	});

	it('publishes channel A noise clock while the noise mixer is off', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.noiseClock0 = 0;
		state.instruments[0].macros.noise = { values: [false], loop: 0 };
		state.instruments[0].macros.noiseAdd = { values: [2], loop: 0 };
		const registers = new SaaRegisterState(1);
		driver.processInstruments(state, registers);
		expect(registers.noise0).toBe(2);
	});

	it('lowers pitch for a positive slide and raises it for a negative one', () => {
		const driver = new SaaAudioDriver();
		const down = playbackState(45);
		down.channelToneSliding = [16];
		const downRegisters = new SaaRegisterState(1);
		driver.processInstruments(down, downRegisters);
		const up = playbackState(45);
		up.channelToneSliding = [-16];
		const upRegisters = new SaaRegisterState(1);
		driver.processInstruments(up, upRegisters);
		const baseHz = saaToneFrequency(SAA_SAM_CLOCK, toneCodes[45] >> 8, toneCodes[45] & 0xff);
		const downChannel = downRegisters.channels[0];
		const upChannel = upRegisters.channels[0];
		const downHz = saaToneFrequency(SAA_SAM_CLOCK, downChannel.octave, downChannel.freq);
		const upHz = saaToneFrequency(SAA_SAM_CLOCK, upChannel.octave, upChannel.freq);
		expect(downHz).toBeLessThan(baseHz);
		expect(upHz).toBeGreaterThan(baseHz);
	});

	it('glides toward a higher note when the period offset reaches the portamento delta', () => {
		const periods = toneCodes.map((code) => saaPeriodFromCode(code));
		const delta = periods[52] - periods[45];
		expect(saaPitchCode(periods[45], delta)).toBe(toneCodes[52]);
		const mid = saaPitchCode(periods[45], Math.trunc(delta / 2));
		const baseHz = saaToneFrequency(SAA_SAM_CLOCK, toneCodes[45] >> 8, toneCodes[45] & 0xff);
		const midHz = saaToneFrequency(SAA_SAM_CLOCK, mid >> 8, mid & 0xff);
		expect(midHz).toBeGreaterThan(baseHz);
	});

	it('slides left and right by the same step and clamps each side on its own', () => {
		const state = new SaaState();
		const driver = new SaaAudioDriver();
		const processor = new TrackerPatternProcessor(state, driver, {});
		const registers = new SaaRegisterState(6);
		state.channelPatternRight[0] = 4;
		const pattern = {
			length: 1,
			patternRows: [{}],
			channels: [
				{
					rows: [
						{
							note: { name: 0, octave: 0 },
							left: 12,
							right: 0,
							effects: [{ effect: 8, delay: 0, parameter: 0x21 }]
						}
					]
				}
			]
		};

		processor.parsePatternRow(pattern, 0, registers);
		expect(state.channelPatternLeft[0]).toBe(12);
		expect(state.channelPatternRight[0]).toBe(4);

		processor.processVolumeSlides();
		expect(state.channelPatternLeft[0]).toBe(13);
		expect(state.channelPatternRight[0]).toBe(5);

		state.channelPatternRight[0] = 15;
		processor.processVolumeSlides();
		expect(state.channelPatternLeft[0]).toBe(14);
		expect(state.channelPatternRight[0]).toBe(15);

		state.channelPatternLeft[0] = 1;
		state.channelVolumeSlide[0] = 0x02;
		processor.processVolumeSlides();
		expect(state.channelPatternLeft[0]).toBe(0);
		expect(state.channelPatternRight[0]).toBe(13);

		state.instruments = [
			{
				id: '01',
				macros: {
					left: { values: [15], loop: 0 },
					right: { values: [15], loop: 0 },
					amplitudeSlide: { values: [0], loop: 0 }
				}
			}
		];
		state.channelInstruments[0] = 0;
		state.channelSoundEnabled[0] = true;
		state.channelCurrentNotes[0] = 45;
		state.currentTuningTable = toneCodes.map((code) => saaPeriodFromCode(code));
		driver.processInstruments(state, registers);
		expect(registers.channels[0].left).toBe(0);
		expect(registers.channels[0].right).toBe(13);
	});

	it('silences the channel during on/off and brings it back when the counter flips', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		const onOff = EffectAlgorithms.initOnOff(0x12);
		state.channelSoundEnabled = [onOff.enabled];
		state.channelOnOffCounter = [onOff.counter];
		state.channelOnDuration = [onOff.onDuration];
		state.channelOffDuration = [onOff.offDuration];
		const registers = new SaaRegisterState(1);

		driver.processInstruments(state, registers);
		expect(registers.channels[0].tone).toBe(true);
		expect(state.channelSoundEnabled[0]).toBe(false);
		expect(state.channelOnOffCounter[0]).toBe(onOff.offDuration);
		expect(state.instrumentPositions[0]).toBe(1);

		driver.processInstruments(state, registers);
		expect(registers.channels[0].tone).toBe(false);
		expect(registers.channels[0].left).toBe(0);
		expect(registers.channels[0].right).toBe(0);
		expect(state.instrumentPositions[0]).toBe(1);
		expect(state.channelSoundEnabled[0]).toBe(false);

		driver.processInstruments(state, registers);
		expect(state.channelSoundEnabled[0]).toBe(true);
		driver.processInstruments(state, registers);
		expect(registers.channels[0].tone).toBe(true);
		expect(state.instrumentPositions[0]).toBe(2);
	});

	it('renders an audible square on the addressed side', async () => {
		const wasm = readFileSync('public/saa/saasound.wasm');
		const { instance } = await WebAssembly.instantiate(wasm, saaWasmImports());
		const engine = createSaaSoundEngine(instance.exports, SAA_SAM_CLOCK, 44100);
		const registers = new SaaRegisterState(6);
		registers.channels[0] = { tone: true, left: 15, right: 0, octave: 3, freq: 227 };
		engine.apply(registers);
		let left = 0;
		let right = 0;
		let channel = 0;
		let other = 0;
		let peak = 0;
		let scopePeak = 0;
		let exported = 0;
		let exportedOther = 0;
		for (let i = 0; i < 2000; i++) {
			const sample = engine.generate();
			const level = Math.abs(sample.left);
			left += level;
			if (level > peak) peak = level;
			const scope = Math.abs(sample.channels[0]);
			if (scope > scopePeak) scopePeak = scope;
			right += Math.abs(sample.right);
			channel += scope;
			exported += Math.abs(sample.exportChannels[0]);
			for (let index = 1; index < sample.channels.length; index++) {
				other += Math.abs(sample.channels[index]);
				exportedOther += Math.abs(sample.exportChannels[index]);
			}
		}
		const sidePeak = SAA_FULL_SIDE_PEAK * SAA_OUTPUT_GAIN;
		expect(left / 2000).toBeGreaterThan(0.05);
		expect(peak).toBeGreaterThan(sidePeak * 0.9);
		expect(peak).toBeLessThan(sidePeak * 1.05);
		expect(scopePeak).toBeGreaterThan(0.95);
		expect(right).toBe(0);
		expect(channel / 2000).toBeGreaterThan(0.02);
		expect(other).toBe(0);
		expect(exported / 2000).toBeGreaterThan(0.05);
		expect(exportedOther).toBe(0);
	});

	it('plays an envelope on channel C with the square and noise off', async () => {
		const wasm = readFileSync('public/saa/saasound.wasm');
		const { instance } = await WebAssembly.instantiate(wasm, saaWasmImports());
		const engine = createSaaSoundEngine(instance.exports, SAA_SAM_CLOCK, 44100);
		const registers = new SaaRegisterState(6);
		registers.channels[1] = {
			tone: false,
			noise: false,
			left: 0,
			right: 0,
			octave: 5,
			freq: 255
		};
		registers.channels[2] = {
			tone: false,
			noise: false,
			left: 15,
			right: 15,
			octave: 0,
			freq: 0
		};
		registers.envelope0 = 0x96;
		engine.apply(registers);
		let energy = 0;
		for (let i = 0; i < 4000; i++) {
			const sample = engine.generate();
			energy += Math.abs(sample.left) + Math.abs(sample.right);
		}
		expect(energy).toBeGreaterThan(0);
	});

	it('scales six full channels by the output gain', async () => {
		const wasm = readFileSync('public/saa/saasound.wasm');
		const { instance } = await WebAssembly.instantiate(wasm, saaWasmImports());
		const engine = createSaaSoundEngine(instance.exports, SAA_SAM_CLOCK, 44100);
		const registers = new SaaRegisterState(6);
		for (let channel = 0; channel < 6; channel++) {
			registers.channels[channel] = {
				tone: true,
				left: 15,
				right: 15,
				octave: 3,
				freq: 227
			};
		}
		engine.apply(registers);
		let peak = 0;
		for (let i = 0; i < 4000; i++) {
			const sample = engine.generate();
			peak = Math.max(peak, Math.abs(sample.left), Math.abs(sample.right));
		}
		const fullChipPeak = SAA_CHANNEL_COUNT * SAA_FULL_SIDE_PEAK * SAA_OUTPUT_GAIN;
		expect(peak).toBeGreaterThan(fullChipPeak * 0.9);
		expect(peak).toBeLessThanOrEqual(fullChipPeak * 1.02);
	});

	it('keeps the level when tone and noise are off so the envelope can sound', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.channelMuted = [false, false, false];
		state.channelSoundEnabled = [true, true, true];
		state.channelPatternLeft = [15, 15, 15];
		state.channelPatternRight = [15, 15, 15];
		state.channelAmplitudeSliding = [0, 0, 0];
		state.channelInstruments = [0, 0, 0];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes = [45, 45, 45];
		state.instruments[0].macros.tone = { values: [false], loop: 0 };
		state.instruments[0].macros.noise = { values: [false], loop: 0 };
		state.instruments[0].macros.amplitudeSlide = { values: [0], loop: 0 };
		state.envelopeCommand0 = 0x96;
		const registers = new SaaRegisterState(6);
		driver.processInstruments(state, registers);
		expect(registers.channels[2].tone).toBe(false);
		expect(registers.channels[2].noise).toBe(false);
		expect(registers.channels[2].left).toBe(15);
		expect(registers.channels[2].right).toBe(4);
		expect(registers.envelope0).toBe(0x96);
	});

	it('E600 turns the square off and E604 follows the instrument again', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.channelMuted = [false, false, false];
		state.channelSoundEnabled = [true, true, true];
		state.channelPatternLeft = [15, 15, 15];
		state.channelPatternRight = [15, 15, 15];
		state.channelAmplitudeSliding = [0, 0, 0];
		state.channelInstruments = [0, 0, 0];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes = [45, 45, 45];
		state.channelSourceMask = [null, null, null];
		state.instruments[0].macros.tone = { values: [true], loop: 0 };
		state.instruments[0].macros.noise = { values: [false], loop: 0 };
		state.instruments[0].macros.amplitudeSlide = { values: [0], loop: 0 };
		const mixer = (parameter: number) => ({
			channels: [0, 1, 2].map(() => ({
				rows: [
					{
						note: { name: 0, octave: 0 },
						instrument: 0,
						effects: [{ effect: 'E'.charCodeAt(0), delay: 6, parameter }]
					}
				]
			}))
		});
		driver.processPatternRow(state, mixer(0), 0, { env0: 1 });
		expect(state.channelSourceMask[2]).toBe(0);
		const registers = new SaaRegisterState(6);
		driver.processInstruments(state, registers);
		expect(registers.channels[2].tone).toBe(false);
		expect(registers.channels[2].noise).toBe(false);
		expect(registers.channels[2].left).toBe(15);
		expect(registers.envelope0).toBe(0x96);

		state.instrumentPositions = [0, 0, 0];
		driver.processPatternRow(state, mixer(1), 0, {});
		driver.processInstruments(state, registers);
		expect(registers.channels[2].tone).toBe(true);
		expect(registers.channels[2].noise).toBe(false);

		state.instrumentPositions = [0, 0, 0];
		driver.processPatternRow(state, mixer(3), 0, {});
		driver.processInstruments(state, registers);
		expect(registers.channels[2].tone).toBe(true);
		expect(registers.channels[2].noise).toBe(true);

		state.instrumentPositions = [0, 0, 0];
		const noteOn = {
			channels: [0, 1, 2].map(() => ({
				rows: [{ note: { name: 11, octave: 4 }, instrument: 0, effects: [null] }]
			}))
		};
		driver.processPatternRow(state, noteOn, 0, {});
		driver.processInstruments(state, registers);
		expect(registers.channels[2].tone).toBe(true);
		expect(registers.channels[2].noise).toBe(true);

		state.instrumentPositions = [0, 0, 0];
		driver.processPatternRow(state, mixer(4), 0, {});
		expect(state.channelSourceMask[2]).toBeNull();
		driver.processInstruments(state, registers);
		expect(registers.channels[2].tone).toBe(true);
		expect(registers.channels[2].noise).toBe(false);
		expect(describeSaaEffect({ effect: 'E'.charCodeAt(0), delay: 6 })).toContain('1=tone');
		expect(
			saaStickyChannelEffectGroup({ effect: 'E'.charCodeAt(0), delay: 6, parameter: 3 })
		).toBe('saa-mixer');
	});

	it('enables noise from the instrument and keeps the square off when tone is off', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.instruments[0].macros.tone = { values: [false], loop: 0 };
		state.instruments[0].macros.noise = { values: [true], loop: 0 };
		const registers = new SaaRegisterState(1);
		driver.processInstruments(state, registers);
		expect(registers.channels[0].tone).toBe(false);
		expect(registers.channels[0].noise).toBe(true);
		expect(registers.channels[0].left).toBe(15);
	});

	it('restarts the envelope immediately when the instrument step retriggers', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.channelMuted = [false, false, false];
		state.channelSoundEnabled = [true, true, true];
		state.channelPatternLeft = [15, 15, 15];
		state.channelPatternRight = [15, 15, 15];
		state.channelAmplitudeSliding = [0, 0, 0];
		state.channelInstruments = [0, 0, 0];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes = [45, 45, 45];
		state.instruments[0].macros.amplitudeSlide = { values: [0], loop: 0 };
		state.instruments[0].macros.retriggerEnvelope = { values: [true], loop: 0 };
		state.envelopeCommand0 = 0x9a;
		const registers = new SaaRegisterState(6);
		driver.processInstruments(state, registers);
		expect(registers.envelopeRetrigger0).toBe(true);
		expect(registers.envelopeRetrigger1).toBe(false);
		expect(registers.envelope0).toBe(0x9a);
	});

	it('plays the instrument envelope shape and uses the E column when the step is 0', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.channelMuted = [false, false, false];
		state.channelSoundEnabled = [true, true, true];
		state.channelPatternLeft = [15, 15, 15];
		state.channelPatternRight = [15, 15, 15];
		state.channelAmplitudeSliding = [0, 0, 0];
		state.channelInstruments = [0, 0, 0];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes = [45, 45, 45];
		state.instruments[0].macros.amplitudeSlide = { values: [0], loop: 0 };
		state.instruments[0].macros.envelopeShape = { values: [3], loop: 0 };
		state.envelopeCommand0 = 0x96;
		const registers = new SaaRegisterState(6);
		driver.processInstruments(state, registers);
		expect(registers.envelope0).toBe(0x9a);
		expect(registers.envelopeRetrigger0).toBe(false);
		state.instrumentPositions = [0, 0, 0];
		state.instruments[0].macros.envelopeShape = { values: [0], loop: 0 };
		driver.processInstruments(state, registers);
		expect(registers.envelope0).toBe(0x96);
	});

	it('stores each noise clock and leaves a blank column unchanged', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		const registers = new SaaRegisterState(6);
		driver.processPatternRow(state, { channels: [] }, 0, { noise0: -1, noise1: 3 });
		driver.processInstruments(state, registers);
		expect(registers.noise0).toBe(0);
		expect(registers.noise1).toBe(3);
		expect(saaNoiseClockByte(registers.noise0, registers.noise1)).toBe(0x30);
		driver.processPatternRow(state, { channels: [] }, 0, { noise0: 0, noise1: 0 });
		driver.processInstruments(state, registers);
		expect(registers.noise0).toBe(0);
		expect(registers.noise1).toBe(3);
		driver.processPatternRow(state, { channels: [] }, 0, { noise0: 2 });
		driver.processInstruments(state, registers);
		expect(registers.noise0).toBe(2);
		expect(registers.noise1).toBe(3);
	});

	it('writes the envelope shape on C without restarting it, and leaves a blank cell unchanged', () => {
		const driver = new SaaAudioDriver();
		const state = playbackState(45);
		state.channelCurrentNotes = [45, 45, 45, 45, 45, 45];
		state.channelSoundEnabled = [true, true, true, true, true, true];
		state.channelPatternLeft = [15, 15, 15, 15, 15, 15];
		state.channelPatternRight = [15, 15, 15, 15, 15, 15];
		state.channelAmplitudeSliding = [0, 0, 0, 0, 0, 0];
		state.channelInstruments = [0, 0, 0, 0, 0, 0];
		state.instrumentPositions = [0, 0, 0, 0, 0, 0];
		state.envelopeCommand0 = null;
		const pattern = {
			channels: Array.from({ length: 6 }, () => ({
				rows: [{ note: { name: 0, octave: 0 }, instrument: 0 }]
			}))
		};
		const registers = new SaaRegisterState(6);
		driver.processPatternRow(state, pattern, 0, { env0: 3 });
		driver.processInstruments(state, registers);
		expect(state.envelopeCommand0).toBe(0x9a);
		expect(registers.envelopeRetrigger0).toBe(false);
		expect(registers.envelope0).toBe(0x9a);
		driver.processPatternRow(state, pattern, 0, { env0: 0 });
		driver.processInstruments(state, registers);
		expect(state.envelopeCommand0).toBe(0x9a);
		expect(registers.envelopeRetrigger0).toBe(false);
		expect(registers.envelope0).toBe(0x9a);
	});

	it('silences channel C when the enabled envelope shape is off', async () => {
		const wasm = readFileSync('public/saa/saasound.wasm');
		const { instance } = await WebAssembly.instantiate(wasm, saaWasmImports());
		const engine = createSaaSoundEngine(instance.exports, SAA_SAM_CLOCK, 44100);
		const registers = new SaaRegisterState(6);
		registers.channels[2] = {
			tone: true,
			noise: false,
			left: 15,
			right: 0,
			octave: 4,
			freq: 200
		};
		registers.envelope0 = saaEnvelopeControlByte({
			shape: 0,
			enabled: true,
			follow: true,
			coarse: false,
			mirror: false
		});
		engine.apply(registers);
		let level = 0;
		for (let i = 0; i < 500; i++) level += Math.abs(engine.generate().left);
		expect(level).toBe(0);
		registers.envelope0 = saaEnvelopeControlByte({
			shape: 1,
			enabled: true,
			follow: true,
			coarse: false,
			mirror: false
		});
		registers.envelopeRetrigger0 = true;
		engine.apply(registers);
		level = 0;
		for (let i = 0; i < 500; i++) level += Math.abs(engine.generate().left);
		expect(level).toBeGreaterThan(1);
	});

	it('renders noise on the addressed side when the square is off', async () => {
		const wasm = readFileSync('public/saa/saasound.wasm');
		const { instance } = await WebAssembly.instantiate(wasm, saaWasmImports());
		const engine = createSaaSoundEngine(instance.exports, SAA_SAM_CLOCK, 44100);
		const registers = new SaaRegisterState(6);
		registers.channels[0] = {
			tone: false,
			noise: true,
			left: 15,
			right: 0,
			octave: 3,
			freq: 227
		};
		registers.noise0 = 0;
		engine.apply(registers);
		let left = 0;
		let right = 0;
		let other = 0;
		for (let i = 0; i < 2000; i++) {
			const sample = engine.generate();
			left += Math.abs(sample.left);
			right += Math.abs(sample.right);
			for (let index = 1; index < sample.channels.length; index++) {
				other += Math.abs(sample.channels[index]);
			}
		}
		expect(left / 2000).toBeGreaterThan(0.02);
		expect(right).toBe(0);
		expect(other).toBe(0);
	});
});

describe('SAA auto-envelope', () => {
	const toneTable = toneCodes.map((code) => saaPeriodFromCode(code));

	function groupState() {
		const state = playbackState(20);
		state.channelMuted = Array(6).fill(false);
		state.channelSoundEnabled = Array(6).fill(true);
		state.channelPatternLeft = Array(6).fill(15);
		state.channelPatternRight = Array(6).fill(15);
		state.channelAmplitudeSliding = Array(6).fill(0);
		state.channelInstruments = Array(6).fill(0);
		state.instrumentPositions = Array(6).fill(0);
		state.channelBaseNotes = [12, 20, 40, 8, 16, 48];
		state.channelCurrentNotes = state.channelBaseNotes.slice();
		state.currentTuningTable = toneTable;
		state.instruments[0].macros.tone = { values: [true], loop: 0 };
		state.instruments[0].macros.noise = { values: [false], loop: 0 };
		state.instruments[0].macros.amplitudeSlide = { values: [0], loop: 0 };
		return state;
	}

	function autoEnvelopePattern(channelCount: number, channelIndex: number, parameter: number) {
		return {
			channels: Array.from({ length: channelCount }, (_, index) => ({
				rows: [
					{
						note: { name: 0, octave: 0 },
						instrument: 0,
						effects:
							index === channelIndex
								? [{ effect: 'E'.charCodeAt(0), delay: 0x0a, parameter }]
								: [null]
					}
				]
			}))
		};
	}

	it('writes the ratio onto the clock channel from whichever channel holds EA', () => {
		const driver = new SaaAudioDriver();
		const state = groupState();
		const registers = new SaaRegisterState(6);

		driver.processPatternRow(state, autoEnvelopePattern(6, 2, 0x11), 0, { env0: 4 });
		driver.processInstruments(state, registers);

		const clock = saaPitchCode(toneTable[40], 0);
		expect(toneCode(registers.channels[1])).toBe(clock);
		expect(registers.channels[1].tone).toBe(false);
		expect(registers.channels[1].noise).toBe(false);
		expect(toneCode(registers.channels[2])).toBe(toneCodes[40]);
		expect(registers.channels[2].tone).toBe(true);
		expect(state.autoEnvelopeSource[0]).toBe(2);

		state.instrumentPositions = Array(6).fill(0);
		driver.processPatternRow(state, autoEnvelopePattern(6, 0, 0x32), 0, { env0: 4 });
		driver.processInstruments(state, registers);
		expect(toneCode(registers.channels[1])).toBe(
			saaPitchCode(Math.round((toneTable[12] * 3) / 2), 0)
		);
		expect(state.autoEnvelopeSource[0]).toBe(0);
	});

	it('clocks the second group from its own EA and leaves the first clock alone', () => {
		const driver = new SaaAudioDriver();
		const state = groupState();
		const registers = new SaaRegisterState(6);

		driver.processPatternRow(state, autoEnvelopePattern(6, 5, 0x11), 0, { env1: 6 });
		driver.processInstruments(state, registers);

		expect(toneCode(registers.channels[4])).toBe(saaPitchCode(toneTable[48], 0));
		expect(registers.channels[4].tone).toBe(false);
		expect(toneCode(registers.channels[1])).toBe(toneCodes[20]);
		expect(registers.channels[1].tone).toBe(true);
	});

	it('EA00 stops replacing the clock channel', () => {
		const driver = new SaaAudioDriver();
		const state = groupState();
		const registers = new SaaRegisterState(6);

		driver.processPatternRow(state, autoEnvelopePattern(6, 2, 0x11), 0, { env0: 4 });
		driver.processPatternRow(state, autoEnvelopePattern(6, 2, 0), 0, { env0: 4 });
		driver.processInstruments(state, registers);

		expect(state.autoEnvelopeActive[0]).toBe(false);
		expect(toneCode(registers.channels[1])).toBe(toneCodes[20]);
		expect(registers.channels[1].tone).toBe(true);
	});

	it('names EAXY in the status hint and clears the ratio on reset', () => {
		expect(describeSaaEffect({ effect: 'E'.charCodeAt(0), delay: 0x0a })).toContain('X:Y');
		const state = new SaaState();
		state.autoEnvelopeActive = [true, false];
		state.autoEnvelopeNumerator = [3, 0];
		state.autoEnvelopeDenominator = [2, 0];
		state.autoEnvelopeSource = [2, -1];
		state.reset();
		expect(state.autoEnvelopeActive).toEqual([false, false]);
		expect(state.autoEnvelopeSource).toEqual([-1, -1]);
	});
});
