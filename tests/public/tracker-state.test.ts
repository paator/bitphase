import { describe, it, expect } from 'vitest';
import TrackerState from '../../public/tracker-state.js';

describe('TrackerState', () => {
	describe('constructor', () => {
		it('default channel count is 3', () => {
			const state = new TrackerState();
			expect(state.channelPatternVolumes).toHaveLength(3);
			expect(state.channelTables).toHaveLength(3);
			expect(state.channelBaseNotes).toHaveLength(3);
		});

		it('accepts custom channel count', () => {
			const state = new TrackerState(4);
			expect(state.channelPatternVolumes).toHaveLength(4);
			expect(state.channelTables).toHaveLength(4);
		});

		it('currentPattern is null, currentTuningTable empty', () => {
			const state = new TrackerState();
			expect(state.currentPattern).toBeNull();
			expect(state.currentTuningTable).toEqual([]);
		});

		it('patternOrder and currentPatternOrderIndex start at [] and 0', () => {
			const state = new TrackerState();
			expect(state.patternOrder).toEqual([]);
			expect(state.currentPatternOrderIndex).toBe(0);
		});

		it('intFrequency 50, currentSpeed 3, currentRow 0, currentTick 0', () => {
			const state = new TrackerState();
			expect(state.intFrequency).toBe(50);
			expect(state.currentSpeed).toBe(3);
			expect(state.currentRow).toBe(0);
			expect(state.currentTick).toBe(0);
		});

		it('channelPatternVolumes filled with 15', () => {
			const state = new TrackerState(3);
			expect(state.channelPatternVolumes).toEqual([15, 15, 15]);
		});

		it('channelTables filled with -1', () => {
			const state = new TrackerState(3);
			expect(state.channelTables).toEqual([-1, -1, -1]);
		});
	});

	describe('setTuningTable', () => {
		it('sets currentTuningTable', () => {
			const state = new TrackerState();
			const table = [100, 200, 300];
			state.setTuningTable(table);
			expect(state.currentTuningTable).toBe(table);
		});
	});

	describe('updateSamplesPerTick', () => {
		it('sets samplesPerTick from sampleRate / intFrequency', () => {
			const state = new TrackerState();
			state.intFrequency = 50;
			state.updateSamplesPerTick(44100);
			expect(state.samplesPerTick).toBe(882);
		});

		it('sets tickStep to intFrequency / sampleRate', () => {
			const state = new TrackerState();
			state.intFrequency = 50;
			state.updateSamplesPerTick(1000);
			expect(state.tickStep).toBe(0.05);
		});
	});

	describe('setPattern', () => {
		it('sets currentPattern and optional patternOrderIndex', () => {
			const state = new TrackerState();
			const pattern = { id: 0, length: 64, channels: [] };
			state.setPattern(pattern, 2);
			expect(state.currentPattern).toBe(pattern);
			expect(state.currentPatternOrderIndex).toBe(2);
		});

		it('clamps currentRow when pattern is shorter', () => {
			const state = new TrackerState();
			state.currentRow = 100;
			const pattern = { id: 0, length: 32, channels: [] };
			state.setPattern(pattern);
			expect(state.currentRow).toBe(31);
		});

		it('when orderIndex undefined, does not change currentPatternOrderIndex', () => {
			const state = new TrackerState();
			state.currentPatternOrderIndex = 5;
			state.setPattern({ id: 0, length: 64, channels: [] });
			expect(state.currentPatternOrderIndex).toBe(5);
		});
	});

	describe('setSpeed', () => {
		it('sets currentSpeed', () => {
			const state = new TrackerState();
			state.setSpeed(6);
			expect(state.currentSpeed).toBe(6);
		});
	});

	describe('setPatternOrder', () => {
		it('sets patternOrder', () => {
			const state = new TrackerState();
			state.setPatternOrder([0, 1, 0]);
			expect(state.patternOrder).toEqual([0, 1, 0]);
		});

		it('sets loopPointId when provided', () => {
			const state = new TrackerState();
			state.setPatternOrder([0, 1, 2], 2);
			expect(state.loopPointId).toBe(2);
		});
	});

	describe('setTables', () => {
		it('sets tables and builds tablesById by id', () => {
			const state = new TrackerState();
			const t0 = { id: 0, rows: [], loop: 0, name: 'T0' };
			const t1 = { id: 1, rows: [], loop: 0, name: 'T1' };
			state.setTables([t0, t1]);
			expect(state.tables).toHaveLength(2);
			expect(state.tablesById[0]).toBe(t0);
			expect(state.tablesById[1]).toBe(t1);
		});

		it('getTable returns table by id', () => {
			const state = new TrackerState();
			const t0 = { id: 0, rows: [], loop: 0, name: 'T0' };
			state.setTables([t0]);
			expect(state.getTable(0)).toBe(t0);
			expect(state.getTable(99)).toBeUndefined();
		});
	});

	describe('setIntFrequency', () => {
		it('sets intFrequency and calls updateSamplesPerTick', () => {
			const state = new TrackerState();
			state.updateSamplesPerTick(1000);
			state.setIntFrequency(100, 1000);
			expect(state.intFrequency).toBe(100);
			expect(state.samplesPerTick).toBe(10);
		});
	});

	describe('advancePosition', () => {
		it('increments currentTick', () => {
			const state = new TrackerState();
			state.currentSpeed = 2;
			state.currentPattern = { length: 64, channels: [] };
			state.patternOrder = [0];
			state.currentTick = 0;
			const wrapped = state.advancePosition();
			expect(state.currentTick).toBe(1);
			expect(wrapped).toBe(false);
		});

		it('when tick reaches speed, resets tick and increments row', () => {
			const state = new TrackerState();
			state.currentSpeed = 2;
			state.currentPattern = { length: 64, channels: [] };
			state.patternOrder = [0];
			state.currentTick = 1;
			state.advancePosition();
			expect(state.currentTick).toBe(0);
			expect(state.currentRow).toBe(1);
		});

		it('when row reaches pattern length, wraps row and increments pattern order', () => {
			const state = new TrackerState();
			state.currentSpeed = 1;
			state.currentPattern = { length: 2, channels: [] };
			state.patternOrder = [0, 1];
			state.currentRow = 1;
			state.currentTick = 1;
			const wrapped = state.advancePosition();
			expect(state.currentRow).toBe(0);
			expect(state.currentPatternOrderIndex).toBe(1);
			expect(wrapped).toBe(true);
		});

		it('when pattern order reaches end, wraps to loopPointId', () => {
			const state = new TrackerState();
			state.currentSpeed = 1;
			state.currentPattern = { length: 2, channels: [] };
			state.patternOrder = [0, 1, 2];
			state.loopPointId = 1;
			state.currentPatternOrderIndex = 2;
			state.currentRow = 1;
			state.currentTick = 1;
			state.advancePosition();
			expect(state.currentPatternOrderIndex).toBe(1);
		});

		it('falls back to 0 when loopPointId is invalid', () => {
			const state = new TrackerState();
			state.currentSpeed = 1;
			state.currentPattern = { length: 2, channels: [] };
			state.patternOrder = [0, 1, 2];
			state.loopPointId = 99;
			state.currentPatternOrderIndex = 2;
			state.currentRow = 1;
			state.currentTick = 1;
			state.advancePosition();
			expect(state.currentPatternOrderIndex).toBe(0);
		});
	});

	describe('reset', () => {
		it('resets playback state but not pattern/tables', () => {
			const state = new TrackerState();
			state.currentRow = 10;
			state.currentTick = 2;
			state.channelPatternVolumes[0] = 0;
			state.channelTables[0] = 1;
			state.setPattern({ id: 0, length: 64, channels: [] });
			state.setTables([{ id: 0, rows: [], loop: 0, name: 'T' }]);
			state.reset();
			expect(state.currentRow).toBe(0);
			expect(state.currentTick).toBe(0);
			expect(state.channelPatternVolumes).toEqual([15, 15, 15]);
			expect(state.channelTables).toEqual([-1, -1, -1]);
			expect(state.currentPattern).not.toBeNull();
			expect(state.tables).toHaveLength(1);
		});
	});
});
