import { describe, it, expect, vi, beforeEach } from 'vitest';
import TrackerPatternProcessor from '../../public/tracker/tracker-pattern-processor.js';
import AyumiState from '../../public/ay/ayumi-state.js';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';

function createMockState() {
	const state = new AyumiState();
	state.currentTuningTable = [1000, 900, 800];
	state.setTables([{ id: 0, rows: [0, 2, 0], loop: 0, name: 'T0' }]);
	return state;
}

function createMockPattern(rowsCount = 1) {
	const channels = [
		{ rows: [] as { note: { name: number; octave: number }; effects: (unknown)[]; table?: number }[] },
		{ rows: [] as { note: { name: number; octave: number }; effects: (unknown)[]; table?: number }[] },
		{ rows: [] as { note: { name: number; octave: number }; effects: (unknown)[]; table?: number }[] }
	];
	for (let r = 0; r < rowsCount; r++) {
		channels[0].rows.push({ note: { name: 0, octave: 0 }, effects: [null] });
		channels[1].rows.push({ note: { name: 0, octave: 0 }, effects: [null] });
		channels[2].rows.push({ note: { name: 0, octave: 0 }, effects: [null] });
	}
	const pattern = {
		channels,
		patternRows: Array(rowsCount).fill({ noiseValue: null }),
		length: rowsCount
	};
	return pattern;
}

describe('TrackerPatternProcessor', () => {
	describe('constructor', () => {
		it('stores state, chipAudioDriver, port', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const port = { postMessage: vi.fn() };
			const proc = new TrackerPatternProcessor(state, driver, port);
			expect(proc.state).toBe(state);
			expect(proc.chipAudioDriver).toBe(driver);
			expect(proc.port).toBe(port);
		});
	});

	describe('parsePatternRow', () => {
		it('returns early when pattern is null', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const processPatternRow = vi.spyOn(driver, 'processPatternRow');
			const proc = new TrackerPatternProcessor(state, driver, {});
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(null, 0, registerState);
			expect(processPatternRow).not.toHaveBeenCalled();
		});

		it('returns early when rowIndex >= pattern.length', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const processPatternRow = vi.spyOn(driver, 'processPatternRow');
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(2);
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 5, registerState);
			expect(processPatternRow).not.toHaveBeenCalled();
		});

		it('returns early when rowIndex < 0', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const processPatternRow = vi.spyOn(driver, 'processPatternRow');
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, -1, registerState);
			expect(processPatternRow).not.toHaveBeenCalled();
		});

		it('calls chipAudioDriver.processPatternRow when pattern and row valid', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const processPatternRow = vi.spyOn(driver, 'processPatternRow');
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(processPatternRow).toHaveBeenCalledWith(
				state,
				pattern,
				0,
				pattern.patternRows[0],
				registerState
			);
		});

		it('note off (name 1) sets channelSoundEnabled false and base/current notes 0', () => {
			const state = createMockState();
			state.channelSoundEnabled = [true, true, true];
			state.channelBaseNotes = [5, 5, 5];
			state.channelCurrentNotes = [5, 5, 5];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			pattern.channels[0].rows[0].note = { name: 1, octave: 0 };
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(state.channelSoundEnabled[0]).toBe(false);
			expect(state.channelBaseNotes[0]).toBe(0);
			expect(state.channelCurrentNotes[0]).toBe(0);
		});

		it('note on sets channelSoundEnabled true and base/current note from note value', () => {
			const state = createMockState();
			state.channelSoundEnabled = [false, false, false];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			pattern.channels[1].rows[0].note = { name: 4, octave: 2 };
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(state.channelSoundEnabled[1]).toBe(true);
			const noteValue = 4 - 2 + (2 - 1) * 12;
			expect(state.channelBaseNotes[1]).toBe(noteValue);
			expect(state.channelCurrentNotes[1]).toBe(noteValue);
		});
	});

	describe('processTables', () => {
		it('channel with tableIndex < 0 keeps currentNote = baseNote', () => {
			const state = createMockState();
			state.channelTables = [-1, -1, -1];
			state.channelBaseNotes = [3, 5, 7];
			state.channelCurrentNotes = [0, 0, 0];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(3);
			expect(state.channelCurrentNotes[1]).toBe(5);
			expect(state.channelCurrentNotes[2]).toBe(7);
		});

		it('channel with valid table applies table offset to baseNote', () => {
			const state = createMockState();
			state.setTables([{ id: 0, rows: [0, 1], loop: 0, name: 'T0' }]);
			state.channelTables = [0, -1, -1];
			state.channelBaseNotes = [1, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.tablePositions = [0, 0, 0];
			state.tableCounters = [0, 0, 0];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(1);
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(2);
		});

		it('clamps final note to 0 and maxNote', () => {
			const state = createMockState();
			state.setTables([{ id: 0, rows: [100, -50], loop: 0, name: 'T0' }]);
			state.channelTables = [0, -1, -1];
			state.channelBaseNotes = [0, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.tablePositions = [1, 0, 0];
			state.tableCounters = [0, 0, 0];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(0);
		});

		it('additive table accumulates offset across ticks and loops', () => {
			const state = createMockState();
			state.currentTuningTable = Array.from({ length: 12 }, (_, i) => 1000 - i);
			state.setTables([{ id: 0, rows: [1], loop: 0, name: 'T0', additive: true }]);
			state.channelTables = [0, -1, -1];
			state.channelBaseNotes = [1, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.tablePositions = [0, 0, 0];
			state.tableCounters = [0, 0, 0];
			state.tableAccumulators = [0, 0, 0];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(2);
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(3);
		});

		it('non-additive table keeps absolute offsets', () => {
			const state = createMockState();
			state.currentTuningTable = Array.from({ length: 12 }, (_, i) => 1000 - i);
			state.setTables([{ id: 0, rows: [1, 3], loop: 0, name: 'T0', additive: false }]);
			state.channelTables = [0, -1, -1];
			state.channelBaseNotes = [1, 0, 0];
			state.channelCurrentNotes = [0, 0, 0];
			state.tablePositions = [0, 0, 0];
			state.tableCounters = [0, 0, 0];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(2);
			proc.processTables();
			expect(state.channelCurrentNotes[0]).toBe(4);
		});
	});

	describe('parsePatternRow effect and volume', () => {
		it('row with volume sets channelPatternVolumes', () => {
			const state = createMockState();
			state.channelPatternVolumes = [15, 15, 15];
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			pattern.channels[0].rows[0] = {
				note: { name: 2, octave: 1 },
				effects: [null],
				volume: 8
			};
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(state.channelPatternVolumes[0]).toBe(8);
		});

		it('row with arpeggio effect initializes channelArpeggioCounter and semitones', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			pattern.channels[0].rows[0] = {
				note: { name: 2, octave: 1 },
				effects: [
					{ effect: 'A'.charCodeAt(0), delay: 1, parameter: 0x37 }
				]
			};
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(state.channelArpeggioSemitone1[0]).toBe(3);
			expect(state.channelArpeggioSemitone2[0]).toBe(7);
			expect(state.channelArpeggioCounter[0]).toBe(1);
			expect(state.channelArpeggioPosition[0]).toBe(0);
		});

		it('row with slide up effect initializes channelSlideStep', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			pattern.channels[0].rows[0] = {
				note: { name: 2, octave: 1 },
				effects: [{ effect: 1, delay: 2, parameter: 5 }]
			};
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(state.channelSlideStep[0]).toBe(5);
			expect(state.channelSlideDelay[0]).toBe(2);
			expect(state.channelSlideCount[0]).toBe(2);
		});

		it('row with on/off effect enables channel sound at on-phase start', () => {
			const state = createMockState();
			const driver = new AYAudioDriver();
			const proc = new TrackerPatternProcessor(state, driver, {});
			const pattern = createMockPattern(1);
			state.channelSoundEnabled[0] = false;
			pattern.channels[0].rows[0] = {
				note: { name: 0, octave: 0 },
				effects: [{ effect: 6, delay: 0, parameter: 0x24 }]
			};
			const registerState = new AYChipRegisterState();
			proc.parsePatternRow(pattern, 0, registerState);
			expect(state.channelOnOffCounter[0]).toBe(2);
			expect(state.channelOnDuration[0]).toBe(2);
			expect(state.channelOffDuration[0]).toBe(4);
			expect(state.channelSoundEnabled[0]).toBe(true);
		});
	});
});
