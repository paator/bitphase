import { describe, expect, it } from 'vitest';
import { createTempoRowClock } from '../../../../src/lib/services/playback/tempo-row-frames';

function rowLengths(tempo: number, hz: number, speeds: number[]): number[] {
	const clock = createTempoRowClock(tempo, hz);
	return speeds.map((speed) => clock.framesForSpeed(speed));
}

describe('tempo row frames', () => {
	it('keeps one frame per speed tick when tempo is off', () => {
		expect(rowLengths(0, 60, [6, 6, 6, 6])).toEqual([6, 6, 6, 6]);
	});

	it('matches the NTSC 125 clock for speeds 6, 4 and 2', () => {
		expect(rowLengths(125, 60, [6, 6, 6, 6, 6])).toEqual([8, 7, 7, 7, 7]);
		expect(rowLengths(125, 60, [4, 4, 4, 4, 4])).toEqual([5, 5, 5, 5, 4]);
		expect(rowLengths(125, 60, [2, 2, 2, 2, 2])).toEqual([3, 2, 3, 2, 2]);
	});

	it('keeps the accumulator when speed changes', () => {
		expect(rowLengths(125, 60, [6, 4, 4, 4])).toEqual([8, 5, 5, 4]);
	});

	it('uses exact speed frames at the default tempo for that rate', () => {
		expect(rowLengths(150, 60, [6, 6, 6])).toEqual([6, 6, 6]);
		expect(rowLengths(125, 50, [6, 6, 6])).toEqual([6, 6, 6]);
	});

	it('keeps the real interrupt rate in the divider', () => {
		expect(rowLengths(125, 48.828, [6, 6, 6, 6, 6, 6, 6, 6])).not.toEqual(
			rowLengths(125, 49, [6, 6, 6, 6, 6, 6, 6, 6])
		);
	});

	it('turns frames into seconds at the interrupt rate', () => {
		const clock = createTempoRowClock(150, 60);
		expect(clock.secondsForSpeed(6)).toBeCloseTo(0.1);
	});
});
