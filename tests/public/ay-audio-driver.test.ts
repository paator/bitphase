import { describe, it, expect, beforeEach } from 'vitest';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AyumiState from '../../public/ay/ayumi-state.js';
import EffectAlgorithms from '../../public/tracker/effect-algorithms.js';

describe('AYAudioDriver', () => {
	describe('constructor', () => {
		it('initializes channelMixerState with all generators off', () => {
			const driver = new AYAudioDriver();
			expect(driver.channelMixerState).toHaveLength(3);
			for (let i = 0; i < 3; i++) {
				expect(driver.channelMixerState[i].tone).toBe(false);
				expect(driver.channelMixerState[i].noise).toBe(false);
				expect(driver.channelMixerState[i].envelope).toBe(false);
			}
		});
	});

	describe('calculateVolume', () => {
		let driver: InstanceType<typeof AYAudioDriver>;

		beforeEach(() => {
			driver = new AYAudioDriver();
		});

		it('returns 0 when channelMuted is true', () => {
			expect(
				driver.calculateVolume(15, 15, 0, false, false, true, false)
			).toBe(0);
		});

		it('clamps instrumentVolume + amplitudeSliding to 0-15', () => {
			const v = driver.calculateVolume(15, 20, 0, false, false, false, false);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(15);
		});

		it('uses PT3 volume table: patternVolume 15 and vol 15 gives max', () => {
			const v = driver.calculateVolume(15, 15, 0, false, false, false, false);
			expect(v).toBe(15);
		});

		it('patternVolume 0 and vol 0 gives 0', () => {
			const v = driver.calculateVolume(0, 0, 0, false, false, false, false);
			expect(v).toBe(0);
		});

		it('when envelope enabled and not disabled by on/off, sets bit 16', () => {
			const vNoEnv = driver.calculateVolume(15, 15, 0, false, false, false, false);
			const vEnv = driver.calculateVolume(15, 15, 0, true, true, false, false);
			expect(vEnv).toBe(vNoEnv | 16);
		});

		it('envelopeDisabledByOnOff prevents envelope bit', () => {
			const v = driver.calculateVolume(15, 15, 0, true, true, false, true);
			expect(v & 16).toBe(0);
		});
	});

	describe('resetInstrumentAccumulators', () => {
		it('zeros tone, noise, envelope accumulators and amplitude sliding for channel', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelToneAccumulator: [0, 100, 0],
				channelNoiseAccumulator: [0, 50, 0],
				channelEnvelopeAccumulator: [0, 200, 0],
				channelAmplitudeSliding: [0, 5, 0],
				channelSlideStep: [0, 0, 0],
				channelPortamentoActive: [false, false, false],
				channelToneSliding: [0, 10, 0],
				channelVibratoSliding: [0, 3, 0]
			};
			driver.resetInstrumentAccumulators(state, 1);
			expect(state.channelToneAccumulator[1]).toBe(0);
			expect(state.channelNoiseAccumulator[1]).toBe(0);
			expect(state.channelEnvelopeAccumulator[1]).toBe(0);
			expect(state.channelAmplitudeSliding[1]).toBe(0);
			expect(state.channelToneSliding[1]).toBe(0);
			expect(state.channelVibratoSliding[1]).toBe(0);
		});

		it('does not zero tone sliding when slide or portamento is active', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [1],
				channelPortamentoActive: [false],
				channelToneSliding: [100],
				channelVibratoSliding: [0]
			};
			driver.resetInstrumentAccumulators(state, 0);
			expect(state.channelToneSliding[0]).toBe(100);
		});

		it('does not reset timer effect phase when slide or portamento is active', () => {
			const driver = new AYAudioDriver();
			const stateWithSlide = {
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [5],
				channelPortamentoActive: [false],
				channelToneSliding: [0],
				channelVibratoSliding: [0],
				channelTimerEffectReset: [false]
			};
			driver.resetInstrumentAccumulators(stateWithSlide, 0);
			expect(stateWithSlide.channelTimerEffectReset[0]).toBe(false);

			const stateWithPortamento = {
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelPortamentoActive: [true],
				channelToneSliding: [0],
				channelVibratoSliding: [0],
				channelTimerEffectReset: [false]
			};
			driver.resetInstrumentAccumulators(stateWithPortamento, 0);
			expect(stateWithPortamento.channelTimerEffectReset[0]).toBe(false);
		});

		it('resets timer effect phase on a normal new note', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelPortamentoActive: [false],
				channelToneSliding: [0],
				channelVibratoSliding: [0],
				channelTimerEffectReset: [false]
			};
			driver.resetInstrumentAccumulators(state, 0);
			expect(state.channelTimerEffectReset[0]).toBe(true);
		});

		it('preserves timer pwm sweep when requested', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelTimerPwmSweep: [25],
				channelSlideStep: [0],
				channelPortamentoActive: [false],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			driver.resetInstrumentAccumulators(state, 0, { preserveTimerPwmSweep: true });
			expect(state.channelTimerPwmSweep[0]).toBe(25);
		});

		it('does not reset timer pwm sweep on new note with portamento command', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instrumentIdToIndex: new Map([[1, 0]]),
				instruments: [{ rows: [{ tone: true, volume: 15 }] }],
				instrumentPositions: [0],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 + i),
				channelTimerPwmSweep: [30],
				channelPortamentoActive: [true],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 0,
				effects: [{ effect: EffectAlgorithms.PORTAMENTO, delay: 1, parameter: 5 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelTimerPwmSweep[0]).toBe(30);
		});

		it('does not retrigger sample playback on new note with portamento command', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instruments: [
					{
						sampleData: [0, 64, 128, 192],
						sampleStart: 0,
						sampleEnd: 3,
						sampleLoopStart: 0
					}
				],
				instrumentPositions: [2],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 - i),
				channelSamplePositions: [2],
				channelSamplePhase: [0.5],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 0,
				effects: [{ effect: EffectAlgorithms.PORTAMENTO, delay: 1, parameter: 5 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelSamplePositions[0]).toBe(2);
			expect(state.channelSamplePhase[0]).toBe(0.5);
			expect(state.instrumentPositions[0]).toBe(2);
		});

		it('does not retrigger sample playback while portamento is active', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instruments: [
					{
						sampleData: [0, 64, 128, 192],
						sampleStart: 0,
						sampleEnd: 3,
						sampleLoopStart: 0
					}
				],
				instrumentPositions: [1],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 - i),
				channelSamplePositions: [3],
				channelSamplePhase: [0.25],
				channelPortamentoActive: [true],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [1],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 6, octave: 2 },
				instrument: 0,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelSamplePositions[0]).toBe(3);
			expect(state.channelSamplePhase[0]).toBe(0.25);
			expect(state.instrumentPositions[0]).toBe(1);
		});

		it('restarts sample playback on a normal new note', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instruments: [
					{
						sampleData: [0, 64, 128, 192],
						sampleStart: 1,
						sampleEnd: 3,
						sampleLoopStart: 1
					}
				],
				instrumentPositions: [2],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 - i),
				channelSamplePositions: [3],
				channelSamplePhase: [0.25],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 0,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelSamplePositions[0]).toBe(1);
			expect(state.channelSamplePhase[0]).toBe(0);
			expect(state.instrumentPositions[0]).toBe(0);
		});

		it('resets timer pwm sweep phase on new note without portamento', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [-1],
				instrumentPositions: [0],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 + i),
				channelTimerPwmSweep: [30],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 0,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelTimerPwmSweep[0]).toBe(-1);
		});

		it('preserves timer pwm sweep on new note when instrument requests it', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instrumentIdToIndex: new Map([[1, 0]]),
				instruments: [
					{
						rows: [{ tone: true, volume: 15 }],
						timerRows: [{ sid: true, timerWaveform: [15, 0] }],
						timerPwmPreserveOnNewNote: true
					}
				],
				instrumentPositions: [0],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 + i),
				channelTimerPwmSweep: [30],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 0,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelTimerPwmSweep[0]).toBe(30);
		});

		it('preserves timer pwm sweep on new note with new instrument when instrument requests it', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instrumentIdToIndex: new Map([
					[1, 0],
					[2, 1]
				]),
				instruments: [
					{
						rows: [{ tone: true, volume: 15 }],
						timerRows: [{ sid: true, timerWaveform: [15, 0] }]
					},
					{
						rows: [{ tone: true, volume: 15 }],
						timerRows: [{ sid: true, timerWaveform: [15, 0] }],
						timerPwmPreserveOnNewNote: true
					}
				],
				instrumentPositions: [0],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 + i),
				channelTimerPwmSweep: [30],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 2,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelTimerPwmSweep[0]).toBe(30);
		});

		it('preserves timer pwm sweep on note off when instrument requests it', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instruments: [
					{
						rows: [{ tone: true, volume: 15 }],
						timerRows: [{ sid: true, timerWaveform: [15, 0] }],
						timerPwmPreserveOnNewNote: true
					}
				],
				instrumentPositions: [0],
				channelTimerPwmSweep: [30],
				channelTimerEffectReset: [false],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 1000 }]
			};
			const row = {
				note: { name: 1, octave: 0 },
				instrument: 0,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelTimerPwmSweep[0]).toBe(30);
			expect(state.channelTimerEffectReset[0]).toBe(false);
		});

		it('preserves timer pwm sweep across note off followed by new note', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instruments: [
					{
						rows: [{ tone: true, volume: 15 }],
						timerRows: [{ sid: true, timerWaveform: [15, 0] }],
						timerPwmPreserveOnNewNote: true
					}
				],
				instrumentPositions: [0],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 + i),
				channelTimerPwmSweep: [30],
				channelTimerEffectReset: [false],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 1000 }]
			};

			driver._processNote(
				state,
				0,
				{ note: { name: 1, octave: 0 }, instrument: 0, effects: [{ effect: 0, delay: 0, parameter: 0 }] },
				registerState
			);
			expect(state.channelTimerPwmSweep[0]).toBe(30);

			driver._processNote(
				state,
				0,
				{ note: { name: 5, octave: 2 }, instrument: 0, effects: [{ effect: 0, delay: 0, parameter: 0 }] },
				registerState
			);
			expect(state.channelTimerPwmSweep[0]).toBe(30);
			expect(state.channelTimerEffectReset[0]).toBe(false);
		});

		it('does not set timer effect reset when pwm sweep is preserved on new note', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelSoundEnabled: [true],
				channelInstruments: [0],
				instrumentIdToIndex: new Map([[1, 0]]),
				instruments: [
					{
						rows: [{ tone: true, volume: 15 }],
						timerRows: [{ sid: true, timerWaveform: [15, 0] }],
						timerPwmPreserveOnNewNote: true
					}
				],
				instrumentPositions: [0],
				currentTuningTable: Array.from({ length: 96 }, (_, i) => 1000 + i),
				channelTimerPwmSweep: [30],
				channelTimerEffectReset: [false],
				channelPortamentoActive: [false],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelToneSliding: [0],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0 }]
			};
			const row = {
				note: { name: 5, octave: 2 },
				instrument: 0,
				effects: [{ effect: 0, delay: 0, parameter: 0 }]
			};

			driver._processNote(state, 0, row, registerState);

			expect(state.channelTimerEffectReset[0]).toBe(false);
		});
	});

	describe('processPatternRow', () => {
		it('muted channel gets volume 0 and mixer all false', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false, true, false],
				channelSoundEnabled: [true, true, true],
				noiseBaseValue: 0,
				noisePreviousValue: 0,
				noiseAddValue: 0,
				envelopeAddValue: 0,
				channelEnvelopeEnabled: [false, true, false],
				currentTuningTable: [1000, 900],
				channelInstruments: [-1, -1, -1],
				channelToneAccumulator: [0, 0, 0],
				channelNoiseAccumulator: [0, 0, 0],
				channelEnvelopeAccumulator: [0, 0, 0],
				channelAmplitudeSliding: [0, 0, 0],
				channelSlideStep: [0, 0, 0],
				channelPortamentoActive: [false, false, false],
				channelVibratoSliding: [0, 0, 0],
				instrumentPositions: [0, 0, 0]
			};
			const registerState = {
				channels: [
					{ tone: 0, volume: 15, mixer: { tone: true, noise: true, envelope: false } },
					{ tone: 0, volume: 15, mixer: { tone: true, noise: true, envelope: false } },
					{ tone: 0, volume: 15, mixer: { tone: true, noise: true, envelope: false } }
				]
			};
			const pattern = {
				channels: [
					{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] },
					{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] },
					{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] }
				]
			};
			const patternRow = { noiseValue: null };
			driver.processPatternRow(state, pattern, 0, patternRow, registerState);
			expect(registerState.channels[1].volume).toBe(0);
			expect(registerState.channels[1].mixer.tone).toBe(false);
			expect(registerState.channels[1].mixer.noise).toBe(false);
			expect(registerState.channels[1].mixer.envelope).toBe(false);
			expect(state.channelEnvelopeEnabled[1]).toBe(false);
		});

		it('note off (name 1) sets channelSoundEnabled false and tone 0', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false, false, false],
				channelSoundEnabled: [true, true, true],
				noiseBaseValue: 0,
				noisePreviousValue: 0,
				noiseAddValue: 0,
				envelopeAddValue: 0,
				channelEnvelopeEnabled: [false, false, false],
				channelInstruments: [-1, -1, -1],
				currentTuningTable: [1000, 900],
				instrumentPositions: [0, 0, 0],
				channelToneAccumulator: [0, 0, 0],
				channelNoiseAccumulator: [0, 0, 0],
				channelEnvelopeAccumulator: [0, 0, 0],
				channelAmplitudeSliding: [0, 0, 0],
				channelSlideStep: [0, 0, 0],
				channelPortamentoActive: [false, false, false],
				channelVibratoSliding: [0, 0, 0]
			};
			const registerState = {
				channels: [
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } },
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } },
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } }
				]
			};
			const pattern = {
				channels: [
					{ rows: [{ note: { name: 1, octave: 0 }, effects: [null] }] },
					{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] },
					{ rows: [{ note: { name: 2, octave: 1 }, effects: [null] }] }
				]
			};
			const patternRow = { noiseValue: null };
			driver.processPatternRow(state, pattern, 0, patternRow, registerState);
			expect(state.channelSoundEnabled[0]).toBe(false);
			expect(registerState.channels[0].tone).toBe(0);
		});

		it('noiseValue -1 resets noiseBaseValue and noisePreviousValue to 0', () => {
			const driver = new AYAudioDriver();
			const state = {
				channelMuted: [false],
				channelInstruments: [-1],
				currentTuningTable: [1000],
				noiseBaseValue: 5,
				noisePreviousValue: 5,
				noiseAddValue: 1,
				envelopeAddValue: 1,
				channelEnvelopeEnabled: [false],
				channelSoundEnabled: [false],
				instrumentPositions: [0],
				channelToneAccumulator: [0],
				channelNoiseAccumulator: [0],
				channelEnvelopeAccumulator: [0],
				channelAmplitudeSliding: [0],
				channelSlideStep: [0],
				channelPortamentoActive: [false],
				channelVibratoSliding: [0]
			};
			const registerState = {
				channels: [{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }]
			};
			const pattern = {
				channels: [{ rows: [{ note: { name: 0, octave: 0 }, effects: [null] }] }]
			};
			driver.processPatternRow(state, pattern, 0, { noiseValue: -1 }, registerState);
			expect(state.noiseBaseValue).toBe(0);
			expect(state.noisePreviousValue).toBe(0);
			expect(state.noiseAddValue).toBe(0);
			expect(state.envelopeAddValue).toBe(0);
		});
	});

	describe('processInstruments', () => {
		it('channel with instrumentIndex -1 gets volume 0 and mixer all false', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.channelInstruments = [-1, 0, -1];
			state.channelOnOffCounter = [0, 0, 0];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, true, true];
			state.setInstruments([
				{ id: '01', rows: [{ tone: true, volume: 15, noise: false, envelope: false }], loop: 0 }
			]);
			state.setTuningTable([1000, 900]);
			state.channelCurrentNotes = [0, 1, 0];
			state.instrumentPositions = [0, 0, 0];
			state.envelopeEffectTable = -1;
			const registerState = {
				channels: [
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } },
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } },
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};
			driver.processInstruments(state, registerState);
			expect(registerState.channels[0].volume).toBe(0);
			expect(registerState.channels[0].mixer.tone).toBe(false);
			expect(registerState.channels[0].mixer.noise).toBe(false);
			expect(registerState.channels[0].mixer.envelope).toBe(false);
			expect(registerState.channels[2].volume).toBe(0);
		});

		it('muted channel gets volume 0 in processInstruments', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.channelInstruments = [0, 0, 0];
			state.channelOnOffCounter = [0, 0, 0];
			state.channelMuted = [false, true, false];
			state.channelSoundEnabled = [true, true, true];
			state.setInstruments([
				{
					id: '01',
					rows: [{ tone: true, volume: 15, noise: false, envelope: false }],
					loop: 0
				}
			]);
			state.setTuningTable([1000, 900]);
			state.channelCurrentNotes = [0, 0, 0];
			state.instrumentPositions = [0, 0, 0];
			state.envelopeEffectTable = -1;
			const registerState = {
				channels: [
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } },
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } },
					{ tone: 100, volume: 10, mixer: { tone: true, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};
			driver.processInstruments(state, registerState);
			expect(registerState.channels[1].volume).toBe(0);
		});

		it('channel with valid instrument and sound enabled writes volume and mixer from instrument row', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.setTuningTable([600, 700, 800]);
			state.setInstruments([
				{
					id: '01',
					rows: [{ tone: true, volume: 12, noise: false, envelope: false }],
					loop: 0
				}
			]);
			state.channelInstruments[0] = 0;
			state.channelInstruments[1] = -1;
			state.channelInstruments[2] = -1;
			state.channelSoundEnabled[0] = true;
			state.channelCurrentNotes[0] = 0;
			state.instrumentPositions[0] = 0;
			state.envelopeEffectTable = -1;
			const registerState = {
				channels: [
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};
			driver.processInstruments(state, registerState);
			expect(registerState.channels[0].volume).toBe(12);
			expect(registerState.channels[0].mixer.tone).toBe(true);
			expect(registerState.channels[0].mixer.noise).toBe(false);
			expect(registerState.channels[1].volume).toBe(0);
			expect(registerState.channels[1].mixer.tone).toBe(false);
		});

		it('instrument with empty rows uses default row (tone on, volume 15)', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.channelInstruments = [0, -1, -1];
			state.channelOnOffCounter = [0, 0, 0];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.setInstruments([{ id: '01', rows: [], loop: 0, name: 'I01' }]);
			state.setTuningTable([500]);
			state.channelCurrentNotes = [0, 0, 0];
			state.instrumentPositions = [0, 0, 0];
			state.envelopeEffectTable = -1;
			const registerState = {
				channels: [
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};
			driver.processInstruments(state, registerState);
			expect(registerState.channels[0].tone).toBe(500);
			expect(registerState.channels[0].volume).toBe(15);
			expect(registerState.channels[0].mixer.tone).toBe(true);
			expect(registerState.channels[0].mixer.noise).toBe(false);
		});
	});

	describe('syncbuzzer envelope shape ownership', () => {
		function createSyncbuzzerInstrument(timerWaveform: number[]) {
			return {
				id: '01',
				rows: [{ tone: true, volume: 15, noise: false, envelope: true }],
				loop: 0,
				timerRows: [{ syncbuzzer: true, timerWaveform }]
			};
		}

		it('does not write pattern envelope shape to R13 when syncbuzzer is active', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.setInstruments([createSyncbuzzerInstrument([9, 13])]);
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelEnvelopeEnabled = [false, false, false];
			state.instrumentPositions = [0, 0, 0];
			state.channelTimerPositions = [0, 0, 0];
			state.envelopeOnOffCounter = 0;

			const registerState = {
				channels: [
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};

			driver._processEnvelope(
				state,
				0,
				{ envelopeShape: 12 },
				{ envelopeValue: null },
				registerState
			);

			expect(registerState.envelopeShape).toBe(0);
			expect(registerState.forceEnvelopeShapeWrite).toBe(false);
			expect(state.channelEnvelopeEnabled[0]).toBe(true);
			expect(state.channelPatternEnvelopeShapes[0]).toBe(12);
		});

		it('uses pattern shape only as syncbuzzer zero placeholder, not as an extra step', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.setInstruments([createSyncbuzzerInstrument([9, 13])]);
			state.setTuningTable([500]);
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelPatternVolumes = [15, 15, 15];
			state.channelInstrumentVolumes = [15, 0, 0];
			state.channelAmplitudeSliding = [0, 0, 0];
			state.instrumentPositions = [0, 0, 0];
			state.channelTimerPositions = [0, 0, 0];
			state.channelOnOffCounter = [0, 0, 0];
			state.envelopeOnOffCounter = 0;
			state.envelopeEffectTable = -1;
			state.channelPatternEnvelopeShapes = [12, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.channelToneAccumulator = [0, 0, 0];
			state.channelNoiseAccumulator = [0, 0, 0];
			state.channelEnvelopeAccumulator = [0, 0, 0];
			state.channelTimerPwmSweep = [-1, -1, -1];
			state.channelTimerEffectReset = [false, false, false];

			const registerState = {
				channels: [
					{
						tone: 500,
						volume: 15,
						mixer: { tone: true, noise: false, envelope: true },
						timerEffects: undefined
					},
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};

			driver.processInstruments(state, registerState);

			expect(registerState.forceEnvelopeShapeWrite).toBe(false);
			expect(registerState.channels[0].timerEffects.syncbuzzer.waveform).toEqual([9, 13]);
		});

		it('replaces syncbuzzer zero steps with pattern shape without writing pattern shape first', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.setInstruments([createSyncbuzzerInstrument([0, 8, 0, 8])]);
			state.setTuningTable([500]);
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelPatternVolumes = [15, 15, 15];
			state.channelInstrumentVolumes = [15, 0, 0];
			state.channelAmplitudeSliding = [0, 0, 0];
			state.instrumentPositions = [0, 0, 0];
			state.channelTimerPositions = [0, 0, 0];
			state.channelOnOffCounter = [0, 0, 0];
			state.envelopeOnOffCounter = 0;
			state.envelopeEffectTable = -1;
			state.channelPatternEnvelopeShapes = [12, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.channelToneAccumulator = [0, 0, 0];
			state.channelNoiseAccumulator = [0, 0, 0];
			state.channelEnvelopeAccumulator = [0, 0, 0];
			state.channelTimerPwmSweep = [-1, -1, -1];
			state.channelTimerEffectReset = [false, false, false];

			const registerState = {
				channels: [
					{
						tone: 500,
						volume: 15,
						mixer: { tone: true, noise: false, envelope: true },
						timerEffects: undefined
					},
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};

			driver.processInstruments(state, registerState);

			expect(registerState.forceEnvelopeShapeWrite).toBe(false);
			expect(registerState.channels[0].timerEffects.syncbuzzer.waveform).toEqual([12, 8, 12, 8]);
		});

		it('still writes pattern envelope shape when syncbuzzer is not active', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.setInstruments([
				{
					id: '01',
					rows: [{ tone: true, volume: 15, noise: false, envelope: true }],
					loop: 0,
					timerRows: [{ syncbuzzer: false }]
				}
			]);
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.envelopeOnOffCounter = 0;

			const registerState = {
				channels: [
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};

			driver._processEnvelope(
				state,
				0,
				{ envelopeShape: 12 },
				{ envelopeValue: null },
				registerState
			);

			expect(registerState.envelopeShape).toBe(12);
			expect(registerState.forceEnvelopeShapeWrite).toBe(true);
		});

		it('uses pattern envelope shape for EA when syncbuzzer owns R13 writes', () => {
			const driver = new AYAudioDriver();
			const state = new AyumiState();
			state.setTuningTable([600, 700, 800]);
			state.setInstruments([
				{
					id: '01',
					rows: [{ tone: true, volume: 15, noise: false, envelope: true }],
					loop: 0,
					timerRows: [{ syncbuzzer: true, timerWaveform: [9, 13] }]
				}
			]);
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelBaseNotes = [0, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 3;
			state.autoEnvelopeDenominator = 2;
			state.channelPatternEnvelopeShapes = [12, 0, 0];

			const registerState = {
				channels: [
					{ tone: 600, volume: 15, mixer: { tone: true, noise: false, envelope: true } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } },
					{ tone: 0, volume: 0, mixer: { tone: false, noise: false, envelope: false } }
				],
				noise: 0,
				envelopePeriod: 0,
				envelopeShape: 0,
				forceEnvelopeShapeWrite: false
			};

			driver.processAutoEnvelope(state, registerState);

			expect(state.envelopeBaseValue).toBe(Math.round((600 * 3) / (2 * 16)));
		});
	});
});
