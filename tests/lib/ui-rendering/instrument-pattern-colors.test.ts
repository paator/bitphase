import { describe, expect, it } from 'vitest';
import { Pattern } from '@/lib/models/song';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import {
	applyInstrumentColorsToSegments,
	collectPatternChannelInstrumentIds,
	createInstrumentCarryLookup,
	instrumentColorsById,
	instrumentIdFromFieldText,
	patternRowInstrumentId,
	resolvePatternChannelInstrumentIds
} from '@/lib/ui-rendering/instrument-pattern-colors';
import type { FieldSegment } from '@/lib/ui-rendering/pattern-editor-text-parser';

describe('instrumentColorsById', () => {
	it('keeps only valid hex colors keyed by instrument id', () => {
		const colors = instrumentColorsById([
			{ id: '01', color: '#FF00AA' },
			{ id: '02' },
			{ id: '03', color: 'not-a-color' }
		]);

		expect(colors.get('01')).toBe('#ff00aa');
		expect(colors.has('02')).toBe(false);
		expect(colors.has('03')).toBe(false);
	});
});

describe('instrumentIdFromFieldText', () => {
	it('reads padded instrument cells and ignores empty placeholders', () => {
		expect(instrumentIdFromFieldText('01')).toBe('01');
		expect(instrumentIdFromFieldText('A1')).toBe('A1');
		expect(instrumentIdFromFieldText('..')).toBeNull();
		expect(instrumentIdFromFieldText('00')).toBeNull();
	});
});

describe('patternRowInstrumentId', () => {
	it('converts stored numeric and string instrument values', () => {
		expect(patternRowInstrumentId(1)).toBe('01');
		expect(patternRowInstrumentId('0A')).toBe('0A');
		expect(patternRowInstrumentId(0)).toBeNull();
		expect(patternRowInstrumentId('..')).toBeNull();
	});
});

describe('resolvePatternChannelInstrumentIds', () => {
	it('carries the last assigned instrument down the channel', () => {
		const pattern = new Pattern(0, 4, AY_CHIP_SCHEMA);
		pattern.channels[0].rows[0].instrument = 1;
		pattern.channels[1].rows[2].instrument = 2;

		expect(resolvePatternChannelInstrumentIds(pattern, 0)).toEqual(['01', null, null]);
		expect(resolvePatternChannelInstrumentIds(pattern, 2)).toEqual(['01', '02', null]);
	});
});

describe('collectPatternChannelInstrumentIds', () => {
	it('builds carried ids for every row in one pass', () => {
		const pattern = new Pattern(0, 3, AY_CHIP_SCHEMA);
		pattern.channels[0].rows[0].instrument = 1;
		pattern.channels[1].rows[2].instrument = 2;

		expect(collectPatternChannelInstrumentIds(pattern)).toEqual([
			['01', null, null],
			['01', null, null],
			['01', '02', null]
		]);
	});

	it('applies incoming ids from a previous pattern', () => {
		const pattern = new Pattern(1, 2, AY_CHIP_SCHEMA);
		pattern.channels[2].rows[1].instrument = 3;

		expect(collectPatternChannelInstrumentIds(pattern, ['01', null, null])).toEqual([
			['01', null, null],
			['01', null, '03']
		]);
	});
});

describe('createInstrumentCarryLookup', () => {
	it('carries instrument ids across pattern order entries', () => {
		const first = new Pattern(0, 2, AY_CHIP_SCHEMA);
		first.channels[0].rows[0].instrument = 1;
		const second = new Pattern(1, 2, AY_CHIP_SCHEMA);
		second.channels[0].rows[1].instrument = 2;
		const patterns = [first, second];
		const lookup = createInstrumentCarryLookup([0, 1], (id) =>
			patterns.find((pattern) => pattern.id === id)
		);

		expect(lookup.idsAt(1, 0)).toEqual(['01', null, null]);
		expect(lookup.idsAt(1, 1)).toEqual(['02', null, null]);
	});

	it('keeps separate incoming carry for repeated pattern ids', () => {
		const shared = new Pattern(0, 1, AY_CHIP_SCHEMA);
		const middle = new Pattern(1, 1, AY_CHIP_SCHEMA);
		middle.channels[0].rows[0].instrument = 4;
		const patterns = [shared, middle];
		const lookup = createInstrumentCarryLookup([0, 1, 0], (id) =>
			patterns.find((pattern) => pattern.id === id)
		);

		expect(lookup.idsAt(0, 0)).toEqual([null, null, null]);
		expect(lookup.idsAt(2, 0)).toEqual(['04', null, null]);
	});
});

describe('applyInstrumentColorsToSegments', () => {
	const rowString = '00 C-4 01 ...  --- ..';
	const segments: FieldSegment[] = [
		{ start: 0, end: 2, fieldKey: 'rowNum', color: '#111' },
		{ start: 3, end: 6, fieldKey: 'note', color: '#note' },
		{ start: 7, end: 9, fieldKey: 'instrument', color: '#inst' },
		{ start: 15, end: 18, fieldKey: 'note', color: '#note' },
		{ start: 19, end: 21, fieldKey: 'instrument', color: '#inst' }
	];

	it('colors the note and instrument number on the same row', () => {
		const colored = applyInstrumentColorsToSegments(
			segments,
			rowString,
			new Map([['01', '#ff00aa']])
		);

		expect(colored[1].color).toBe('#ff00aa');
		expect(colored[2].color).toBe('#ff00aa');
		expect(colored[3].color).toBe('#note');
		expect(colored[4].color).toBe('#inst');
		expect(segments[1].color).toBe('#note');
	});

	it('colors a later note from the carried instrument without coloring an empty instrument cell', () => {
		const colored = applyInstrumentColorsToSegments(
			segments,
			rowString,
			new Map([['01', '#ff00aa']]),
			['01', '01']
		);

		expect(colored[1].color).toBe('#ff00aa');
		expect(colored[2].color).toBe('#ff00aa');
		expect(colored[3].color).toBe('#ff00aa');
		expect(colored[4].color).toBe('#inst');
	});
});
