import { describe, expect, it } from 'vitest';
import { Pattern } from '@/lib/models/song';
import {
	PatternVisibleRowsService,
	type VisibleRowsContext
} from '@/lib/services/pattern/pattern-visible-rows';

function context(canvasHeight: number, lineHeight: number): VisibleRowsContext {
	const pattern = new Pattern(0, 128);
	return {
		patterns: [pattern],
		patternOrder: [0],
		currentPatternOrderIndex: 0,
		selectedRow: 40,
		canvasHeight,
		lineHeight,
		createPatternIfMissing: (id) => new Pattern(id)
	};
}

function rowSpan(canvasHeight: number, lineHeight: number) {
	const pattern = new Pattern(0, 128);
	const { rows } = PatternVisibleRowsService.getVisibleRows(
		pattern,
		context(canvasHeight, lineHeight),
		null
	);
	const selected = rows.find((row) => row.isSelected);
	const last = rows[rows.length - 1];
	return {
		count: rows.length,
		selectedDisplayIndex: selected?.displayIndex ?? -1,
		lastDisplayIndex: last?.displayIndex ?? -1,
		lastRowTop: (last?.displayIndex ?? 0) * lineHeight
	};
}

describe('PatternVisibleRowsService', () => {
	it('puts previous-pattern ghost rows first when the cursor is at the top of a shorter pattern', () => {
		const previous = new Pattern(0, 64);
		const current = new Pattern(1, 16);
		const { rows } = PatternVisibleRowsService.getVisibleRows(
			current,
			{
				patterns: [previous, current],
				patternOrder: [0, 1],
				currentPatternOrderIndex: 1,
				selectedRow: 0,
				canvasHeight: 400,
				lineHeight: 16,
				createPatternIfMissing: (id) => new Pattern(id)
			},
			null
		);

		const firstNonEmpty = rows.find((row) => !row.isEmpty);
		expect(firstNonEmpty?.isGhost).toBe(true);
		expect(firstNonEmpty?.orderIndex).toBe(0);
		expect(firstNonEmpty?.rowIndex ?? -1).toBeGreaterThanOrEqual(current.length);
	});

	it('keeps the cursor centered when the canvas height is an exact multiple of the line height', () => {
		const span = rowSpan(400, 16);

		expect(span.count).toBe(25);
		expect(span.selectedDisplayIndex).toBe(12);
		expect(span.lastRowTop).toBe(384);
	});

	it('draws a partial row when an odd number of full rows leaves space at the bottom', () => {
		const span = rowSpan(410, 16);

		expect(span.count).toBe(26);
		expect(span.selectedDisplayIndex).toBe(12);
		expect(span.lastRowTop).toBe(400);
		expect(span.lastRowTop).toBeLessThan(410);
	});

	it('shows the partial bottom row when an even number of full rows leaves a remainder', () => {
		const span = rowSpan(420, 16);

		expect(span.count).toBe(27);
		expect(span.lastRowTop).toBe(416);
		expect(span.lastRowTop).toBeLessThan(420);
		expect(420 - span.lastRowTop).toBeLessThan(16);
	});

	it('fills a leftover strip when the line height does not divide the canvas', () => {
		const lineHeight = 19.5;
		const span = rowSpan(700, lineHeight);

		expect(span.selectedDisplayIndex).toBe(17);
		expect(span.lastRowTop).toBe(682.5);
		expect(700 - span.lastRowTop).toBeGreaterThanOrEqual(1);
		expect(700 - span.lastRowTop).toBeLessThan(lineHeight);
	});
});
