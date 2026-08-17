import { describe, expect, it } from 'vitest';
import { emptyNoteBaselineYOffset } from '../../../src/lib/ui-rendering/empty-note-alignment';

describe('emptyNoteBaselineYOffset', () => {
	it('shifts hyphens down so their visual center matches a lower dot', () => {
		const offset = emptyNoteBaselineYOffset(
			{ actualBoundingBoxAscent: 2, actualBoundingBoxDescent: 2 },
			{ actualBoundingBoxAscent: -4, actualBoundingBoxDescent: 8 },
			3
		);
		expect(offset).toBe(6);
	});

	it('returns the fallback when glyph metrics are missing', () => {
		const offset = emptyNoteBaselineYOffset(
			{ actualBoundingBoxAscent: Number.NaN, actualBoundingBoxDescent: 1 },
			{ actualBoundingBoxAscent: 1, actualBoundingBoxDescent: 1 },
			4
		);
		expect(offset).toBe(4);
	});
});
