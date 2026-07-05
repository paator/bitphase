import { describe, expect, it } from 'vitest';
import {
	createNextRow,
	resizeRowList
} from '@/lib/components/RowEditorTable/row-list-operations';

describe('row-list-operations', () => {
	it('createNextRow clones the previous row', () => {
		const rows = [{ volume: 10, tone: true }];
		const next = createNextRow(rows, () => ({ volume: 0, tone: false }));
		expect(next).toEqual({ volume: 10, tone: true });
		expect(next).not.toBe(rows[0]);
	});

	it('createNextRow falls back to factory when rows are empty', () => {
		expect(createNextRow([], () => ({ volume: 0, tone: false }))).toEqual({
			volume: 0,
			tone: false
		});
	});

	it('resizeRowList clones the last row when expanding', () => {
		const rows = [{ volume: 7 }];
		const next = resizeRowList(rows, 3, () => ({ volume: 0 }), 512);
		expect(next).toEqual([{ volume: 7 }, { volume: 7 }, { volume: 7 }]);
		expect(next[1]).not.toBe(rows[0]);
		expect(next[2]).not.toBe(rows[0]);
	});

	it('resizeRowList deep-clones nested arrays', () => {
		const waveform = [15, 0];
		const rows = [{ timerWaveform: waveform }];
		const next = resizeRowList(rows, 2, () => ({ timerWaveform: [0] }), 512);
		expect(next[1].timerWaveform).toEqual([15, 0]);
		expect(next[1].timerWaveform).not.toBe(waveform);
	});

	it('cloneRowValue works with class instances', () => {
		class InstrumentRow {
			[key: string]: unknown;
			constructor(data: Record<string, unknown> = {}) {
				Object.assign(this, data);
			}
		}
		const row = new InstrumentRow({ volume: 12, tone: true });
		const next = createNextRow([row], () => ({ volume: 0, tone: false }));
		expect(next).toEqual({ volume: 12, tone: true });
		expect(next).not.toBe(row);
	});
});
