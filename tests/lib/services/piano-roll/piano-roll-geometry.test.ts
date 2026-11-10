import { describe, expect, it } from 'vitest';
import {
	blockIntersectsMarquee,
	clampSelectionDelta,
	hitTestNoteContent,
	isBlackPitch,
	pitchToY,
	xToRow,
	yToPitch,
	type PianoRollMetrics
} from '@/lib/services/piano-roll/piano-roll-geometry';
import type { PianoNoteBlock } from '@/lib/services/piano-roll/piano-roll-notes';

const metrics: PianoRollMetrics = {
	rowWidth: 10,
	keyHeight: 10,
	columns: 16,
	pitchCount: 96
};

const block: PianoNoteBlock = {
	startRow: 2,
	endRow: 6,
	pitchIndex: 10,
	note: 'A#1',
	instrument: null,
	gestures: []
};

describe('piano roll geometry', () => {
	it('maps pitch so higher notes sit toward the top', () => {
		expect(pitchToY(95, metrics)).toBe(0);
		expect(yToPitch(0, metrics)).toBe(95);
		expect(yToPitch(pitchToY(10, metrics), metrics)).toBe(10);
		expect(isBlackPitch(1)).toBe(true);
		expect(isBlackPitch(0)).toBe(false);
		expect(isBlackPitch(5)).toBe(false);
	});

	it('hits note bodies, resize handles, and empty cells', () => {
		const body = hitTestNoteContent(20, pitchToY(10, metrics), [block], metrics);
		const edge = hitTestNoteContent(57, pitchToY(10, metrics) + 1, [block], metrics);
		const empty = hitTestNoteContent(5, pitchToY(10, metrics), [block], metrics);
		expect(body).toMatchObject({ type: 'block', block });
		expect(edge).toMatchObject({ type: 'resize' });
		expect(empty).toMatchObject({ type: 'grid', row: 0, pitchIndex: 10 });
		expect(xToRow(20, metrics)).toBe(2);
		expect(yToPitch(-1, metrics)).toBeNull();
	});

	it('keeps the resize handle near the trailing edge', () => {
		const wide: PianoRollMetrics = { ...metrics, rowWidth: 40 };
		const y = pitchToY(10, wide) + 1;
		const endX = block.endRow * wide.rowWidth;
		expect(hitTestNoteContent(endX - 4, y, [block], wide)).toMatchObject({ type: 'resize' });
		expect(hitTestNoteContent(endX - 20, y, [block], wide)).toMatchObject({ type: 'block' });
	});

	it('resizes the note on the pointed pitch when two notes share a start row', () => {
		const low: PianoNoteBlock = {
			startRow: 2,
			endRow: 5,
			pitchIndex: 10,
			note: 'G-3',
			instrument: 3,
			gestures: []
		};
		const high: PianoNoteBlock = {
			startRow: 2,
			endRow: 9,
			pitchIndex: 40,
			note: 'E-4',
			instrument: 3,
			gestures: []
		};
		const hitLow = hitTestNoteContent(48, pitchToY(10, metrics) + 1, [high, low], metrics);
		const hitHigh = hitTestNoteContent(88, pitchToY(40, metrics) + 1, [high, low], metrics);
		expect(hitLow).toMatchObject({ type: 'resize', block: low });
		expect(hitHigh).toMatchObject({ type: 'resize', block: high });
	});

	it('selects notes the marquee overlaps', () => {
		const top = pitchToY(block.pitchIndex, metrics);
		expect(
			blockIntersectsMarquee(block, { x0: 25, y0: top + 1, x1: 40, y1: top + 8 }, metrics)
		).toBe(true);
		expect(
			blockIntersectsMarquee(block, { x0: 70, y0: top, x1: 90, y1: top + 8 }, metrics)
		).toBe(false);
		expect(
			blockIntersectsMarquee(block, { x0: 25, y0: top + 20, x1: 40, y1: top + 30 }, metrics)
		).toBe(false);
	});

	it('keeps a moved selection inside the grid', () => {
		const notes = [
			{ startRow: 2, length: 2, pitchIndex: 10 },
			{ startRow: 6, length: 4, pitchIndex: 14 }
		];
		expect(clampSelectionDelta(notes, -8, 3, 16, 20)).toEqual({ deltaRow: -2, deltaPitch: 3 });
		expect(clampSelectionDelta(notes, 20, -30, 16, 20)).toEqual({
			deltaRow: 6,
			deltaPitch: -10
		});
	});
});
