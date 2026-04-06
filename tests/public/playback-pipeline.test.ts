import { describe, it, expect, vi } from 'vitest';
import AyumiState from '../../public/ayumi-state.js';
import AYAudioDriver from '../../public/ay-audio-driver.js';
import AYChipRegisterState from '../../public/ay-chip-register-state.js';
import TrackerPatternProcessor from '../../public/tracker-pattern-processor.js';

function runOneTick(
	state: AyumiState,
	pattern: { channels: unknown[]; patternRows: { noiseValue: null }[]; length: number },
	processor: TrackerPatternProcessor,
	driver: AYAudioDriver,
	registerState: AYChipRegisterState
) {
	if (state.currentTick === 0) {
		processor.parsePatternRow(pattern, state.currentRow, registerState);
		processor.processSpeedTable();
	}
	processor.processTables();
	processor.processEffectTables();
	processor.processArpeggio();
	driver.processInstruments(state, registerState);
	processor.processVibrato();
	processor.processSlides();
	state.advancePosition();
}

describe('playback pipeline', () => {
	it('processPatternRow then processInstruments: note + instrument 01 yields correct register state', () => {
		const state = new AyumiState();
		state.setTuningTable([1000, 900, 800]);
		state.setInstruments([
			{
				id: '01',
				rows: [{ tone: true, volume: 15, noise: false, envelope: false }],
				loop: 0
			}
		]);
		state.channelInstruments = [0, -1, -1];
		state.channelSoundEnabled = [false, false, false];
		state.channelMuted = [false, false, false];
		state.channelEnvelopeEnabled = [false, false, false];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes[0] = 0;
		state.channelCurrentNotes[1] = 0;
		state.channelCurrentNotes[2] = 0;
		state.channelPatternVolumes = [15, 15, 15];
		state.envelopeEffectTable = -1;
		state.channelToneAccumulator = [0, 0, 0];
		state.channelNoiseAccumulator = [0, 0, 0];
		state.channelEnvelopeAccumulator = [0, 0, 0];
		state.channelAmplitudeSliding = [0, 0, 0];
		state.channelSlideStep = [0, 0, 0];
		state.channelPortamentoActive = [false, false, false];
		state.channelVibratoSliding = [0, 0, 0];

		const registerState = new AYChipRegisterState();
		const driver = new AYAudioDriver();

		const pattern = {
			channels: [
				{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] },
				{ rows: [{ note: { name: 0, octave: 0 }, effects: [null] }] },
				{ rows: [{ note: { name: 0, octave: 0 }, effects: [null] }] }
			]
		};
		const patternRow = { noiseValue: null };

		driver.processPatternRow(state, pattern, 0, patternRow, registerState);
		driver.processInstruments(state, registerState);

		expect(state.channelSoundEnabled[0]).toBe(true);
		expect(state.channelCurrentNotes[0]).toBe(0);
		expect(registerState.channels[0].volume).toBe(15);
		expect(registerState.channels[0].mixer.tone).toBe(true);
		expect(registerState.channels[0].mixer.noise).toBe(false);
		expect(registerState.channels[1].volume).toBe(0);
		expect(registerState.channels[1].mixer.tone).toBe(false);
	});

	it('note off then processInstruments: channel stays silent', () => {
		const state = new AyumiState();
		state.setTuningTable([1000]);
		state.setInstruments([
			{ id: '01', rows: [{ tone: true, volume: 15, noise: false, envelope: false }], loop: 0 }
		]);
		state.channelInstruments = [0, -1, -1];
		state.channelSoundEnabled = [true, false, false];
		state.channelMuted = [false, false, false];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes = [0, 0, 0];
		state.channelPatternVolumes = [15, 15, 15];
		state.envelopeEffectTable = -1;

		const registerState = new AYChipRegisterState();
		registerState.channels[0].tone = 1000;
		registerState.channels[0].volume = 15;
		const driver = new AYAudioDriver();

		const pattern = {
			channels: [
				{ rows: [{ note: { name: 1, octave: 0 }, effects: [null] }] },
				{ rows: [{ note: { name: 0, octave: 0 }, effects: [null] }] },
				{ rows: [{ note: { name: 0, octave: 0 }, effects: [null] }] }
			]
		};
		driver.processPatternRow(state, pattern, 0, { noiseValue: null }, registerState);
		driver.processInstruments(state, registerState);

		expect(state.channelSoundEnabled[0]).toBe(false);
		expect(registerState.channels[0].volume).toBe(0);
		expect(registerState.channels[0].mixer.tone).toBe(false);
	});

	it('muted channel: processPatternRow and processInstruments keep volume 0 and mixer off', () => {
		const state = new AyumiState();
		state.setTuningTable([1000]);
		state.setInstruments([
			{ id: '01', rows: [{ tone: true, volume: 15, noise: false, envelope: false }], loop: 0 }
		]);
		state.channelInstruments = [0, 0, 0];
		state.channelSoundEnabled = [true, true, true];
		state.channelMuted = [false, true, false];
		state.instrumentPositions = [0, 0, 0];
		state.channelCurrentNotes = [0, 0, 0];
		state.channelPatternVolumes = [15, 15, 15];
		state.envelopeEffectTable = -1;

		const registerState = new AYChipRegisterState();
		const driver = new AYAudioDriver();
		const pattern = {
			channels: [
				{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] },
				{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] },
				{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] }
			]
		};
		driver.processPatternRow(state, pattern, 0, { noiseValue: null }, registerState);
		driver.processInstruments(state, registerState);

		expect(registerState.channels[0].volume).toBeGreaterThan(0);
		expect(registerState.channels[0].mixer.tone).toBe(true);
		expect(registerState.channels[1].volume).toBe(0);
		expect(registerState.channels[1].mixer.tone).toBe(false);
		expect(registerState.channels[2].volume).toBeGreaterThan(0);
	});

	describe('multi-tick simulation', () => {
		function makePattern(rows: { note: { name: number; octave: number }; effects: unknown[] }[][]) {
			const rowCount = rows.length;
			const channels = [
				{ rows: rows.map((r) => r[0] ?? { note: { name: 0, octave: 0 }, effects: [null] }) },
				{ rows: rows.map((r) => r[1] ?? { note: { name: 0, octave: 0 }, effects: [null] }) },
				{ rows: rows.map((r) => r[2] ?? { note: { name: 0, octave: 0 }, effects: [null] }) }
			];
			return {
				channels,
				patternRows: Array(rowCount)
					.fill(null)
					.map(() => ({ noiseValue: null })),
				length: rowCount
			};
		}

		it('advancePosition + processTables + parsePatternRow + processInstruments over several ticks', () => {
			const state = new AyumiState();
			state.setTuningTable([1000, 900, 800]);
			state.setInstruments([
				{
					id: '01',
					rows: [{ tone: true, volume: 15, noise: false, envelope: false }],
					loop: 0
				}
			]);
			state.setPatternOrder([0]);
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelEnvelopeEnabled = [false, false, false];
			state.currentSpeed = 2;
			state.currentTick = 0;
			state.currentRow = 0;
			state.channelPatternVolumes = [15, 15, 15];
			state.envelopeEffectTable = -1;
			state.channelToneAccumulator = [0, 0, 0];
			state.channelNoiseAccumulator = [0, 0, 0];
			state.channelEnvelopeAccumulator = [0, 0, 0];
			state.channelAmplitudeSliding = [0, 0, 0];
			state.channelSlideStep = [0, 0, 0];
			state.channelPortamentoActive = [false, false, false];
			state.channelVibratoSliding = [0, 0, 0];

			const pattern = makePattern([
				[
					{ note: { name: 2, octave: 1 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				],
				[
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				],
				[
					{ note: { name: 3, octave: 1 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				]
			]);
			state.setPattern(pattern, 0);

			const registerState = new AYChipRegisterState();
			const driver = new AYAudioDriver();
			const port = { postMessage: vi.fn() };
			const processor = new TrackerPatternProcessor(state, driver, port);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(0);
			expect(state.currentTick).toBe(1);
			expect(state.channelSoundEnabled[0]).toBe(true);
			expect(registerState.channels[0].volume).toBeGreaterThan(0);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(1);
			expect(state.currentTick).toBe(0);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(1);
			expect(state.currentTick).toBe(1);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(2);
			expect(state.currentTick).toBe(0);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(2);
			expect(state.currentTick).toBe(1);
			expect(state.channelSoundEnabled[0]).toBe(true);
			expect(state.channelBaseNotes[0]).toBe(1);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(0);
			expect(state.currentTick).toBe(0);
			expect(state.currentPatternOrderIndex).toBe(0);
		});

		it('tick loop wraps to next order when advancing past last row', () => {
			const state = new AyumiState();
			state.setTuningTable([1000]);
			state.setInstruments([
				{ id: '01', rows: [{ tone: true, volume: 15, noise: false, envelope: false }], loop: 0 }
			]);
			state.setPatternOrder([0, 1]);
			state.currentSpeed = 1;
			state.currentTick = 0;
			state.currentRow = 0;
			state.channelInstruments = [-1, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelPatternVolumes = [15, 15, 15];
			state.envelopeEffectTable = -1;

			const pattern = makePattern([
				[
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				],
				[
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				]
			]);
			state.setPattern(pattern, 0);

			const registerState = new AYChipRegisterState();
			const driver = new AYAudioDriver();
			const processor = new TrackerPatternProcessor(state, driver, { postMessage: vi.fn() });

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(1);
			expect(state.currentTick).toBe(0);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(0);
			expect(state.currentPatternOrderIndex).toBe(1);
		});

		it('tick loop wraps to loop marker at song end', () => {
			const state = new AyumiState();
			state.setTuningTable([1000]);
			state.setInstruments([
				{ id: '01', rows: [{ tone: true, volume: 15, noise: false, envelope: false }], loop: 0 }
			]);
			state.setPatternOrder([0, 1, 2], 1);
			state.currentSpeed = 1;
			state.currentTick = 0;
			state.currentRow = 0;
			state.channelInstruments = [-1, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelPatternVolumes = [15, 15, 15];
			state.envelopeEffectTable = -1;

			const pattern = makePattern([
				[
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				],
				[
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] },
					{ note: { name: 0, octave: 0 }, effects: [null] }
				]
			]);
			state.setPattern(pattern, 2);

			const registerState = new AYChipRegisterState();
			const driver = new AYAudioDriver();
			const processor = new TrackerPatternProcessor(state, driver, { postMessage: vi.fn() });

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(1);
			expect(state.currentTick).toBe(0);

			runOneTick(state, pattern, processor, driver, registerState);
			expect(state.currentRow).toBe(0);
			expect(state.currentPatternOrderIndex).toBe(1);
		});
	});
});
