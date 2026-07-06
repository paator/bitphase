import { describe, expect, it } from 'vitest';
import {
	advanceNesSweepTable,
	isNesSweepDownTableEffect,
	isNesSweepDownEffect,
	isNesSweepEffect,
	isNesSweepUpTableEffect,
	isNesSweepUpEffect,
	parseNesSweepEffectParameter,
	processNesSweepEffect,
	resetNesChannelSweepOverride
} from '../../public/nes/nes-sweep-effect.js';
import { buildSquareSweepReg, NES_SQUARE_SWEEP_DISABLED } from '../../public/nes/nes-instrument-utils.js';

function createState(tables = []) {
	return {
		channelKeyOn: [false, false, false, false, false],
		channelSweepOverrideActive: [false, false, false, false, false],
		channelSweepOverrideReg: [0x08, 0x08, 0x08, 0x08, 0x08],
		channelSweepTableMode: [false, false, false, false, false],
		channelSweepTableIndex: [-1, -1, -1, -1, -1],
		channelSweepTablePosition: [0, 0, 0, 0, 0],
		channelSweepDown: [false, false, false, false, false],
		channelSweepTableTick: [false, false, false, false, false],
		channelEffectTables: [-1, -1, -1, -1, -1],
		getTable(id) {
			return tables[id] ?? null;
		}
	};
}

describe('nes-sweep-effect', () => {
	it('recognizes E2 and E3 effects', () => {
		const up = { effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x47 };
		const down = { effect: 'E'.charCodeAt(0), delay: 3, parameter: 0x17 };
		expect(isNesSweepUpEffect(up)).toBe(true);
		expect(isNesSweepDownEffect(up)).toBe(false);
		expect(isNesSweepDownEffect(down)).toBe(true);
		expect(isNesSweepEffect(up)).toBe(true);
		expect(isNesSweepEffect(down)).toBe(true);
		expect(isNesSweepUpEffect({ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x47 })).toBe(
			false
		);
	});

	it('recognizes E2TX and E3TX table effects', () => {
		const upTable = { effect: 'E'.charCodeAt(0), delay: 2, parameter: 0, tableIndex: 0 };
		const downTable = { effect: 'E'.charCodeAt(0), delay: 3, parameter: 0, tableIndex: 1 };
		expect(isNesSweepUpTableEffect(upTable)).toBe(true);
		expect(isNesSweepDownTableEffect(downTable)).toBe(true);
		expect(isNesSweepDownTableEffect({ ...upTable, delay: 2 })).toBe(false);
	});

	it('parses sweep parameter nibbles', () => {
		expect(parseNesSweepEffectParameter(0x47)).toEqual({ rate: 4, shift: 7 });
		expect(parseNesSweepEffectParameter(0x00)).toEqual({ rate: 0, shift: 0 });
		expect(parseNesSweepEffectParameter(0xf8)).toEqual({ rate: 7, shift: 7 });
	});

	it('enables sweep up override from E2XY', () => {
		const state = createState();
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x47 }]
		});
		expect(state.channelSweepOverrideActive[0]).toBe(true);
		expect(state.channelSweepTableMode[0]).toBe(false);
		expect(state.channelSweepOverrideReg[0]).toBe(buildSquareSweepReg(true, 4, 7));
		expect(state.channelKeyOn[0]).toBe(true);
	});

	it('enables sweep down override from E3XY', () => {
		const state = createState();
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0x17 }]
		});
		expect(state.channelSweepOverrideActive[0]).toBe(true);
		expect(state.channelSweepDown[0]).toBe(true);
		expect(state.channelSweepOverrideReg[0]).toBe(buildSquareSweepReg(true, 1, -7));
	});

	it('initializes sweep up table mode from E2TX', () => {
		const state = createState([{ rows: [0x23, 0x47], loop: 0 }]);
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0, tableIndex: 0 }]
		});
		expect(state.channelSweepOverrideActive[0]).toBe(true);
		expect(state.channelSweepTableMode[0]).toBe(true);
		expect(state.channelSweepDown[0]).toBe(false);
		expect(state.channelSweepOverrideReg[0]).toBe(buildSquareSweepReg(true, 2, 3));
		expect(state.channelEffectTables[0]).toBe(-1);
	});

	it('advances sweep table each tick with loop', () => {
		const state = createState([{ rows: [0x23, 0x47], loop: 1 }]);
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0, tableIndex: 0 }]
		});

		advanceNesSweepTable(state);
		expect(state.channelSweepTablePosition[0]).toBe(1);
		expect(state.channelSweepOverrideReg[0]).toBe(buildSquareSweepReg(true, 4, -7));
		expect(state.channelSweepTableTick[0]).toBe(true);
		expect(state.channelKeyOn?.[0]).not.toBe(true);

		advanceNesSweepTable(state);
		expect(state.channelSweepTablePosition[0]).toBe(1);
		expect(state.channelSweepOverrideReg[0]).toBe(buildSquareSweepReg(true, 4, -7));
		expect(state.channelSweepTableTick[0]).toBe(true);
	});

	it('does not advance fixed E2XY sweep', () => {
		const state = createState();
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x47 }]
		});
		advanceNesSweepTable(state);
		expect(state.channelSweepOverrideReg[0]).toBe(buildSquareSweepReg(true, 4, 7));
	});

	it('disables sweep when shift is zero', () => {
		const state = createState();
		state.channelSweepOverrideActive[0] = true;
		state.channelSweepOverrideReg[0] = buildSquareSweepReg(true, 4, 3);
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x40 }]
		});
		expect(state.channelSweepOverrideActive[0]).toBe(false);
		expect(state.channelSweepOverrideReg[0]).toBe(NES_SQUARE_SWEEP_DISABLED);
	});

	it('disables sweep for table rows with zero shift without leaving table mode', () => {
		const state = createState([{ rows: [0x40], loop: 0 }]);
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0, tableIndex: 0 }]
		});
		expect(state.channelSweepTableMode[0]).toBe(true);
		expect(state.channelSweepOverrideReg[0]).toBe(NES_SQUARE_SWEEP_DISABLED);
	});

	it('persists through other effects', () => {
		const state = createState();
		state.channelSweepOverrideActive[0] = true;
		state.channelSweepTableMode[0] = true;
		state.channelSweepOverrideReg[0] = buildSquareSweepReg(true, 2, 2);
		processNesSweepEffect(state, 0, {
			effects: [{ effect: 1, delay: 0, parameter: 0 }]
		});
		expect(state.channelSweepOverrideActive[0]).toBe(true);
		expect(state.channelSweepTableMode[0]).toBe(true);
	});

	it('persists override on empty rows', () => {
		const state = createState();
		state.channelSweepOverrideActive[0] = true;
		state.channelSweepOverrideReg[0] = buildSquareSweepReg(true, 2, 2);
		processNesSweepEffect(state, 0, { effects: [null] });
		expect(state.channelSweepOverrideActive[0]).toBe(true);
		resetNesChannelSweepOverride(state, 0);
		expect(state.channelSweepOverrideActive[0]).toBe(false);
	});
});
