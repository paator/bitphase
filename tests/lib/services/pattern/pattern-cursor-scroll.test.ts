import { describe, expect, it } from 'vitest';
import {
	horizontalEdgeScrollDirection,
	insetHorizontalViewport,
	nextAutoScrollLeft,
	nextHorizontalScrollLeft
} from '../../../../src/lib/services/pattern/pattern-cursor-scroll';

describe('pattern cursor horizontal scroll', () => {
	const viewport = { left: 0, right: 400 };

	it('leaves the scroll position when the cursor is already visible', () => {
		expect(nextHorizontalScrollLeft(80, viewport, { left: 40, right: 70 })).toBe(80);
	});

	it('scrolls right when the cursor passes the visible right edge', () => {
		expect(nextHorizontalScrollLeft(0, viewport, { left: 390, right: 430 })).toBe(46);
	});

	it('scrolls left when the cursor passes the visible left edge', () => {
		expect(nextHorizontalScrollLeft(120, viewport, { left: -30, right: 0 })).toBe(74);
	});

	it('keeps a cursor that sits under a left overlay in view', () => {
		const visible = insetHorizontalViewport(viewport, [{ left: 0, right: 160 }]);
		expect(visible).toEqual({ left: 160, right: 400 });
		expect(nextHorizontalScrollLeft(200, visible, { left: 140, right: 170 })).toBe(164);
	});

	it('shrinks the viewport for an overlay on the right edge', () => {
		expect(insetHorizontalViewport(viewport, [{ left: 320, right: 400 }])).toEqual({
			left: 0,
			right: 320
		});
	});

	it('ignores an overlay that does not sit on either edge', () => {
		expect(insetHorizontalViewport(viewport, [{ left: 40, right: 80 }])).toEqual(viewport);
	});

	it('keeps the full viewport when overlays cover it completely', () => {
		expect(insetHorizontalViewport(viewport, [{ left: 0, right: 400 }])).toEqual(viewport);
	});

	it('scrolls toward the edge the pointer is pushed against', () => {
		expect(horizontalEdgeScrollDirection(10, viewport, 40)).toBe(-1);
		expect(horizontalEdgeScrollDirection(390, viewport, 40)).toBe(1);
		expect(horizontalEdgeScrollDirection(200, viewport, 40)).toBe(0);
	});

	it('steps the horizontal scroll without passing either end', () => {
		expect(nextAutoScrollLeft(0, 300, 1, 24)).toBe(24);
		expect(nextAutoScrollLeft(290, 300, 1, 24)).toBe(300);
		expect(nextAutoScrollLeft(10, 300, -1, 24)).toBe(0);
	});

	it('clamps the margin so a narrow viewport still reveals the cursor', () => {
		expect(
			nextHorizontalScrollLeft(0, { left: 0, right: 20 }, { left: 30, right: 40 }, 100)
		).toBe(20);
	});
});
