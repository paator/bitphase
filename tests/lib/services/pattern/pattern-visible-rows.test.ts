import { describe, expect, it } from 'vitest';
import { Pattern } from '@/lib/models/song';
import { PatternVisibleRowsService } from '@/lib/services/pattern/pattern-visible-rows';

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
		expect(firstNonEmpty?.rowIndex ?? -1).toBeGreaterThanOrEqual(current.length);
	});
});
