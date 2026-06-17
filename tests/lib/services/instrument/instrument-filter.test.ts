import { describe, expect, it } from 'vitest';
import { Instrument } from '@/lib/models/song';
import {
	filterInstrumentsForChip,
	resolveInstrumentChipType
} from '@/lib/services/instrument/instrument-filter';

describe('instrument-filter', () => {
	it('defaults missing chipType to ay', () => {
		const instrument = new Instrument('01', []);
		expect(resolveInstrumentChipType(instrument)).toBe('ay');
	});

	it('filters instruments by chip type', () => {
		const instruments = [
			new Instrument('01', [], 0, 'AY', 'ay'),
			new Instrument('02', [], 0, 'NES', 'nes')
		];

		expect(filterInstrumentsForChip(instruments, 'ay').map((inst) => inst.id)).toEqual(['01']);
		expect(filterInstrumentsForChip(instruments, 'nes').map((inst) => inst.id)).toEqual(['02']);
	});
});
