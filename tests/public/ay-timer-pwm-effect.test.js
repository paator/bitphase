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
	mapHexParameterToTimerPwmPercent,
	mapHexParameterToTimerPwmSweepShape,
	mapHexParameterToTimerPwmSweepStartPhase,
	mapTimerPwmPercentToHexParameter,
	processAyTimerPwmEffect,
	resetAyChannelTimerPwmOverrides,
	resolveChannelTimerPwmDuty,
	resolveChannelTimerPwmSweep,
	resolveChannelTimerPwmSweepMin,
	resolveChannelTimerPwmSweepShape,
	resolveChannelTimerPwmSweepStartPhase
} from '../../public/ay/ay-timer-pwm-effect.js';

function createState() {
	return {
		channelTimerPwmDutyOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweepMinOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweepOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweepShapeOverride: [AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE],
		channelTimerPwmSweepStartPhaseOverride: [AY_TIMER_PWM_OVERRIDE_INACTIVE],
		channelTimerPwmSweep: [-1]
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
});
