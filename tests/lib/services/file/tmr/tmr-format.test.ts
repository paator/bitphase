import { describe, expect, it } from 'vitest';
import {
	decodeTimerFrequencyHz,
	encodeTimerFrequencyHz,
	timerFrequencyHzToPeriodTicks,
	timerPeriodTicksToFrequencyHz
} from '@/lib/services/file/tmr/tmr-format';

describe('tmr timer frequency encoding', () => {
	it('round-trips Hz through 16.16 fixed point', () => {
		const hz = timerPeriodTicksToFrequencyHz(1773400, 1000);
		expect(hz).toBeCloseTo(1773.4);
		const stored = encodeTimerFrequencyHz(hz);
		expect(decodeTimerFrequencyHz(stored)).toBeCloseTo(1773.4, 3);
		expect(timerFrequencyHzToPeriodTicks(1773400, decodeTimerFrequencyHz(stored))).toBe(1000);
	});

	it('stores zero for inherit or disabled timers', () => {
		expect(encodeTimerFrequencyHz(0)).toBe(0);
		expect(decodeTimerFrequencyHz(0)).toBe(0);
	});
});
