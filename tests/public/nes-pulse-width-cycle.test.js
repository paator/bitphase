import { describe, expect, it } from 'vitest';
import {
	advanceNesPulseWidthTable,
	isNesPulseWidthCycleEffect,
	isNesPulseWidthTableEffect,
	normalizeNesPulseWidthIndex,
	processNesPulseWidthCycleEffect,
	resetNesChannelPulseWidthCycle
} from '../../public/nes/nes-pulse-width-cycle.js';

function createState(tables = []) {
	return {
		channelPulseWidthCycleActive: [false, false, false, false, false],
		channelPulseWidthCurrent: [0, 0, 0, 0, 0],
		channelPulseWidthTableMode: [false, false, false, false, false],
		channelPulseWidthTableIndex: [-1, -1, -1, -1, -1],
		channelPulseWidthTablePosition: [0, 0, 0, 0, 0],
		channelEffectTables: [-1, -1, -1, -1, -1],
		getTable(id) {
			return tables[id] ?? null;
		}
	};
}

describe('nes-pulse-width-cycle', () => {
	it('recognizes E1XY effect', () => {
		expect(
			isNesPulseWidthCycleEffect({
				effect: 'E'.charCodeAt(0),
				delay: 1,
				parameter: 0x02
			})
		).toBe(true);
		expect(
			isNesPulseWidthCycleEffect({
				effect: 'E'.charCodeAt(0),
				delay: 0xa,
				parameter: 0x32
			})
		).toBe(false);
	});

	it('recognizes E1TX table effect', () => {
		const effect = {
			effect: 'E'.charCodeAt(0),
			delay: 1,
			parameter: 0,
			tableIndex: 0
		};
		expect(isNesPulseWidthTableEffect(effect)).toBe(true);
		expect(isNesPulseWidthTableEffect({ ...effect, tableIndex: -1 })).toBe(false);
	});

	it('normalizes pulse width indices', () => {
		expect(normalizeNesPulseWidthIndex(0)).toBe(0);
		expect(normalizeNesPulseWidthIndex(3)).toBe(3);
		expect(normalizeNesPulseWidthIndex(7)).toBe(3);
	});

	it('initializes fixed pulse width from E1XY', () => {
		const state = createState();
		processNesPulseWidthCycleEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x02 }]
		});
		expect(state.channelPulseWidthCycleActive[0]).toBe(true);
		expect(state.channelPulseWidthTableMode[0]).toBe(false);
		expect(state.channelPulseWidthCurrent[0]).toBe(2);
	});

	it('initializes table mode from E1TX', () => {
		const state = createState([{ rows: [0, 2, 3], loop: 1 }]);
		processNesPulseWidthCycleEffect(state, 0, {
			effects: [
				{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0, tableIndex: 0 }
			]
		});
		expect(state.channelPulseWidthCycleActive[0]).toBe(true);
		expect(state.channelPulseWidthTableMode[0]).toBe(true);
		expect(state.channelPulseWidthTableIndex[0]).toBe(0);
		expect(state.channelPulseWidthTablePosition[0]).toBe(0);
		expect(state.channelPulseWidthCurrent[0]).toBe(0);
		expect(state.channelEffectTables[0]).toBe(-1);
	});

	it('advances table pulse width each tick with loop', () => {
		const state = createState([{ rows: [0, 2, 3], loop: 1 }]);
		processNesPulseWidthCycleEffect(state, 0, {
			effects: [
				{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0, tableIndex: 0 }
			]
		});

		advanceNesPulseWidthTable(state);
		expect(state.channelPulseWidthTablePosition[0]).toBe(1);
		expect(state.channelPulseWidthCurrent[0]).toBe(2);

		advanceNesPulseWidthTable(state);
		expect(state.channelPulseWidthTablePosition[0]).toBe(2);
		expect(state.channelPulseWidthCurrent[0]).toBe(3);

		advanceNesPulseWidthTable(state);
		expect(state.channelPulseWidthTablePosition[0]).toBe(1);
		expect(state.channelPulseWidthCurrent[0]).toBe(2);
	});

	it('does not advance fixed E1XY pulse width', () => {
		const state = createState();
		processNesPulseWidthCycleEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x03 }]
		});
		advanceNesPulseWidthTable(state);
		expect(state.channelPulseWidthCurrent[0]).toBe(3);
	});

	it('resets on explicit non-E1 effect', () => {
		const state = createState([{ rows: [1, 2], loop: 0 }]);
		state.channelPulseWidthCycleActive[0] = true;
		state.channelPulseWidthTableMode[0] = true;
		state.channelPulseWidthTableIndex[0] = 0;
		state.channelPulseWidthCurrent[0] = 2;
		processNesPulseWidthCycleEffect(state, 0, {
			effects: [{ effect: 1, delay: 1, parameter: 5 }]
		});
		expect(state.channelPulseWidthCycleActive[0]).toBe(false);
		expect(state.channelPulseWidthTableMode[0]).toBe(false);
		expect(state.channelPulseWidthCurrent[0]).toBe(0);
	});

	it('keeps fixed pulse width until reset', () => {
		const state = createState();
		state.channelPulseWidthCycleActive[0] = true;
		state.channelPulseWidthCurrent[0] = 2;
		processNesPulseWidthCycleEffect(state, 0, {
			effects: [null]
		});
		expect(state.channelPulseWidthCycleActive[0]).toBe(true);
		expect(state.channelPulseWidthCurrent[0]).toBe(2);
		resetNesChannelPulseWidthCycle(state, 0);
		expect(state.channelPulseWidthCycleActive[0]).toBe(false);
	});
});
