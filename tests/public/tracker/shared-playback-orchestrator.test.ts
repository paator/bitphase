import { describe, expect, it } from 'vitest';
import {
	CATCH_UP_ROWS_PER_BLOCK,
	capIdleTickAccumulator,
	sharedPlaybackShouldHoldClock
} from '../../../public/tracker/shared-playback-orchestrator.js';

describe('capIdleTickAccumulator', () => {
	it('caps a grown accumulator while the clock is held', () => {
		expect(capIdleTickAccumulator(8.25, false)).toBe(1.0);
		expect(capIdleTickAccumulator(0.4, false)).toBe(0.4);
	});
});

describe('sharedPlaybackShouldHoldClock', () => {
	it('holds while any playing chip is still waiting for pattern data', () => {
		expect(sharedPlaybackShouldHoldClock(2, 1)).toBe(true);
		expect(sharedPlaybackShouldHoldClock(2, 0)).toBe(true);
	});

	it('does not hold when every playing chip has a pattern', () => {
		expect(sharedPlaybackShouldHoldClock(2, 2)).toBe(false);
		expect(sharedPlaybackShouldHoldClock(1, 1)).toBe(false);
		expect(sharedPlaybackShouldHoldClock(0, 0)).toBe(false);
	});
});

describe('CATCH_UP_ROWS_PER_BLOCK', () => {
	it('caps catch-up work per audio block', () => {
		expect(CATCH_UP_ROWS_PER_BLOCK).toBe(24);
	});
});
