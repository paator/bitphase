import { describe, it, expect, beforeEach } from 'vitest';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AyumiState from '../../public/ay/ayumi-state.js';

describe('AYAudioDriver - Auto Envelope (EA)', () => {
	let driver: InstanceType<typeof AYAudioDriver>;
	let state: InstanceType<typeof AyumiState>;

	function createRegisterState() {
		return {
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
	}

	beforeEach(() => {
		driver = new AYAudioDriver();
		state = new AyumiState();
		state.setTuningTable([
			3328, 3136, 2960, 2794, 2637, 2489, 2349, 2217, 2093, 1975, 1864, 1760, 1664, 1568,
			1480, 1397, 1319, 1245, 1175, 1109, 1047, 988, 932, 880, 832, 784, 740, 699, 659, 622,
			587, 554, 523, 494, 466, 440, 416, 392, 370, 349, 330, 311, 294, 277, 262, 247, 233,
			220, 208, 196, 185, 175, 165, 156, 147, 139, 131, 124, 117, 110, 104, 98, 93, 87, 82,
			78, 74, 69, 66, 62, 59, 55, 52, 49, 46, 44, 41, 39, 37, 35, 33, 31, 29, 28, 26, 25, 23,
			22, 21, 20, 18, 17, 16, 15, 14, 13
		]);
	});

	describe('getAutoEnvelopeDivisor', () => {
		it('returns 16 for shape 8', () => {
			expect(driver.getAutoEnvelopeDivisor(8)).toBe(16);
		});

		it('returns 16 for shape 12 (C)', () => {
			expect(driver.getAutoEnvelopeDivisor(12)).toBe(16);
		});

		it('returns 32 for shape 10 (A)', () => {
			expect(driver.getAutoEnvelopeDivisor(10)).toBe(32);
		});

		it('returns 32 for shape 14 (E)', () => {
			expect(driver.getAutoEnvelopeDivisor(14)).toBe(32);
		});

		it('returns null for non-repeating shape 5', () => {
			expect(driver.getAutoEnvelopeDivisor(5)).toBeNull();
		});

		it('returns null for shape 0', () => {
			expect(driver.getAutoEnvelopeDivisor(0)).toBeNull();
		});
	});

	describe('_processEnvelopeEffects with AutoEnvelope', () => {
		it('activates auto-envelope when EA effect is processed', () => {
			const patternRow = {
				envelopeEffect: {
					effect: 'E'.charCodeAt(0),
					delay: 0xa,
					parameter: 0x32
				}
			};
			const row = { envelopeShape: 12 };

			driver._processEnvelopeEffects(state, 0, row, patternRow);

			expect(state.autoEnvelopeActive).toBe(true);
			expect(state.autoEnvelopeNumerator).toBe(3);
			expect(state.autoEnvelopeDenominator).toBe(2);
		});

		it('does not reset other envelope effects when EA activates', () => {
			state.envelopeArpeggioCounter = 5;
			state.envelopeVibratoCounter = 3;

			const patternRow = {
				envelopeEffect: {
					effect: 'E'.charCodeAt(0),
					delay: 0xa,
					parameter: 0x11
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(true);
			expect(state.envelopeArpeggioCounter).toBe(5);
			expect(state.envelopeVibratoCounter).toBe(3);
		});

		it('does not activate if numerator is 0', () => {
			const patternRow = {
				envelopeEffect: {
					effect: 'E'.charCodeAt(0),
					delay: 0xa,
					parameter: 0x02
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(false);
		});

		it('does not activate if denominator is 0', () => {
			const patternRow = {
				envelopeEffect: {
					effect: 'E'.charCodeAt(0),
					delay: 0xa,
					parameter: 0x30
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(false);
		});

		it('keeps auto-envelope active when arpeggio effect is set', () => {
			state.autoEnvelopeActive = true;

			const patternRow = {
				envelopeEffect: {
					effect: 'A'.charCodeAt(0),
					delay: 0,
					parameter: 0x37
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(true);
		});

		it('keeps auto-envelope active when slide effect is set', () => {
			state.autoEnvelopeActive = true;

			const patternRow = {
				envelopeEffect: {
					effect: 1,
					delay: 0,
					parameter: 0x10
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(true);
		});

		it('keeps auto-envelope active when vibrato effect is set', () => {
			state.autoEnvelopeActive = true;

			const patternRow = {
				envelopeEffect: {
					effect: 'V'.charCodeAt(0),
					delay: 0,
					parameter: 0x44
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(true);
		});

		it('keeps auto-envelope active when on/off effect is set', () => {
			state.autoEnvelopeActive = true;

			const patternRow = {
				envelopeEffect: {
					effect: 6,
					delay: 0,
					parameter: 0x24
				}
			};

			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.autoEnvelopeActive).toBe(true);
		});
	});

	describe('_processEnvelope disables EA on explicit envelope value', () => {
		it('deactivates auto-envelope when explicit envelope value is set', () => {
			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 3;
			state.autoEnvelopeDenominator = 2;
			state.channelEnvelopeEnabled = [false, false, false];
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.setInstruments([{ id: '01', rows: [], loop: 0 }]);

			const registerState = createRegisterState();
			const row = { envelopeShape: 12 };
			const patternRow = { envelopeValue: 500 };

			driver._processEnvelope(state, 0, row, patternRow, registerState);

			expect(state.autoEnvelopeActive).toBe(false);
			expect(state.envelopeBaseValue).toBe(500);
		});

		it('keeps auto-envelope active when envelope value is null (empty)', () => {
			state.autoEnvelopeActive = true;
			state.channelEnvelopeEnabled = [false, false, false];
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.setInstruments([{ id: '01', rows: [], loop: 0 }]);

			const registerState = createRegisterState();
			const row = { envelopeShape: 12 };
			const patternRow = { envelopeValue: null };

			driver._processEnvelope(state, 0, row, patternRow, registerState);

			expect(state.autoEnvelopeActive).toBe(true);
		});
	});

	describe('processAutoEnvelope', () => {
		it('calculates envelope period from base note with shape 12 and ratio 3:2', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 3;
			state.autoEnvelopeDenominator = 2;
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelBaseNotes = [28, 0, 0];
			state.channelCurrentNotes = [28, 0, 0];

			driver.processAutoEnvelope(state, registerState);

			const noteFreq = state.currentTuningTable[28];
			const expected = Math.round((noteFreq * 3) / (2 * 16));
			expect(state.envelopeBaseValue).toBe(expected);
		});

		it('calculates envelope period from base note with shape 10 and ratio 1:1', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 10;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelBaseNotes = [24, 0, 0];
			state.channelCurrentNotes = [24, 0, 0];

			driver.processAutoEnvelope(state, registerState);

			const noteFreq = state.currentTuningTable[24];
			const expected = Math.round(noteFreq / 32);
			expect(state.envelopeBaseValue).toBe(expected);
		});

		it('uses base note, ignoring channel arpeggio offset on currentNotes', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelBaseNotes = [24, 0, 0];
			state.channelCurrentNotes = [27, 0, 0];

			driver.processAutoEnvelope(state, registerState);

			const baseNoteFreq = state.currentTuningTable[24];
			const expected = Math.round(baseNoteFreq / 16);
			expect(state.envelopeBaseValue).toBe(expected);
		});

		it('uses last channel with envelope enabled (iterates from end)', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, false, true];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, true];
			state.channelBaseNotes = [24, 0, 36];
			state.channelCurrentNotes = [24, 0, 36];

			driver.processAutoEnvelope(state, registerState);

			const noteFreq = state.currentTuningTable[36];
			const expected = Math.round(noteFreq / 16);
			expect(state.envelopeBaseValue).toBe(expected);
		});

		it('does nothing when envelope shape has no valid divisor', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 5;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelBaseNotes = [24, 0, 0];
			state.channelCurrentNotes = [24, 0, 0];
			state.envelopeBaseValue = 999;

			driver.processAutoEnvelope(state, registerState);

			expect(state.envelopeBaseValue).toBe(999);
		});

		it('skips muted channels', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, true, false];
			state.channelMuted = [false, true, false];
			state.channelSoundEnabled = [true, true, false];
			state.channelBaseNotes = [24, 36, 0];
			state.channelCurrentNotes = [24, 36, 0];
			state.envelopeBaseValue = 0;

			driver.processAutoEnvelope(state, registerState);

			const noteFreq = state.currentTuningTable[24];
			const expected = Math.round(noteFreq / 16);
			expect(state.envelopeBaseValue).toBe(expected);
		});

		it('skips channels with sound disabled', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, true, false];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [false, true, false];
			state.channelBaseNotes = [24, 36, 0];
			state.channelCurrentNotes = [24, 36, 0];
			state.envelopeBaseValue = 0;

			driver.processAutoEnvelope(state, registerState);

			const noteFreq = state.currentTuningTable[36];
			const expected = Math.round(noteFreq / 16);
			expect(state.envelopeBaseValue).toBe(expected);
		});

		it('includes portamento sliding in envelope calculation', () => {
			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 1;
			state.autoEnvelopeDenominator = 1;
			state.channelEnvelopeEnabled = [true, false, false];
			state.channelMuted = [false, false, false];
			state.channelSoundEnabled = [true, false, false];
			state.channelBaseNotes = [24, 0, 0];
			state.channelCurrentNotes = [24, 0, 0];
			state.channelToneSliding = [50, 0, 0];

			driver.processAutoEnvelope(state, registerState);

			const baseTone = state.currentTuningTable[24];
			const effectiveTone = (baseTone + 50) & 0xfff;
			const expected = Math.round(effectiveTone / 16);
			expect(state.envelopeBaseValue).toBe(expected);
		});
	});

	describe('processInstruments with auto-envelope active', () => {
		it('auto-envelope overrides envelope base value during processInstruments', () => {
			state.setInstruments([
				{
					id: '01',
					rows: [
						{
							tone: true,
							volume: 15,
							noise: false,
							envelope: true,
							toneAdd: 0,
							noiseAdd: 0,
							envelopeAdd: 0,
							toneAccumulation: false,
							noiseAccumulation: false,
							envelopeAccumulation: false,
							amplitudeSliding: false,
							amplitudeSlideUp: false,
							retriggerEnvelope: false
						}
					],
					loop: 0
				}
			]);
			state.channelInstruments = [0, -1, -1];
			state.channelSoundEnabled = [true, false, false];
			state.channelBaseNotes = [24, 0, 0];
			state.channelCurrentNotes = [24, 0, 0];
			state.channelEnvelopeEnabled = [true, false, false];
			state.instrumentPositions = [0, 0, 0];
			state.envelopeEffectTable = -1;
			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 3;
			state.autoEnvelopeDenominator = 2;
			state.envelopeBaseValue = 100;

			const registerState = createRegisterState();
			registerState.envelopeShape = 12;

			driver.processInstruments(state, registerState);

			const noteFreq = state.currentTuningTable[24];
			const expected = Math.round((noteFreq * 3) / (2 * 16));
			expect(registerState.envelopePeriod).toBe(expected);
		});
	});

	describe('state reset', () => {
		it('reset clears auto-envelope state', () => {
			state.autoEnvelopeActive = true;
			state.autoEnvelopeNumerator = 3;
			state.autoEnvelopeDenominator = 2;

			state.reset();

			expect(state.autoEnvelopeActive).toBe(false);
			expect(state.autoEnvelopeNumerator).toBe(0);
			expect(state.autoEnvelopeDenominator).toBe(0);
		});
	});
});
