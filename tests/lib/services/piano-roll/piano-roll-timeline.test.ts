import { describe, expect, it } from 'vitest';
import type { GenericRow } from '@/lib/models/song/generic';
import { collectPianoNotes } from '@/lib/services/piano-roll/piano-roll-notes';
import {
	buildPianoTimeline,
	clearSpilledNoteGate,
	collectTimelineBlocks,
	continueOpenNoteBlocks,
	eachRepeatedPatternPlacement,
	isTimelineBlock,
	shiftPianoNotes,
	timelineColumnCount,
	timelineSpanAt,
	timelineSpanForOrder,
	timelineWindow,
	visibleTimelineRows,
	writeSpilledNoteTail
} from '@/lib/services/piano-roll/piano-roll-timeline';

function rows(notes: string[]): GenericRow[] {
	return notes.map((note) => ({ note }));
}

function twoPatterns(first: GenericRow[], second: GenericRow[]) {
	const spans = buildPianoTimeline([0, 1], (id) => (id === 0 ? first.length : second.length));
	const patterns = new Map([
		[0, first],
		[1, second]
	]);
	return { spans, rowsFor: (span: { patternId: number }) => patterns.get(span.patternId) };
}

describe('piano roll timeline', () => {
	it('places order steps on one timeline and windows the visible ones', () => {
		const spans = buildPianoTimeline([2, 0, 2], (id) =>
			id === 0 ? 4 : id === 2 ? 8 : undefined
		);
		expect(
			spans.map((span) => [span.orderIndex, span.patternId, span.startRow, span.length])
		).toEqual([
			[0, 2, 0, 8],
			[1, 0, 8, 4],
			[2, 2, 12, 8]
		]);
		expect(timelineColumnCount(spans)).toBe(20);
		expect(timelineSpanAt(spans, 9)).toEqual({ span: spans[1], localRow: 1 });
		expect(timelineSpanAt(spans, 20)).toBeNull();
		expect(timelineSpanForOrder(spans, 2)).toBe(spans[2]);
		expect(timelineSpanForOrder(spans, 5)).toBeNull();
		expect(timelineWindow(spans, 8, 12).map((span) => span.orderIndex)).toEqual([0, 1, 2]);
		const shifted = shiftPianoNotes(
			collectPianoNotes(rows(['C-4', '---', 'OFF']), 'note'),
			spans[1]!
		);
		expect(shifted.blocks[0]).toMatchObject({
			startRow: 8,
			endRow: 10,
			localStartRow: 0,
			orderIndex: 1,
			patternId: 0
		});
		expect(isTimelineBlock(shifted.blocks[0]!)).toBe(true);
		expect(shifted.gates[0]).toMatchObject({ row: 10, localRow: 2, orderIndex: 1 });
	});

	it('lists every order slot that reuses the same pattern row', () => {
		const spans = buildPianoTimeline([2, 0, 2], (id) => (id === 0 ? 4 : 8));
		expect(
			eachRepeatedPatternPlacement(spans, 2, (startRow, span, localRow) => [
				startRow,
				span.orderIndex,
				localRow
			])
		).toEqual([
			[2, 0, 2],
			[14, 2, 2]
		]);
		expect(eachRepeatedPatternPlacement(spans, 9, (startRow) => startRow)).toEqual([9]);
	});

	it('walks visible rows with the pattern each one belongs to', () => {
		const spans = buildPianoTimeline([0, 1], () => 3);
		const walked = [...visibleTimelineRows(spans, 1, 5)].map((item) => [
			item.row,
			item.span?.orderIndex,
			item.localRow
		]);
		expect(walked).toEqual([
			[1, 0, 1],
			[2, 0, 2],
			[3, 1, 0],
			[4, 1, 1]
		]);
	});
});

describe('piano roll notes across a pattern boundary', () => {
	it('keeps a block length that crosses into the next pattern', () => {
		const first = rows(['---', 'C-4', '---', '---']);
		const second = rows(['---', '---', '---', 'E-4']);
		const { spans, rowsFor } = twoPatterns(first, second);
		writeSpilledNoteTail(spans, 'note', 1, 4, false, rowsFor);
		expect(first.map((row) => row.note)).toEqual(['---', 'C-4', '---', '---']);
		expect(second.map((row) => row.note)).toEqual(['---', 'OFF', '---', 'E-4']);
		const blocks = [
			...collectPianoNotes(first, 'note').blocks,
			...collectPianoNotes(second, 'note').blocks.map((block) => ({
				...block,
				startRow: block.startRow + first.length,
				endRow: block.endRow + first.length
			}))
		];
		continueOpenNoteBlocks(blocks, spans, 'note', rowsFor);
		expect(blocks.find((block) => block.note === 'C-4')).toMatchObject({
			startRow: 1,
			endRow: 5
		});
		expect(blocks.find((block) => block.note === 'E-4')).toMatchObject({
			startRow: 7,
			endRow: 8
		});
	});

	it('collects blocks from the visible spans and stretches open ones across the timeline', () => {
		const first = rows(['---', 'C-4', '---', '---']);
		const second = rows(['---', '---', 'OFF', 'E-4']);
		const { spans, rowsFor } = twoPatterns(first, second);
		const visible = collectTimelineBlocks({
			timeline: spans,
			spans: spans.slice(0, 1),
			noteKey: 'note',
			rowsForSpan: rowsFor,
			collect: (patternRows) => collectPianoNotes(patternRows, 'note')
		});
		expect(visible.blocks).toHaveLength(1);
		expect(visible.blocks[0]).toMatchObject({ startRow: 1, endRow: 6, orderIndex: 0 });
		const all = collectTimelineBlocks({
			timeline: spans,
			noteKey: 'note',
			rowsForSpan: rowsFor,
			collect: (patternRows) => collectPianoNotes(patternRows, 'note')
		});
		expect(all.blocks.map((block) => block.note)).toEqual(['C-4', 'E-4']);
		expect(all.gates).toEqual([
			expect.objectContaining({ row: 6, localRow: 2, orderIndex: 1, kind: 'off' })
		]);
	});

	it('removes the gate left in the next pattern when the note moves away', () => {
		const first = rows(['C-4', '---', '---', '---']);
		const second = rows(['---', 'OFF', '---', '---']);
		const { spans, rowsFor } = twoPatterns(first, second);
		expect(clearSpilledNoteGate(spans, 'note', 4, rowsFor).has(1)).toBe(true);
		expect(second.map((row) => row.note)).toEqual(['---', '---', '---', '---']);
		expect(clearSpilledNoteGate(spans, 'note', 4, rowsFor).size).toBe(0);
	});
});
