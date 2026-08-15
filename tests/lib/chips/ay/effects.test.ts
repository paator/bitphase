import { describe, expect, it } from 'vitest';
import {
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
	mapTimerPwmPercentToHexParameter
} from '@/lib/chips/ay/effects';

describe('ay effects helpers', () => {
	it('detects timer pwm and auto-envelope subcommands', () => {
		expect(isAyTimerPwmMinEffect({ effect: 'E'.charCodeAt(0), delay: 1 })).toBe(true);
		expect(isAyTimerPwmMaxEffect({ effect: 'E'.charCodeAt(0), delay: 2 })).toBe(true);
		expect(isAyTimerPwmSweepEffect({ effect: 'E'.charCodeAt(0), delay: 3 })).toBe(true);
		expect(isAyTimerPwmShapeEffect({ effect: 'E'.charCodeAt(0), delay: 4 })).toBe(true);
		expect(isAyTimerPwmStartEffect({ effect: 'E'.charCodeAt(0), delay: 5 })).toBe(true);
		expect(isAyTimerPwmEffect({ effect: 'E'.charCodeAt(0), delay: 0xa })).toBe(false);
		expect(isAyAutoEnvelopeEffect({ effect: 'E'.charCodeAt(0), delay: 0xa })).toBe(true);
	});

	it('maps hex parameters onto percents, shapes, and start phase', () => {
		expect(mapHexParameterToTimerPwmPercent(0)).toBe(0);
		expect(mapHexParameterToTimerPwmPercent(255)).toBe(100);
		expect(mapHexParameterToTimerPwmPercent(0x80)).toBe(50);
		expect(mapHexParameterToTimerPwmPercent(0x9e)).toBe(62);
		expect(mapTimerPwmPercentToHexParameter(0)).toBe(0);
		expect(mapTimerPwmPercentToHexParameter(100)).toBe(0xff);
		expect(mapTimerPwmPercentToHexParameter(50)).toBe(0x80);
		expect(mapHexParameterToTimerPwmPercent(mapTimerPwmPercentToHexParameter(75))).toBe(75);
		expect(mapHexParameterToTimerPwmSweepShape(0)).toBe('triangle');
		expect(mapHexParameterToTimerPwmSweepShape(1)).toBe('sine');
		expect(mapHexParameterToTimerPwmSweepShape(5)).toBe('triangle');
		expect(mapHexParameterToTimerPwmSweepStartPhase(0)).toBe(0);
		expect(mapHexParameterToTimerPwmSweepStartPhase(255)).toBe(1000);
	});
});
