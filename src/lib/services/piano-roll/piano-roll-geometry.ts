import type { PianoNoteBlock } from './piano-roll-notes';

export const PIANO_ROLL_RESIZE_HANDLE = 8;

export interface PianoRollMetrics {
	rowWidth: number;
	keyHeight: number;
	columns: number;
	pitchCount: number;
}

export type NoteContentHit =
	| { type: 'resize'; block: PianoNoteBlock }
	| { type: 'block'; block: PianoNoteBlock }
	| { type: 'grid'; row: number; pitchIndex: number };

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function isBlackPitch(pitchIndex: number): boolean {
	return BLACK_PITCH_CLASSES.has(((pitchIndex % 12) + 12) % 12);
}

export function pitchToY(pitchIndex: number, metrics: PianoRollMetrics): number {
	return (metrics.pitchCount - 1 - pitchIndex) * metrics.keyHeight;
}

export function yToPitch(y: number, metrics: PianoRollMetrics): number | null {
	if (y < 0 || metrics.keyHeight <= 0) return null;
	const fromTop = Math.floor(y / metrics.keyHeight);
	const pitch = metrics.pitchCount - 1 - fromTop;
	if (pitch < 0 || pitch >= metrics.pitchCount) return null;
	return pitch;
}

export function xToRow(x: number, metrics: PianoRollMetrics): number | null {
	if (x < 0 || metrics.rowWidth <= 0) return null;
	const row = Math.floor(x / metrics.rowWidth);
	if (row < 0 || row >= metrics.columns) return null;
	return row;
}

export function rowToX(row: number, metrics: PianoRollMetrics): number {
	return row * metrics.rowWidth;
}

export interface ContentRect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export function blockIntersectsMarquee(
	block: { startRow: number; endRow: number; pitchIndex: number },
	marquee: ContentRect,
	metrics: PianoRollMetrics
): boolean {
	const left = Math.min(marquee.x0, marquee.x1);
	const right = Math.max(marquee.x0, marquee.x1);
	const top = Math.min(marquee.y0, marquee.y1);
	const bottom = Math.max(marquee.y0, marquee.y1);
	const blockLeft = block.startRow * metrics.rowWidth;
	const blockRight = Math.max(blockLeft + metrics.rowWidth, block.endRow * metrics.rowWidth);
	const blockTop = pitchToY(block.pitchIndex, metrics);
	const blockBottom = blockTop + metrics.keyHeight;
	return blockLeft < right && blockRight > left && blockTop < bottom && blockBottom > top;
}

export function clampSelectionDelta(
	notes: readonly { startRow: number; length: number; pitchIndex: number }[],
	deltaRow: number,
	deltaPitch: number,
	columnCount: number,
	pitchCount: number
): { deltaRow: number; deltaPitch: number } {
	if (notes.length === 0) return { deltaRow: 0, deltaPitch: 0 };
	let minStart = Number.POSITIVE_INFINITY;
	let maxEnd = Number.NEGATIVE_INFINITY;
	let minPitch = Number.POSITIVE_INFINITY;
	let maxPitch = Number.NEGATIVE_INFINITY;
	for (const note of notes) {
		minStart = Math.min(minStart, note.startRow);
		maxEnd = Math.max(maxEnd, note.startRow + Math.max(1, note.length));
		minPitch = Math.min(minPitch, note.pitchIndex);
		maxPitch = Math.max(maxPitch, note.pitchIndex);
	}
	return {
		deltaRow: Math.max(-minStart, Math.min(columnCount - maxEnd, deltaRow)),
		deltaPitch: Math.max(-minPitch, Math.min(pitchCount - 1 - maxPitch, deltaPitch))
	};
}

export function noteContentSize(metrics: PianoRollMetrics): { width: number; height: number } {
	return {
		width: Math.max(metrics.rowWidth, metrics.columns * metrics.rowWidth),
		height: Math.max(metrics.keyHeight, metrics.pitchCount * metrics.keyHeight)
	};
}

export function hitTestNoteContent(
	x: number,
	y: number,
	blocks: PianoNoteBlock[],
	metrics: PianoRollMetrics
): NoteContentHit | null {
	const row = xToRow(x, metrics);
	const pitchIndex = yToPitch(y, metrics);
	if (row === null || pitchIndex === null) return null;
	let trailingEdge: PianoNoteBlock | null = null;
	for (let index = blocks.length - 1; index >= 0; index--) {
		const block = blocks[index];
		if (!block || block.pitchIndex !== pitchIndex) continue;
		const endX = block.endRow * metrics.rowWidth;
		const startX = block.startRow * metrics.rowWidth;
		const width = Math.max(metrics.rowWidth, endX - startX);
		const handle = Math.min(
			width / 2,
			Math.max(PIANO_ROLL_RESIZE_HANDLE, metrics.rowWidth * 0.7)
		);
		const slop = Math.min(PIANO_ROLL_RESIZE_HANDLE, metrics.rowWidth / 2);
		if (row >= block.startRow && row < block.endRow) {
			if (x >= endX - handle && x < endX) return { type: 'resize', block };
			return { type: 'block', block };
		}
		if (!trailingEdge && x >= endX && x < endX + slop) trailingEdge = block;
	}
	if (trailingEdge) return { type: 'resize', block: trailingEdge };
	return { type: 'grid', row, pitchIndex };
}
