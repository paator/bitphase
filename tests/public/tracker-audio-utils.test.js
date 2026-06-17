import { describe, expect, it } from 'vitest';
import {
	advanceInstrumentRowPosition,
	calculatePt3Volume,
	getEffectiveTuningPeriod
} from '../../public/tracker/tracker-audio-utils.js';

describe('tracker-audio-utils', () => {
	it('advances instrument rows with loop wrap', () => {
		expect(advanceInstrumentRowPosition(0, 4, 2)).toBe(1);
		expect(advanceInstrumentRowPosition(3, 4, 2)).toBe(2);
		expect(advanceInstrumentRowPosition(3, 4, 0)).toBe(0);
	});

	it('calculates PT3 volume from pattern and instrument columns', () => {
		expect(calculatePt3Volume(15, 15)).toBe(15);
		expect(calculatePt3Volume(0, 15)).toBe(0);
	});

	it('resolves effective tuning period with slide offsets', () => {
		const state = {
			channelCurrentNotes: [1, -1],
			currentTuningTable: [1000, 900],
			channelToneSliding: [10, 0],
			channelVibratoSliding: [5, 0],
			channelDetune: [-2, 0]
		};
		expect(getEffectiveTuningPeriod(state, 0, 2047)).toBe(913);
		expect(getEffectiveTuningPeriod(state, 1, 2047)).toBe(0);
	});
});
