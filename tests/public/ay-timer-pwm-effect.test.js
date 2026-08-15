import { describe, expect, it } from 'vitest';
import {
	AY_TIMER_PWM_OVERRIDE_INACTIVE,
	AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE,
	isAyAutoEnvelopeEffect,
	isAyTimerPwmEffect,
	isAyTimerPwmMaxEffect,
	isAyTimerPwmMinEffect,
	isAyTimerPwmShapeEffect,
	isAyTimerPwmStartEffect,
	isAyTimerPwmSweepEffect,
	isAyTimerPwmTableEffect,
	mapHexParameterToTimerPwmPercent,
	mapHexParameterToTimerPwmSweepShape,
	mapHexParameterToTimerPwmSweepStartPhase,
	mapTimerPwmPercentToHexParameter,
	advanceAyTimerPwmTables,
	processAyTimerPwmEffect,
	resetAyChannelTimerPwmOverrides,
	resolveChannelTimerPwmDuty,
	resolveChannelTimerPwmSweep,
	resolveChannelTimerPwmSweepMin,
	resolveChannelTimerPwmSweepShape,
	resolveChannelTimerPwmSweepStartPhase
} from '../../public/ay/ay-timer-pwm-effect.js';

function createState(tables = []) {
	return {
		channelTimerPwmDutyOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweepMinOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweepOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweepShapeOverride: [AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE],
		channelTimerPwmSweepStartPhaseOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweep: [-1],
		getTable(id) {
			return tables[id] ?? null;
		}
	};
}

describe('ay-timer-pwm-effect', () => {
	it('recognizes E1-E5 and ignores EA', () => {
		expect(
			isAyTimerPwmMinEffect({ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x80 })
		).toBe(true);
		expect(
			isAyTimerPwmMaxEffect({ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x9e })
		).toBe(true);
		expect(
			isAyTimerPwmSweepEffect({ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0x10 })
		).toBe(true);
		expect(
			isAyTimerPwmShapeEffect({ effect: 'E'.charCodeAt(0), delay: 4, parameter: 0x01 })
		).toBe(true);
		expect(
			isAyTimerPwmStartEffect({ effect: 'E'.charCodeAt(0), delay: 5, parameter: 0x80 })
		).toBe(true);
		expect(isAyTimerPwmEffect({ effect: 'E'.charCodeAt(0), delay: 0xa, parameter: 0x32 })).toBe(
			false
		);
		expect(isAyAutoEnvelopeEffect({ effect: 'E'.charCodeAt(0), delay: 0xa, parameter: 0x32 })).toBe(
			true
		);
	});

	it('maps hex 00-FF to 0-100 percent', () => {
		expect(mapHexParameterToTimerPwmPercent(0x00)).toBe(0);
		expect(mapHexParameterToTimerPwmPercent(0xff)).toBe(100);
		expect(mapHexParameterToTimerPwmPercent(0x80)).toBe(50);
		expect(mapHexParameterToTimerPwmPercent(0x9e)).toBe(62);
		expect(mapTimerPwmPercentToHexParameter(62)).toBe(0x9e);
	});

	it('maps E4 shape indices and E5 start phase', () => {
		expect(mapHexParameterToTimerPwmSweepShape(0)).toBe('triangle');
		expect(mapHexParameterToTimerPwmSweepShape(1)).toBe('sine');
		expect(mapHexParameterToTimerPwmSweepShape(2)).toBe('sawUp');
		expect(mapHexParameterToTimerPwmSweepShape(3)).toBe('sawDown');
		expect(mapHexParameterToTimerPwmSweepShape(4)).toBe('square');
		expect(mapHexParameterToTimerPwmSweepShape(5)).toBe('triangle');
		expect(mapHexParameterToTimerPwmSweepStartPhase(0)).toBe(0);
		expect(mapHexParameterToTimerPwmSweepStartPhase(0xff)).toBe(1000);
		expect(mapHexParameterToTimerPwmSweepStartPhase(0x80)).toBe(502);
	});

	it('stores E1-E5 overrides', () => {
		const state = createState();
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x80 }]
		});
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x9e }]
		});
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0x10 }]
		});
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 4, parameter: 0x01 }]
		});
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 5, parameter: 0x80 }]
		});

		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(50);
		expect(state.channelTimerPwmDutyOverride[0]).toBe(62);
		expect(state.channelTimerPwmSweepOverride[0]).toBe(6);
		expect(state.channelTimerPwmSweepShapeOverride[0]).toBe('sine');
		expect(state.channelTimerPwmSweepStartPhaseOverride[0]).toBe(502);
		expect(state.channelTimerPwmSweep[0]).toBe(502);
	});

	it('applies two timer pwm commands on the same row', () => {
		const state = createState();
		processAyTimerPwmEffect(state, 0, {
			effects: [
				{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x80 },
				{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x9e }
			]
		});

		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(50);
		expect(state.channelTimerPwmDutyOverride[0]).toBe(62);
	});

	it('resolves instrument values when overrides are inactive', () => {
		const state = createState();
		expect(resolveChannelTimerPwmDuty(state, 0, 40)).toBe(40);
		expect(resolveChannelTimerPwmSweep(state, 0, 7)).toBe(7);
		expect(resolveChannelTimerPwmSweepMin(state, 0, 12, 40)).toBe(12);
		expect(resolveChannelTimerPwmSweepShape(state, 0, 'triangle')).toBe('triangle');
		expect(resolveChannelTimerPwmSweepStartPhase(state, 0, 250)).toBe(250);
	});

	it('clamps min override to max duty', () => {
		const state = createState();
		state.channelTimerPwmSweepMinOverride[0] = 80;
		expect(resolveChannelTimerPwmSweepMin(state, 0, 0, 50)).toBe(50);
	});

	it('resets overrides on note off', () => {
		const state = createState();
		state.channelTimerPwmDutyOverride[0] = 62;
		state.channelTimerPwmSweepMinOverride[0] = 10;
		state.channelTimerPwmSweepOverride[0] = 4;
		state.channelTimerPwmSweepShapeOverride[0] = 'sine';
		state.channelTimerPwmSweepStartPhaseOverride[0] = 500;
		resetAyChannelTimerPwmOverrides(state, 0);
		expect(state.channelTimerPwmDutyOverride[0]).toBe(AY_TIMER_PWM_OVERRIDE_INACTIVE);
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(AY_TIMER_PWM_OVERRIDE_INACTIVE);
		expect(state.channelTimerPwmSweepOverride[0]).toBe(AY_TIMER_PWM_OVERRIDE_INACTIVE);
		expect(state.channelTimerPwmSweepShapeOverride[0]).toBe(AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE);
		expect(state.channelTimerPwmSweepStartPhaseOverride[0]).toBe(AY_TIMER_PWM_OVERRIDE_INACTIVE);
	});

	it('recognizes E1TX-E5TX table effects', () => {
		const tableEffect = {
			effect: 'E'.charCodeAt(0),
			delay: 1,
			parameter: 0,
			tableIndex: 0
		};
		expect(isAyTimerPwmTableEffect(tableEffect)).toBe(true);
		expect(isAyTimerPwmTableEffect({ ...tableEffect, delay: 5 })).toBe(true);
		expect(isAyTimerPwmTableEffect({ ...tableEffect, tableIndex: -1 })).toBe(false);
		expect(isAyTimerPwmTableEffect({ ...tableEffect, delay: 0xa })).toBe(false);
	});

	it('initializes table mode from E1TX and advances each tick', () => {
		const state = createState([{ rows: [0x80, 0xff, 0x00], loop: 1 }]);
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0, tableIndex: 0 }]
		});
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(50);
		expect(state.channelTimerPwmTableIndex[0][0]).toBe(0);
		expect(state.channelTimerPwmTablePosition[0][0]).toBe(0);

		advanceAyTimerPwmTables(state);
		expect(state.channelTimerPwmTablePosition[0][0]).toBe(1);
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(100);

		advanceAyTimerPwmTables(state);
		expect(state.channelTimerPwmTablePosition[0][0]).toBe(2);
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(0);

		advanceAyTimerPwmTables(state);
		expect(state.channelTimerPwmTablePosition[0][0]).toBe(1);
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(100);
	});

	it('automates E2-E5 independently from separate tables', () => {
		const state = createState([
			{ rows: [0x9e, 0xff], loop: 0 },
			{ rows: [0x10, 0x20], loop: 0 }
		]);
		processAyTimerPwmEffect(state, 0, {
			effects: [
				{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0, tableIndex: 0 },
				{ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0, tableIndex: 1 }
			]
		});
		expect(state.channelTimerPwmDutyOverride[0]).toBe(62);
		expect(state.channelTimerPwmSweepOverride[0]).toBe(6);

		advanceAyTimerPwmTables(state);
		expect(state.channelTimerPwmDutyOverride[0]).toBe(100);
		expect(state.channelTimerPwmSweepOverride[0]).toBe(13);
	});

	it('fixed E1XY stops min table mode without touching other slots', () => {
		const state = createState([{ rows: [0x80, 0xff], loop: 0 }]);
		processAyTimerPwmEffect(state, 0, {
			effects: [
				{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0, tableIndex: 0 },
				{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0, tableIndex: 0 }
			]
		});
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x40 }]
		});
		expect(state.channelTimerPwmTableIndex[0][0]).toBe(-1);
		expect(state.channelTimerPwmTableIndex[0][1]).toBe(0);
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(25);
	});

	it('does not advance fixed E1XY', () => {
		const state = createState();
		processAyTimerPwmEffect(state, 0, {
			effects: [{ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x80 }]
		});
		advanceAyTimerPwmTables(state);
		expect(state.channelTimerPwmSweepMinOverride[0]).toBe(50);
	});
});
