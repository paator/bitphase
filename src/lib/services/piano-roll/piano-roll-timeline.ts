import type { GenericRow } from '../../models/song/generic';
import {
	EMPTY_NOTE,
	gateNote,
	isGateKind,
	nextNoteEvent,
	noteEventKind
} from './piano-note-events';
import type { PianoGateMarker, PianoNoteBlock, PianoRollNotes } from './piano-roll-notes';

export interface PianoTimelineSpan {
	orderIndex: number;
	patternId: number;
	length: number;
	startRow: number;
}

export interface PianoTimelineLocation {
	span: PianoTimelineSpan;
	localRow: number;
}

export interface PianoTimelineBlock extends PianoNoteBlock {
	orderIndex: number;
	patternId: number;
	localStartRow: number;
}

export interface PianoTimelineGate extends PianoGateMarker {
	orderIndex: number;
	patternId: number;
	localRow: number;
}

export type SpanRowsReader<Rows extends readonly GenericRow[] = GenericRow[]> = (
	span: PianoTimelineSpan
) => Rows | undefined;

export function buildPianoTimeline(
	order: readonly number[],
	lengthOf: (patternId: number) => number | undefined
): PianoTimelineSpan[] {
	const spans: PianoTimelineSpan[] = [];
	let startRow = 0;
	for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
		const patternId = order[orderIndex];
		if (patternId === undefined) continue;
		const length = lengthOf(patternId);
		if (length === undefined || length <= 0) continue;
		spans.push({ orderIndex, patternId, length, startRow });
		startRow += length;
	}
	return spans;
}

export function spanEnd(span: PianoTimelineSpan): number {
	return span.startRow + span.length;
}

export function timelineColumnCount(spans: readonly PianoTimelineSpan[]): number {
	const last = spans[spans.length - 1];
	return last ? spanEnd(last) : 0;
}

export function timelineSpanForOrder(
	spans: readonly PianoTimelineSpan[],
	orderIndex: number
): PianoTimelineSpan | null {
	return spans.find((span) => span.orderIndex === orderIndex) ?? null;
}

export function timelineSpanIndex(
	spans: readonly PianoTimelineSpan[],
	absoluteRow: number
): number {
	let low = 0;
	let high = spans.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		const span = spans[mid];
		if (!span || absoluteRow < span.startRow) high = mid - 1;
		else if (absoluteRow >= spanEnd(span)) low = mid + 1;
		else return mid;
	}
	return -1;
}

export function timelineSpanAt(
	spans: readonly PianoTimelineSpan[],
	absoluteRow: number
): PianoTimelineLocation | null {
	const index = timelineSpanIndex(spans, absoluteRow);
	const span = index < 0 ? undefined : spans[index];
	if (!span) return null;
	return { span, localRow: absoluteRow - span.startRow };
}

export function eachRepeatedPatternPlacement<T>(
	spans: readonly PianoTimelineSpan[],
	absoluteRow: number,
	build: (startRow: number, span: PianoTimelineSpan, localRow: number) => T | null
): T[] {
	const located = timelineSpanAt(spans, absoluteRow);
	if (!located) return [];
	const results: T[] = [];
	for (const span of spans) {
		if (span.patternId !== located.span.patternId) continue;
		if (located.localRow < 0 || located.localRow >= span.length) continue;
		const item = build(span.startRow + located.localRow, span, located.localRow);
		if (item !== null) results.push(item);
	}
	return results;
}

export function timelineWindow(
	spans: readonly PianoTimelineSpan[],
	startRow: number,
	endRow: number
): PianoTimelineSpan[] {
	if (spans.length === 0 || endRow <= startRow) return [];
	let first = timelineSpanIndex(spans, Math.max(0, startRow));
	if (first < 0) {
		const tail = spans[spans.length - 1];
		first = tail && startRow >= spanEnd(tail) ? spans.length - 1 : 0;
	}
	let last = first;
	while (
		last + 1 < spans.length &&
		(spans[last + 1]?.startRow ?? Number.POSITIVE_INFINITY) < endRow
	) {
		last++;
	}
	const from = Math.max(0, first - 1);
	const to = Math.min(spans.length - 1, last + 1);
	return spans.slice(from, to + 1);
}

export function* visibleTimelineRows(
	spans: readonly PianoTimelineSpan[],
	firstRow: number,
	lastRow: number
): Generator<{ row: number; span: PianoTimelineSpan | undefined; localRow: number }> {
	let cursor = Math.max(0, timelineSpanIndex(spans, firstRow));
	for (let row = firstRow; row < lastRow; row++) {
		while (
			cursor < spans.length - 1 &&
			(spans[cursor + 1]?.startRow ?? Number.POSITIVE_INFINITY) <= row
		) {
			cursor++;
		}
		const span = spans[cursor];
		yield { row, span, localRow: span && row >= span.startRow ? row - span.startRow : row };
	}
}

export function shiftPianoNotes(
	notes: PianoRollNotes,
	span: PianoTimelineSpan
): { blocks: PianoTimelineBlock[]; gates: PianoTimelineGate[] } {
	const place = { orderIndex: span.orderIndex, patternId: span.patternId };
	return {
		blocks: notes.blocks.map((block) => ({
			...block,
			...place,
			startRow: block.startRow + span.startRow,
			endRow: block.endRow + span.startRow,
			localStartRow: block.startRow
		})),
		gates: notes.gates.map((gate) => ({
			...gate,
			...place,
			row: gate.row + span.startRow,
			localRow: gate.row
		}))
	};
}

export function isTimelineBlock(block: PianoNoteBlock): block is PianoTimelineBlock {
	return 'orderIndex' in block && 'patternId' in block && 'localStartRow' in block;
}

export interface CollectTimelineBlocksOptions {
	timeline: readonly PianoTimelineSpan[];
	spans?: readonly PianoTimelineSpan[];
	noteKey: string;
	rowsForSpan: SpanRowsReader;
	collect: (rows: GenericRow[], span: PianoTimelineSpan) => PianoRollNotes;
	continueOpen?: boolean;
}

export function collectTimelineBlocks(options: CollectTimelineBlocksOptions): {
	blocks: PianoTimelineBlock[];
	gates: PianoTimelineGate[];
} {
	const {
		timeline,
		spans = timeline,
		noteKey,
		rowsForSpan,
		collect,
		continueOpen = true
	} = options;
	const blocks: PianoTimelineBlock[] = [];
	const gates: PianoTimelineGate[] = [];
	for (const span of spans) {
		const rows = rowsForSpan(span);
		if (!rows) continue;
		const shifted = shiftPianoNotes(collect(rows, span), span);
		blocks.push(...shifted.blocks);
		gates.push(...shifted.gates);
	}
	if (continueOpen) continueOpenNoteBlocks(blocks, timeline, noteKey, rowsForSpan);
	return { blocks, gates };
}

export function continueOpenNoteBlocks<T extends { startRow: number; endRow: number }>(
	blocks: T[],
	spans: readonly PianoTimelineSpan[],
	noteKey: string,
	rowsForSpan: SpanRowsReader<readonly GenericRow[]>
): void {
	for (const block of blocks) {
		const spanIndex = timelineSpanIndex(spans, block.startRow);
		const span = spans[spanIndex];
		if (!span || block.endRow !== spanEnd(span)) continue;
		let end = block.endRow;
		for (let index = spanIndex + 1; index < spans.length; index++) {
			const next = spans[index];
			const rows = next ? rowsForSpan(next) : undefined;
			if (!next || !rows) break;
			const event = nextNoteEvent(rows, noteKey, 0, next.length);
			if (event) {
				end = next.startRow + event.row;
				break;
			}
			end = spanEnd(next);
		}
		if (end > block.endRow) block.endRow = end;
	}
}

export function writeSpilledNoteTail(
	spans: readonly PianoTimelineSpan[],
	noteKey: string,
	absoluteStart: number,
	length: number,
	release: boolean,
	rowsForSpan: SpanRowsReader
): Set<number> {
	const changed = new Set<number>();
	if (length < 1) return changed;
	const gate = gateNote(release);
	const end = absoluteStart + length;
	eachTimelineRow(spans, absoluteStart + 1, end, rowsForSpan, (cell, span) => {
		const kind = noteEventKind(cell[noteKey]);
		if (kind === 'empty' || kind === 'pitched') return;
		cell[noteKey] = EMPTY_NOTE;
		changed.add(span.patternId);
	});
	eachTimelineRow(spans, end, end + 1, rowsForSpan, (cell, span) => {
		if (noteEventKind(cell[noteKey]) === 'pitched' || cell[noteKey] === gate) return;
		cell[noteKey] = gate;
		changed.add(span.patternId);
	});
	return changed;
}

export function clearSpilledNoteGate(
	spans: readonly PianoTimelineSpan[],
	noteKey: string,
	patternEnd: number,
	rowsForSpan: SpanRowsReader
): Set<number> {
	const changed = new Set<number>();
	for (const span of spans) {
		if (spanEnd(span) <= patternEnd) continue;
		const rows = rowsForSpan(span);
		if (!rows) break;
		const event = nextNoteEvent(rows, noteKey, patternEnd - span.startRow, span.length);
		if (!event) continue;
		const cell = rows[event.row];
		if (cell && isGateKind(event.kind)) {
			cell[noteKey] = EMPTY_NOTE;
			changed.add(span.patternId);
		}
		return changed;
	}
	return changed;
}

function eachTimelineRow(
	spans: readonly PianoTimelineSpan[],
	from: number,
	to: number,
	rowsForSpan: SpanRowsReader,
	visit: (cell: GenericRow, span: PianoTimelineSpan) => void
): void {
	for (const span of spans) {
		if (spanEnd(span) <= from) continue;
		if (span.startRow >= to) break;
		const rows = rowsForSpan(span);
		if (!rows) continue;
		const end = Math.min(spanEnd(span), to);
		for (let absolute = Math.max(span.startRow, from); absolute < end; absolute++) {
			const cell = rows[absolute - span.startRow];
			if (cell) visit(cell, span);
		}
	}
}
