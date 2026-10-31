import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAA_SAM_CLOCK, resolveSaaTuningTable, saaToneFrequency } from '@/lib/chips/saa/schema';
import SaaAudioDriver from '../../../../public/saa/saa-audio-driver.js';
import SaaRegisterState from '../../../../public/saa/saa-register-state.js';
import SaaState from '../../../../public/saa/saa-state.js';
import TrackerPatternProcessor from '../../../../public/tracker/tracker-pattern-processor.js';
import { createSaaSoundEngine } from '../../../../public/saa/saa-engine.js';
import { saaWasmImports } from '../../../../public/saa/saa-wasm-imports.js';
import { saaNoiseClockByte, saaPeriodFromCode, saaPitchCode } from '../../../../public/saa/saa-levels.js';
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
		const baseHz = saaToneFrequency(
			SAA_SAM_CLOCK,
			toneCodes[45] >> 8,
			toneCodes[45] & 0xff
		);
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
		for (let i = 0; i < 2000; i++) {
			const sample = engine.generate();
			const level = Math.abs(sample.left);
			left += level;
			if (level > peak) peak = level;
			const scope = Math.abs(sample.channels[0]);
			if (scope > scopePeak) scopePeak = scope;
			right += Math.abs(sample.right);
			channel += scope;
			for (let index = 1; index < sample.channels.length; index++) {
				other += Math.abs(sample.channels[index]);
			}
		}
		expect(left / 2000).toBeGreaterThan(0.05);
		expect(peak).toBeGreaterThan(0.15);
		expect(peak).toBeLessThan(0.2);
		expect(scopePeak).toBeGreaterThan(0.95);
		expect(right).toBe(0);
		expect(channel / 2000).toBeGreaterThan(0.02);
		expect(other).toBe(0);
	});

	it('keeps six full channels inside the mix', async () => {
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
		expect(peak).toBeGreaterThan(0.9);
		expect(peak).toBeLessThanOrEqual(1);
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

	it('renders noise on the addressed side when the square is off', async () => {
		const wasm = readFileSync('public/saa/saasound.wasm');
		const { instance } = await WebAssembly.instantiate(wasm, saaWasmImports());
		const engine = createSaaSoundEngine(instance.exports, SAA_SAM_CLOCK, 44100);
		const registers = new SaaRegisterState(6);
		registers.channels[0] = { tone: false, noise: true, left: 15, right: 0, octave: 3, freq: 227 };
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
