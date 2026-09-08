import { describe, expect, it } from 'vitest';
import { psgReferenceFilenames } from './demo-dump-cases';

describe('psgReferenceFilenames', () => {
	it('uses a single file for one AY song', () => {
		expect(psgReferenceFilenames('man', 1)).toEqual(['man.psg']);
	});

	it('numbers files for multi-AY projects', () => {
		expect(psgReferenceFilenames('marina', 2)).toEqual(['marina_ay1.psg', 'marina_ay2.psg']);
	});
});
