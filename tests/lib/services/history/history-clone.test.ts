import { describe, expect, it } from 'vitest';
import { Instrument } from '@/lib/models/song';
import { HistoryClone } from '@/lib/services/history/history-clone';

describe('HistoryClone.instrument', () => {
	it('copies sample data for AY instruments', () => {
		const source = Object.assign(new Instrument('01', 'Hit', 'ay'), {
			sampleData: [9, 8, 7],
			sampleRate: 11025,
			sampleStart: 0,
			sampleEnd: 2,
			sampleLoopStart: 1,
			sampleLoopEnabled: true
		});
		const cloned = HistoryClone.instrument(source) as Instrument & {
			sampleData?: number[];
			sampleRate?: number;
			sampleLoopStart?: number;
		};

		expect(cloned).toBeInstanceOf(Instrument);
		expect(cloned.sampleData).toEqual([9, 8, 7]);
		expect(cloned.sampleData).not.toBe(source.sampleData);
		expect(cloned.sampleRate).toBe(11025);
		expect(cloned.sampleLoopStart).toBe(1);

		cloned.sampleData![0] = 0;
		expect(source.sampleData[0]).toBe(9);
	});

	it('copies sample data for NES instruments', () => {
		const source = Object.assign(new Instrument('02', 'Kick', 'nes'), {
			sampleData: [1, 2],
			sampleRate: 33144,
			sampleStart: 0,
			sampleEnd: 1,
			sampleLoopStart: 0
		});
		const cloned = HistoryClone.instrument(source) as Instrument & { sampleData?: number[] };

		expect(cloned.chipType).toBe('nes');
		expect(cloned.sampleData).toEqual([1, 2]);
		expect(cloned.sampleData).not.toBe(source.sampleData);
	});
});
