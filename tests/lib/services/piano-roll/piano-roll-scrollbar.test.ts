import { describe, expect, it } from 'vitest';
import {
	scrollAfterThumbDrag,
	scrollFromThumbOffset,
	scrollbarThumb
} from '@/lib/services/piano-roll/piano-roll-scrollbar';

describe('piano roll scrollbar', () => {
	it('fills the track when the content fits', () => {
		expect(scrollbarThumb(200, 200, 0)).toEqual({ size: 200, offset: 0 });
		expect(scrollAfterThumbDrag(200, 200, 200, 0, 40)).toBe(0);
	});

	it('maps the thumb across the overflow', () => {
		expect(scrollbarThumb(100, 400, 0)).toEqual({ size: 25, offset: 0 });
		expect(scrollbarThumb(100, 400, 300)).toEqual({ size: 25, offset: 75 });
		expect(scrollFromThumbOffset(100, 400, 25, 75)).toBe(300);
		expect(scrollAfterThumbDrag(100, 400, 25, 0, 75)).toBe(300);
	});

	it('keeps a minimum thumb and clamps the scroll range', () => {
		const thumb = scrollbarThumb(100, 10000, 20000);
		expect(thumb.size).toBe(16);
		expect(thumb.offset).toBe(84);
		expect(scrollFromThumbOffset(100, 10000, 16, -20)).toBe(0);
		expect(scrollAfterThumbDrag(100, 10000, 16, 9900, 500)).toBe(9900);
	});

	it('returns an empty thumb when the viewport has no size', () => {
		expect(scrollbarThumb(0, 400, 10)).toEqual({ size: 0, offset: 0 });
	});
});
