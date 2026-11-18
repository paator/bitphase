import { describe, expect, it } from 'vitest';
import {
	describeWavRender,
	exportProgressRow,
	exportRowTotal,
	renderSampleLimit
} from '@/lib/services/file/wav/render-sample-limit';

describe('render sample limit', () => {
	it('allows a song longer than five minutes', () => {
		const fiveMinutes = 44100 * 300;
		const limit = renderSampleLimit(44100, 3824, 1, 50);
		expect(limit).toBeGreaterThan(fiveMinutes);
		expect(limit).toBeGreaterThan(44100 * 324);
	});

	it('counts loop repeats in the export total', () => {
		expect(exportRowTotal(3450, 3450, 1)).toBe(3450);
		expect(exportRowTotal(3450, 3450, 2)).toBe(6900);
		expect(exportRowTotal(3450, 2000, 2)).toBe(5450);
	});

	it('keeps the rendered row count moving through a loop', () => {
		const wholeSong = { firstPassRows: 3450, loopSegmentRows: 3450 };
		expect(exportProgressRow(3400, 0, wholeSong)).toBe(3400);
		expect(exportProgressRow(0, 1, wholeSong)).toBe(3450);
		expect(exportProgressRow(12, 1, wholeSong)).toBe(3462);

		const midLoop = { firstPassRows: 3450, loopSegmentRows: 2000 };
		expect(exportProgressRow(1500, 1, midLoop)).toBe(3500);
		expect(describeWavRender(0, 1, 6900, wholeSong)).toEqual({
			value: 75,
			message: 'Rendering... 3450/6900 rows'
		});
	});
});
