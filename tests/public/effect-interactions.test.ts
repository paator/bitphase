import { describe, it, expect, vi, beforeEach } from 'vitest';
import { legacyInstruments } from '../helpers/instrument-fixtures.ts';
import TrackerPatternProcessor from '../../public/tracker/tracker-pattern-processor.js';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AyumiState from '../../public/ay/ayumi-state.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';
import EffectAlgorithms from '../../public/tracker/effect-algorithms.js';
import { getEffectTableSlot } from '../../public/tracker/tracker-effect-tables.js';
import { processAyTimerPwmEffect } from '../../public/ay/ay-timer-pwm-effect.js';

function createState() {
	const state = new AyumiState();
	state.setTuningTable([
		3328, 3136, 2960, 2794, 2637, 2489, 2349, 2217, 2093, 1975, 1864, 1760,
		1664, 1568, 1480, 1397, 1319, 1245, 1175, 1109, 1047, 988, 932, 880,
		832, 784, 740, 699, 659, 622, 587, 554, 523, 494, 466, 440
	]);
	return state;
}

function createProcessor(state: InstanceType<typeof AyumiState>) {
	const driver = new AYAudioDriver();
	const port = { postMessage: vi.fn() };
	return new TrackerPatternProcessor(state, driver, port);
}

function createRegisterState() {
	return new AYChipRegisterState();
}

function makeRow(
	noteName: number,
	noteOctave: number,
	effects: (null | { effect: number; delay: number; parameter: number; tableIndex?: number })[]
) {
	return { note: { name: noteName, octave: noteOctave }, effects };
}

function makePattern(rows: ReturnType<typeof makeRow>[][]) {
	const rowCount = rows[0].length;
	return {
		channels: rows.map((channelRows) => ({ rows: channelRows })),
		patternRows: Array(rowCount).fill({ noiseValue: null, envelopeValue: null }),
		length: rowCount
	};
}

describe('Channel effect interactions', () => {
	let state: InstanceType<typeof AyumiState>;
	let proc: InstanceType<typeof TrackerPatternProcessor>;

	beforeEach(() => {
		state = createState();
		proc = createProcessor(state);
	});

	describe('slide group mutual exclusivity', () => {
		it('slide up disables active portamento', () => {
			state.channelPortamentoActive[0] = true;
			state.channelPortamentoDelta[0] = 100;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }]);
			proc._processEffects(0, row);

			expect(state.channelPortamentoActive[0]).toBe(false);
			expect(state.channelSlideStep[0]).toBe(5);
		});

		it('slide down disables active portamento', () => {
			state.channelPortamentoActive[0] = true;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.SLIDE_DOWN, delay: 1, parameter: 3 }]);
			proc._processEffects(0, row);

			expect(state.channelPortamentoActive[0]).toBe(false);
			expect(state.channelSlideStep[0]).toBe(-3);
		});

		it('portamento disables active slide', () => {
			state.channelSlideStep[0] = 10;
			state.channelSlideCount[0] = 5;
			state.channelBaseNotes[0] = 12;
			state.channelPreviousNotes[0] = 0;
			state.channelCurrentNotes[0] = 12;

			const row = makeRow(14, 2, [{ effect: EffectAlgorithms.PORTAMENTO, delay: 1, parameter: 5 }]);
			proc._processNote(0, row);
			proc._processEffects(0, row);

			expect(state.channelSlideStep[0]).not.toBe(10);
			expect(state.channelSlideCount[0]).toBe(0);
		});
	});

	describe('independent effects do not disable each other', () => {
		it('arpeggio does not disable portamento', () => {
			state.channelPortamentoActive[0] = true;
			state.channelPortamentoDelta[0] = 50;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }]);
			proc._processEffects(0, row);

			expect(state.channelPortamentoActive[0]).toBe(true);
		});

		it('arpeggio does not disable vibrato', () => {
			state.channelVibratoCounter[0] = 5;
			state.channelVibratoSpeed[0] = 2;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }]);
			proc._processEffects(0, row);

			expect(state.channelVibratoCounter[0]).toBe(5);
		});

		it('arpeggio does not disable on/off', () => {
			state.channelOnOffCounter[0] = 3;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }]);
			proc._processEffects(0, row);

			expect(state.channelOnOffCounter[0]).toBe(3);
		});

		it('vibrato does not disable arpeggio', () => {
			state.channelArpeggioCounter[0] = 4;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }]);
			proc._processEffects(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(4);
		});

		it('vibrato does not disable portamento', () => {
			state.channelPortamentoActive[0] = true;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }]);
			proc._processEffects(0, row);

			expect(state.channelPortamentoActive[0]).toBe(true);
		});

		it('vibrato does not disable on/off', () => {
			state.channelOnOffCounter[0] = 3;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }]);
			proc._processEffects(0, row);

			expect(state.channelOnOffCounter[0]).toBe(3);
		});

		it('on/off does not disable arpeggio', () => {
			state.channelArpeggioCounter[0] = 4;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }]);
			proc._processEffects(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(4);
		});

		it('on/off does not disable slide', () => {
			state.channelSlideStep[0] = 5;
			state.channelSlideCount[0] = 3;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }]);
			proc._processEffects(0, row);

			expect(state.channelSlideStep[0]).toBe(5);
			expect(state.channelSlideCount[0]).toBe(3);
		});

		it('on/off does not disable portamento', () => {
			state.channelPortamentoActive[0] = true;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }]);
			proc._processEffects(0, row);

			expect(state.channelPortamentoActive[0]).toBe(true);
		});

		it('slide up does not disable arpeggio', () => {
			state.channelArpeggioCounter[0] = 4;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }]);
			proc._processEffects(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(4);
		});

		it('slide up does not disable vibrato', () => {
			state.channelVibratoCounter[0] = 5;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }]);
			proc._processEffects(0, row);

			expect(state.channelVibratoCounter[0]).toBe(5);
		});

		it('slide up does not disable on/off', () => {
			state.channelOnOffCounter[0] = 3;

			const row = makeRow(0, 0, [{ effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }]);
			proc._processEffects(0, row);

			expect(state.channelOnOffCounter[0]).toBe(3);
		});
	});

	describe('multiple effect columns', () => {
		it('applies every slot on the same row in order', () => {
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 },
				{ effect: EffectAlgorithms.VIBRATO, delay: 4, parameter: 0x44 }
			]);
			proc._processEffects(0, row);

			expect(state.channelArpeggioSemitone1[0]).toBe(3);
			expect(state.channelArpeggioSemitone2[0]).toBe(7);
			expect(state.channelVibratoSpeed[0]).toBe(4);
			expect(state.channelVibratoDepth[0]).toBe(4);
		});

		it('keeps independent T-tables for effects that coexist', () => {
			state.setTables([
				{ id: 0, rows: [0x12, 0x34], loop: 0 },
				{ id: 1, rows: [0x44, 0x22], loop: 0 },
				{ id: 2, rows: [0x85, 0x90], loop: 0 }
			]);
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0, tableIndex: 0 },
				{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0, tableIndex: 1 },
				{ effect: EffectAlgorithms.DETUNE, delay: 0, parameter: 0, tableIndex: 2 }
			]);
			proc._processEffects(0, row);

			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.ARPEGGIO)
					?.tableIndex
			).toBe(0);
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.VIBRATO)
					?.tableIndex
			).toBe(1);
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.DETUNE)
					?.tableIndex
			).toBe(2);
			expect(state.channelVibratoSpeed[0]).toBe(4);
			expect(state.channelVibratoDepth[0]).toBe(4);
			expect(state.channelDetune[0]).toBe(0x85 - 0x80);

			proc.processEffectTables();
			expect(state.channelVibratoSpeed[0]).toBe(2);
			expect(state.channelVibratoDepth[0]).toBe(2);
			expect(state.channelDetune[0]).toBe(0x90 - 0x80);
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.ARPEGGIO)
					?.tableIndex
			).toBe(0);
		});

		it('hex effect on the same row does not clear another effect table', () => {
			state.setTables([{ id: 0, rows: [0x44, 0x22], loop: 0 }]);
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0, tableIndex: 0 },
				{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }
			]);
			proc._processEffects(0, row);

			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.VIBRATO)
					?.tableIndex
			).toBe(0);
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.ARPEGGIO)
			).toBeNull();
			expect(state.channelArpeggioSemitone1[0]).toBe(3);
			expect(state.channelVibratoSpeed[0]).toBe(4);
		});

		it('speed table and vibrato table run independently', () => {
			state.setTables([
				{ id: 0, rows: [3, 5], loop: 0 },
				{ id: 1, rows: [0x44, 0x22], loop: 0 }
			]);
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.SPEED, delay: 0, parameter: 0, tableIndex: 0 },
				{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0, tableIndex: 1 }
			]);
			proc._processEffects(0, row);

			expect(state.speedTable).toBe(0);
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.VIBRATO)
					?.tableIndex
			).toBe(1);
			expect(state.channelVibratoSpeed[0]).toBe(4);
		});

		it('AY E1TX does not steal a vibrato table on the same row', () => {
			state.setTables([
				{ id: 0, rows: [0x44, 0x22], loop: 0 },
				{ id: 1, rows: [0x80, 0x40], loop: 0 }
			]);
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0, tableIndex: 0 },
				{ effect: EffectAlgorithms.AUTO_ENVELOPE, delay: 1, parameter: 0, tableIndex: 1 }
			]);
			proc._processEffects(0, row);
			processAyTimerPwmEffect(state, 0, row);

			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.VIBRATO)
					?.tableIndex
			).toBe(0);
			expect(state.channelTimerPwmTableIndex[0][0]).toBe(1);
			expect(state.channelVibratoSpeed[0]).toBe(4);
		});

		it('slide-group tables last-win and clear the other slide table', () => {
			state.setTables([
				{ id: 0, rows: [5, 8], loop: 0 },
				{ id: 1, rows: [3, 6], loop: 0 }
			]);
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 0, tableIndex: 0 },
				{ effect: EffectAlgorithms.SLIDE_DOWN, delay: 1, parameter: 0, tableIndex: 1 }
			]);
			proc._processEffects(0, row);

			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.SLIDE_UP)
			).toBeNull();
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.SLIDE_DOWN)
					?.tableIndex
			).toBe(1);
			expect(state.channelSlideStep[0]).toBe(-3);
		});
	});

	describe('instrument position and table position', () => {
		it('effect 4 (instrument position) sets instrumentPositions immediately', () => {
			state.instrumentPositions[0] = 0;

			const row = makeRow(4, 2, [
				{ effect: EffectAlgorithms.SAMPLE_POSITION, delay: 0, parameter: 0x0a }
			]);
			proc._processEffects(0, row);

			expect(state.instrumentPositions[0]).toBe(10);
		});

		it('effect 5 (table position) sets tablePositions immediately', () => {
			state.tablePositions[0] = 0;

			const row = makeRow(4, 2, [
				{ effect: EffectAlgorithms.ORNAMENT_POSITION, delay: 0, parameter: 0x03 }
			]);
			proc._processEffects(0, row);

			expect(state.tablePositions[0]).toBe(3);
		});
	});

	describe('new note resets', () => {
		it('note-off resets all channel effects', () => {
			state.channelArpeggioCounter[0] = 5;
			state.channelVibratoCounter[0] = 3;
			state.channelOnOffCounter[0] = 2;
			state.channelSlideStep[0] = 10;
			state.channelPortamentoActive[0] = true;
			state.channelToneSliding[0] = 50;
			state.channelEffectTableSlots[0][EffectAlgorithms.VIBRATO] = {
				tableIndex: 1,
				position: 0,
				counter: 1,
				delay: 1
			};

			const row = makeRow(1, 0, [null]);
			proc._processNote(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(0);
			expect(state.channelVibratoCounter[0]).toBe(0);
			expect(state.channelOnOffCounter[0]).toBe(0);
			expect(state.channelSlideStep[0]).toBe(0);
			expect(state.channelPortamentoActive[0]).toBe(false);
			expect(state.channelToneSliding[0]).toBe(0);
			expect(state.channelEffectTableSlots[0]).toEqual({});
		});

		it('new note with explicit arpeggio resets vibrato and on/off but keeps arpeggio', () => {
			state.channelArpeggioCounter[0] = 5;
			state.channelVibratoCounter[0] = 3;
			state.channelOnOffCounter[0] = 2;

			const row = makeRow(4, 2, [{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }]);
			proc._processNote(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(5);
			expect(state.channelVibratoCounter[0]).toBe(0);
			expect(state.channelOnOffCounter[0]).toBe(0);
		});

		it('new note with explicit vibrato resets arpeggio and on/off but keeps vibrato', () => {
			state.channelArpeggioCounter[0] = 5;
			state.channelVibratoCounter[0] = 3;
			state.channelOnOffCounter[0] = 2;

			const row = makeRow(4, 2, [{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }]);
			proc._processNote(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(0);
			expect(state.channelVibratoCounter[0]).toBe(3);
			expect(state.channelOnOffCounter[0]).toBe(0);
		});

		it('new note with explicit on/off resets arpeggio and vibrato but keeps on/off', () => {
			state.channelArpeggioCounter[0] = 5;
			state.channelVibratoCounter[0] = 3;
			state.channelOnOffCounter[0] = 2;

			const row = makeRow(4, 2, [{ effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }]);
			proc._processNote(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(0);
			expect(state.channelVibratoCounter[0]).toBe(0);
			expect(state.channelOnOffCounter[0]).toBe(2);
		});

		it('new note without any effect resets arpeggio, vibrato and on/off', () => {
			state.channelArpeggioCounter[0] = 5;
			state.channelVibratoCounter[0] = 3;
			state.channelOnOffCounter[0] = 2;

			const row = makeRow(4, 2, [null]);
			proc._processNote(0, row);

			expect(state.channelArpeggioCounter[0]).toBe(0);
			expect(state.channelVibratoCounter[0]).toBe(0);
			expect(state.channelOnOffCounter[0]).toBe(0);
		});

		it('new note with portamento preserves tone sliding', () => {
			state.channelToneSliding[0] = 50;
			state.channelBaseNotes[0] = 12;

			const row = makeRow(4, 2, [{ effect: EffectAlgorithms.PORTAMENTO, delay: 1, parameter: 5 }]);
			proc._processNote(0, row);

			expect(state.channelToneSliding[0]).toBe(50);
		});

		it('new note without slide group clears slide step', () => {
			state.channelSlideStep[0] = 10;

			const row = makeRow(4, 2, [{ effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }]);
			proc._processNote(0, row);

			expect(state.channelSlideStep[0]).toBe(0);
		});

		it('new note without slide up (effect 1) resets slide state', () => {
			state.channelSlideStep[0] = 10;
			if (!state.channelSlideAlreadyApplied) state.channelSlideAlreadyApplied = [];
			state.channelSlideAlreadyApplied[0] = true;

			const row = makeRow(4, 2, [null]);
			proc._processNote(0, row);

			expect(state.channelSlideStep[0]).toBe(0);
			expect(state.channelSlideAlreadyApplied[0]).toBe(false);
		});

		it('new note without slide down (effect 2) resets slide state', () => {
			state.channelSlideStep[0] = -10;
			if (!state.channelSlideAlreadyApplied) state.channelSlideAlreadyApplied = [];
			state.channelSlideAlreadyApplied[0] = true;

			const row = makeRow(4, 2, [{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }]);
			proc._processNote(0, row);

			expect(state.channelSlideStep[0]).toBe(0);
			expect(state.channelSlideAlreadyApplied[0]).toBe(false);
		});

		it('new note with effect table keeps that effect table slot', () => {
			state.channelEffectTableSlots[0][EffectAlgorithms.VIBRATO] = {
				tableIndex: 1,
				position: 3,
				counter: 2,
				delay: 1
			};

			const row = makeRow(4, 2, [
				{ effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44, tableIndex: 0 }
			]);
			proc._processNote(0, row);

			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.VIBRATO)
					?.tableIndex
			).toBe(1);
		});

		it('parameter arpeggio after table arpeggio clears arpeggio table', () => {
			const tableRow = makeRow(0, 0, [
				{ effect: EffectAlgorithms.ARPEGGIO, delay: 0, parameter: 0, tableIndex: 0 }
			]);
			proc._processEffects(0, tableRow);
			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.ARPEGGIO)
					?.tableIndex
			).toBe(0);

			const parameterRow = makeRow(0, 0, [
				{ effect: EffectAlgorithms.ARPEGGIO, delay: 0, parameter: 0x0c }
			]);
			proc._processEffects(0, parameterRow);

			expect(
				getEffectTableSlot(state.channelEffectTableSlots, 0, EffectAlgorithms.ARPEGGIO)
			).toBeNull();
			expect(state.channelArpeggioSemitone1[0]).toBe(0);
			expect(state.channelArpeggioSemitone2[0]).toBe(0xc);
		});

		it('E1TX does not occupy a generic channel effect table slot', () => {
			const row = makeRow(0, 0, [
				{ effect: EffectAlgorithms.AUTO_ENVELOPE, delay: 1, parameter: 0, tableIndex: 0 }
			]);
			proc._processEffects(0, row);
			expect(state.channelEffectTableSlots[0]).toEqual({});
		});

		it('A000 stops a running arpeggio and restores the base note', () => {
			state.channelBaseNotes[0] = 12;
			state.channelCurrentNotes[0] = 19;
			state.channelArpeggioCounter[0] = 3;
			state.channelArpeggioSemitone1[0] = 3;
			state.channelArpeggioSemitone2[0] = 7;

			const stopRow = makeRow(0, 0, [
				{ effect: EffectAlgorithms.ARPEGGIO, delay: 0, parameter: 0 }
			]);
			proc._processEffects(0, stopRow);

			expect(state.channelArpeggioCounter[0]).toBe(0);
			expect(state.channelArpeggioSemitone1[0]).toBe(0);
			expect(state.channelArpeggioSemitone2[0]).toBe(0);
			expect(state.channelCurrentNotes[0]).toBe(12);
		});
	});
});

describe('Envelope effect interactions', () => {
	let state: InstanceType<typeof AyumiState>;
	let driver: InstanceType<typeof AYAudioDriver>;

	function createEnvRegisterState() {
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
		state = createState();
		driver = new AYAudioDriver();
	});

	describe('slide group mutual exclusivity', () => {
		it('envelope slide up disables envelope portamento', () => {
			state.envelopePortamentoActive = true;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopePortamentoActive).toBe(false);
			expect(state.envelopeSlideDelta).toBe(5);
		});

		it('envelope slide down disables envelope portamento', () => {
			state.envelopePortamentoActive = true;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.SLIDE_DOWN, delay: 1, parameter: 3 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopePortamentoActive).toBe(false);
			expect(state.envelopeSlideDelta).toBe(-3);
		});

		it('envelope portamento disables envelope slide', () => {
			state.envelopeSlideDelta = 10;
			state.envelopeSlideDelayCounter = 5;
			state.envelopeBaseValue = 100;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.PORTAMENTO, delay: 1, parameter: 5 },
				envelopeValue: 200
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeSlideDelta).toBe(0);
			expect(state.envelopeSlideDelayCounter).toBe(0);
		});
	});

	describe('independent effects do not disable each other', () => {
		it('envelope arpeggio does not disable envelope portamento', () => {
			state.envelopePortamentoActive = true;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopePortamentoActive).toBe(true);
		});

		it('envelope arpeggio does not disable envelope vibrato', () => {
			state.envelopeVibratoCounter = 5;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeVibratoCounter).toBe(5);
		});

		it('envelope arpeggio does not disable envelope on/off', () => {
			state.envelopeOnOffCounter = 3;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.ARPEGGIO, delay: 1, parameter: 0x37 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeOnOffCounter).toBe(3);
		});

		it('envelope vibrato does not disable envelope arpeggio', () => {
			state.envelopeArpeggioCounter = 4;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeArpeggioCounter).toBe(4);
		});

		it('envelope vibrato does not disable envelope slide', () => {
			state.envelopeSlideDelta = 5;
			state.envelopeSlideDelayCounter = 3;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeSlideDelta).toBe(5);
			expect(state.envelopeSlideDelayCounter).toBe(3);
		});

		it('envelope vibrato does not disable envelope portamento', () => {
			state.envelopePortamentoActive = true;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.VIBRATO, delay: 1, parameter: 0x44 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopePortamentoActive).toBe(true);
		});

		it('envelope on/off does not disable envelope arpeggio', () => {
			state.envelopeArpeggioCounter = 4;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeArpeggioCounter).toBe(4);
		});

		it('envelope on/off does not disable envelope slide', () => {
			state.envelopeSlideDelta = 5;
			state.envelopeSlideDelayCounter = 3;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeSlideDelta).toBe(5);
			expect(state.envelopeSlideDelayCounter).toBe(3);
		});

		it('envelope on/off does not disable envelope portamento', () => {
			state.envelopePortamentoActive = true;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.ON_OFF, delay: 0, parameter: 0x32 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopePortamentoActive).toBe(true);
		});

		it('envelope slide does not disable envelope arpeggio', () => {
			state.envelopeArpeggioCounter = 4;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeArpeggioCounter).toBe(4);
		});

		it('envelope slide does not disable envelope vibrato', () => {
			state.envelopeVibratoCounter = 5;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeVibratoCounter).toBe(5);
		});

		it('envelope slide does not disable envelope on/off', () => {
			state.envelopeOnOffCounter = 3;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.SLIDE_UP, delay: 1, parameter: 5 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeOnOffCounter).toBe(3);
		});

		it('EA does not disable envelope arpeggio', () => {
			state.envelopeArpeggioCounter = 4;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.AUTO_ENVELOPE, delay: 0xa, parameter: 0x32 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeArpeggioCounter).toBe(4);
		});

		it('EA does not disable envelope vibrato', () => {
			state.envelopeVibratoCounter = 5;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.AUTO_ENVELOPE, delay: 0xa, parameter: 0x32 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeVibratoCounter).toBe(5);
		});

		it('EA does not disable envelope slide', () => {
			state.envelopeSlideDelta = 5;

			const patternRow = {
				envelopeEffect: { effect: EffectAlgorithms.AUTO_ENVELOPE, delay: 0xa, parameter: 0x32 }
			};
			driver._processEnvelopeEffects(state, 0, {}, patternRow);

			expect(state.envelopeSlideDelta).toBe(5);
		});
	});

	describe('explicit envelope value resets all effects', () => {
		it('explicit envelope value resets all envelope effects and EA', () => {
			state.envelopeArpeggioCounter = 4;
			state.envelopeVibratoCounter = 5;
			state.envelopeOnOffCounter = 3;
			state.envelopeSlideDelta = 10;
			state.envelopeSlideDelayCounter = 2;
			state.envelopePortamentoActive = true;
			state.autoEnvelopeActive = true;
			state.envelopeEffectTable = 1;
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelEnvelopeEnabled = [false, false, false];
			state.setInstruments(legacyInstruments([{ id: '01', rows: [], loop: 0 }]));

			const registerState = createEnvRegisterState();
			const row = { envelopeShape: 12 };
			const patternRow = { envelopeValue: 500 };

			driver._processEnvelope(state, 0, row, patternRow, registerState);

			expect(state.envelopeArpeggioCounter).toBe(0);
			expect(state.envelopeVibratoCounter).toBe(0);
			expect(state.envelopeOnOffCounter).toBe(0);
			expect(state.envelopeSlideDelta).toBe(0);
			expect(state.envelopeSlideDelayCounter).toBe(0);
			expect(state.envelopePortamentoActive).toBe(false);
			expect(state.autoEnvelopeActive).toBe(false);
			expect(state.envelopeEffectTable).toBe(-1);
			expect(state.envelopeBaseValue).toBe(500);
		});

		it('null envelope value does not reset effects', () => {
			state.envelopeArpeggioCounter = 4;
			state.envelopeVibratoCounter = 5;
			state.autoEnvelopeActive = true;
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelEnvelopeEnabled = [false, false, false];
			state.setInstruments(legacyInstruments([{ id: '01', rows: [], loop: 0 }]));

			const registerState = createEnvRegisterState();
			const row = { envelopeShape: 0 };
			const patternRow = { envelopeValue: null };

			driver._processEnvelope(state, 0, row, patternRow, registerState);

			expect(state.envelopeArpeggioCounter).toBe(4);
			expect(state.envelopeVibratoCounter).toBe(5);
			expect(state.autoEnvelopeActive).toBe(true);
		});

		it('envelope value with portamento does not reset effects', () => {
			state.envelopeArpeggioCounter = 4;
			state.envelopeVibratoCounter = 5;
			state.envelopeBaseValue = 100;
			state.channelInstruments = [0, -1, -1];
			state.channelMuted = [false, false, false];
			state.channelEnvelopeEnabled = [false, false, false];
			state.setInstruments(legacyInstruments([{ id: '01', rows: [], loop: 0 }]));

			const registerState = createEnvRegisterState();
			const row = { envelopeShape: 12 };
			const patternRow = {
				envelopeValue: 200,
				envelopeEffect: { effect: EffectAlgorithms.PORTAMENTO, delay: 1, parameter: 5 }
			};

			driver._processEnvelope(state, 0, row, patternRow, registerState);

			expect(state.envelopeArpeggioCounter).toBe(4);
			expect(state.envelopeVibratoCounter).toBe(5);
		});
	});
});

describe('Processing order', () => {
	it('channel: arpeggio runs before effect tables', () => {
		const state = createState();
		const driver = new AYAudioDriver();
		const port = { postMessage: vi.fn() };
		const proc = new TrackerPatternProcessor(state, driver, port);

		const callOrder: string[] = [];
		const origArp = proc.processArpeggio.bind(proc);
		const origET = proc.processEffectTables.bind(proc);
		proc.processArpeggio = () => { callOrder.push('arpeggio'); origArp(); };
		proc.processEffectTables = () => { callOrder.push('effectTables'); origET(); };

		proc.processTables();
		proc.processArpeggio();
		proc.processEffectTables();

		expect(callOrder.indexOf('arpeggio')).toBeLessThan(callOrder.indexOf('effectTables'));
	});

	it('envelope: arpeggio runs before effect table, slide runs before vibrato', () => {
		const state = createState();
		const driver = new AYAudioDriver();
		state.setInstruments(legacyInstruments([]));
		state.channelInstruments = [-1, -1, -1];

		const callOrder: string[] = [];
		const origArp = driver.processEnvelopeArpeggio.bind(driver);
		const origET = driver.processEnvelopeEffectTable.bind(driver);
		const origSlide = driver.processEnvelopeSlide.bind(driver);
		const origVib = driver.processEnvelopeVibrato.bind(driver);
		const origPort = driver.processEnvelopePortamento.bind(driver);
		const origOnOff = driver.processEnvelopeOnOff.bind(driver);

		driver.processEnvelopeArpeggio = (s: typeof state) => { callOrder.push('arpeggio'); origArp(s); };
		driver.processEnvelopeEffectTable = (s: typeof state) => { callOrder.push('effectTable'); origET(s); };
		driver.processEnvelopeSlide = (s: typeof state) => { callOrder.push('slide'); origSlide(s); };
		driver.processEnvelopePortamento = (s: typeof state) => { callOrder.push('portamento'); origPort(s); };
		driver.processEnvelopeVibrato = (s: typeof state) => { callOrder.push('vibrato'); origVib(s); };
		driver.processEnvelopeOnOff = (s: typeof state) => { callOrder.push('onOff'); origOnOff(s); };

		const registerState = createRegisterState();
		driver.processInstruments(state, registerState);

		expect(callOrder.indexOf('arpeggio')).toBeLessThan(callOrder.indexOf('effectTable'));
		expect(callOrder.indexOf('slide')).toBeLessThan(callOrder.indexOf('vibrato'));
		expect(callOrder.indexOf('portamento')).toBeLessThan(callOrder.indexOf('vibrato'));
		expect(callOrder.indexOf('vibrato')).toBeLessThan(callOrder.indexOf('onOff'));
	});

	it('channel and envelope have matching relative order', () => {
		const channelOrder = ['tables', 'arpeggio', 'effectTables', 'slides', 'vibrato'];
		const envelopeOrder = ['autoEnvelope', 'arpeggio', 'effectTable', 'slide', 'portamento', 'vibrato', 'onOff'];

		const sharedSteps = ['arpeggio', 'vibrato'];
		for (const step of sharedSteps) {
			const chIdx = channelOrder.indexOf(step);
			const envIdx = envelopeOrder.indexOf(step);
			expect(chIdx).toBeGreaterThan(-1);
			expect(envIdx).toBeGreaterThan(-1);
		}

		expect(channelOrder.indexOf('arpeggio')).toBeLessThan(channelOrder.indexOf('vibrato'));
		expect(envelopeOrder.indexOf('arpeggio')).toBeLessThan(envelopeOrder.indexOf('vibrato'));
	});
});
