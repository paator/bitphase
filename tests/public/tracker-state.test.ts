import { describe, it, expect } from 'vitest';
import TrackerState from '../../public/tracker/tracker-state.js';

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
			expect(state.timeline.patternOrder).toEqual([]);
			expect(state.timeline.currentPatternOrderIndex).toBe(0);
		});

		it('intFrequency 50, currentSpeed 3, currentRow 0, currentTick 0', () => {
			const state = new TrackerState();
			expect(state.timeline.intFrequency).toBe(50);
			expect(state.timeline.currentSpeed).toBe(3);
			expect(state.timeline.currentRow).toBe(0);
			expect(state.timeline.currentTick).toBe(0);
		});

		it('channelPatternVolumes filled with 15', () => {
			const state = new TrackerState(3);
			expect(state.channelPatternVolumes).toEqual([15, 15, 15]);
		});

		it('channelTables filled with -1', () => {
			const state = new TrackerState(3);
			expect(state.channelTables).toEqual([-1, -1, -1]);
		});

		it('gives each channel its own effect table slot map', () => {
			const state = new TrackerState(3);
			expect(state.channelEffectTableSlots).toHaveLength(3);
			state.channelEffectTableSlots[0].V = { tableIndex: 1 };
			expect(state.channelEffectTableSlots[1]).toEqual({});
			expect(state.channelEffectTableSlots[2]).toEqual({});
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
			state.timeline.intFrequency = 50;
			state.updateSamplesPerTick(44100);
			expect(state.timeline.samplesPerTick).toBe(882);
		});

		it('sets tickStep to intFrequency / sampleRate', () => {
			const state = new TrackerState();
			state.timeline.intFrequency = 50;
			state.updateSamplesPerTick(1000);
			expect(state.timeline.tickStep).toBe(0.05);
		});
	});

	describe('setPattern', () => {
		it('sets currentPattern and optional patternOrderIndex', () => {
			const state = new TrackerState();
			const pattern = { id: 0, length: 64, channels: [] };
			state.setPattern(pattern, 2);
			expect(state.currentPattern).toBe(pattern);
			expect(state.timeline.currentPatternOrderIndex).toBe(2);
		});

		it('clamps currentRow when pattern is shorter', () => {
			const state = new TrackerState();
			state.timeline.currentRow = 100;
			const pattern = { id: 0, length: 32, channels: [] };
			state.setPattern(pattern);
			expect(state.timeline.currentRow).toBe(31);
		});

		it('when orderIndex undefined, does not change currentPatternOrderIndex', () => {
			const state = new TrackerState();
			state.timeline.currentPatternOrderIndex = 5;
			state.setPattern({ id: 0, length: 64, channels: [] });
			expect(state.timeline.currentPatternOrderIndex).toBe(5);
		});
	});

	describe('setSpeed', () => {
		it('sets currentSpeed', () => {
			const state = new TrackerState();
			state.setSpeed(6);
			expect(state.timeline.currentSpeed).toBe(6);
		});
	});

	describe('publishPlaybackSpeed', () => {
		it('sets currentSpeed when speed is positive', () => {
			const state = new TrackerState();
			state.publishPlaybackSpeed(8);
			expect(state.timeline.currentSpeed).toBe(8);
		});

		it('ignores non-positive speed', () => {
			const state = new TrackerState();
			state.publishPlaybackSpeed(0);
			expect(state.timeline.currentSpeed).toBe(3);
		});
	});

	describe('setPatternOrder', () => {
		it('sets patternOrder', () => {
			const state = new TrackerState();
			state.setPatternOrder([0, 1, 0]);
			expect(state.timeline.patternOrder).toEqual([0, 1, 0]);
		});

		it('sets loopPointId when provided', () => {
			const state = new TrackerState();
			state.setPatternOrder([0, 1, 2], 2);
			expect(state.timeline.loopPointId).toBe(2);
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
			expect(state.timeline.intFrequency).toBe(100);
			expect(state.timeline.samplesPerTick).toBe(10);
		});
	});

	describe('advancePosition', () => {
		it('increments currentTick', () => {
			const state = new TrackerState();
			state.timeline.currentSpeed = 2;
			state.currentPattern = { length: 64, channels: [] };
			state.timeline.patternOrder = [0];
			state.timeline.currentTick = 0;
			const wrapped = state.advancePosition();
			expect(state.timeline.currentTick).toBe(1);
			expect(wrapped).toBe(false);
		});

		it('when tick reaches speed, resets tick and increments row', () => {
			const state = new TrackerState();
			state.timeline.currentSpeed = 2;
			state.currentPattern = { length: 64, channels: [] };
			state.timeline.patternOrder = [0];
			state.timeline.currentTick = 1;
			state.advancePosition();
			expect(state.timeline.currentTick).toBe(0);
			expect(state.timeline.currentRow).toBe(1);
		});

		it('when row reaches pattern length, wraps row and increments pattern order', () => {
			const state = new TrackerState();
			state.timeline.currentSpeed = 1;
			state.currentPattern = { length: 2, channels: [] };
			state.timeline.patternOrder = [0, 1];
			state.timeline.currentRow = 1;
			state.timeline.currentTick = 1;
			const wrapped = state.advancePosition();
			expect(state.timeline.currentRow).toBe(0);
			expect(state.timeline.currentPatternOrderIndex).toBe(1);
			expect(wrapped).toBe(true);
		});

		it('when pattern order reaches end, wraps to loopPointId', () => {
			const state = new TrackerState();
			state.timeline.currentSpeed = 1;
			state.currentPattern = { length: 2, channels: [] };
			state.timeline.patternOrder = [0, 1, 2];
			state.timeline.loopPointId = 1;
			state.timeline.currentPatternOrderIndex = 2;
			state.timeline.currentRow = 1;
			state.timeline.currentTick = 1;
			state.advancePosition();
			expect(state.timeline.currentPatternOrderIndex).toBe(1);
		});

		it('falls back to 0 when loopPointId is invalid', () => {
			const state = new TrackerState();
			state.timeline.currentSpeed = 1;
			state.currentPattern = { length: 2, channels: [] };
			state.timeline.patternOrder = [0, 1, 2];
			state.timeline.loopPointId = 99;
			state.timeline.currentPatternOrderIndex = 2;
			state.timeline.currentRow = 1;
			state.timeline.currentTick = 1;
			state.advancePosition();
			expect(state.timeline.currentPatternOrderIndex).toBe(0);
		});
	});

	describe('reset', () => {
		it('resets playback state but not pattern/tables', () => {
			const state = new TrackerState();
			state.timeline.currentRow = 10;
			state.timeline.currentTick = 2;
			state.channelPatternVolumes[0] = 0;
			state.channelTables[0] = 1;
			state.setPattern({ id: 0, length: 64, channels: [] });
			state.setTables([{ id: 0, rows: [], loop: 0, name: 'T' }]);
			state.reset();
			expect(state.timeline.currentRow).toBe(0);
			expect(state.timeline.currentTick).toBe(0);
			expect(state.channelPatternVolumes).toEqual([15, 15, 15]);
			expect(state.channelTables).toEqual([-1, -1, -1]);
			expect(state.channelEffectTableSlots).toEqual([{}, {}, {}]);
			expect(state.currentPattern).not.toBeNull();
			expect(state.tables).toHaveLength(1);
		});
	});
});
