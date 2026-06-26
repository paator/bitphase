import { describe, it, expect } from 'vitest';
import { PT3VolumeTable } from '../../public/tracker/pt3-volume-table.js';

describe('PT3VolumeTable', () => {
	it('is an array of 16 rows', () => {
		expect(PT3VolumeTable).toHaveLength(16);
	});

	it('each row has 16 elements', () => {
		for (let i = 0; i < PT3VolumeTable.length; i++) {
			expect(PT3VolumeTable[i]).toHaveLength(16);
		}
	});

	it('row 0 is all zeros', () => {
		expect(PT3VolumeTable[0]).toEqual([
			0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
		]);
	});

	it('row 15 is 0x00 to 0x0f', () => {
		expect(PT3VolumeTable[15]).toEqual([
			0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
			0x0e, 0x0f
		]);
	});

	it('values are non-decreasing along each row', () => {
		for (let row = 0; row < PT3VolumeTable.length; row++) {
			const r = PT3VolumeTable[row];
			for (let col = 1; col < r.length; col++) {
				expect(r[col]).toBeGreaterThanOrEqual(r[col - 1]);
			}
		}
	});

	it('values are in range 0-15', () => {
		for (let row = 0; row < PT3VolumeTable.length; row++) {
			for (let col = 0; col < PT3VolumeTable[row].length; col++) {
				const v = PT3VolumeTable[row][col];
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(15);
			}
		}
	});

	it('last column of each row equals row index', () => {
		for (let row = 0; row < PT3VolumeTable.length; row++) {
			expect(PT3VolumeTable[row][15]).toBe(row);
		}
	});
});
