import { describe, expect, it } from 'vitest';
import {
	decodeTimerFrequencyHz,
	exportTimerFrequencyStoredFromYmPeriod,
	ymSidToneFrequencyHz
} from '@/lib/services/file/tmr/tmr-format';

describe('tmr export timer frequency', () => {
	it('exports YM SID tone rate from captured period', () => {
		const ymPeriod = 664;
		const chipFrequencyHz = 2_000_000;
		const toneHz = ymSidToneFrequencyHz(chipFrequencyHz, ymPeriod);
		const stored = exportTimerFrequencyStoredFromYmPeriod(ymPeriod, chipFrequencyHz);

		expect(toneHz).toBeCloseTo(chipFrequencyHz / (16 * ymPeriod));
		expect(decodeTimerFrequencyHz(stored)).toBeCloseTo(toneHz * 2);
	});

	it('returns zero for invalid period', () => {
		expect(exportTimerFrequencyStoredFromYmPeriod(0, 2_000_000)).toBe(0);
		expect(exportTimerFrequencyStoredFromYmPeriod(100, 0)).toBe(0);
	});
});
