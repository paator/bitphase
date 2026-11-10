import { getColors } from '../utils/colors';
import { numberToInstrumentId } from '../utils/instrument-id';
import { formatNoteFromEnum, tuningTableIndexToNote } from '../utils/note-utils';
import { NoteName } from '../models/song';
import { EFFECT_FORMAT_COLORS, getEffectFormatCharColors } from '../chips/base/effect-format-color';
import {
	isBlackPitch,
	pitchToY,
	rowToX,
	type ContentRect,
	type PianoRollMetrics
} from '../services/piano-roll/piano-roll-geometry';
import { formatPianoEffectInput } from '../services/piano-roll/piano-effect-input';
import {
	laneValueIsTyped,
	radixLaneCodec,
	typedLaneCodec
} from '../services/piano-roll/piano-lane-codec';
import {
	noteLevelAlpha,
	noteSpotKey,
	type PianoGateMarker,
	type PianoNoteBlock,
	type PianoNoteSpot
} from '../services/piano-roll/piano-roll-notes';
import { pianoLaneBarValue, type PianoRollLane } from '../services/piano-roll/piano-roll-schema';
import {
	timelineSpanIndex,
	visibleTimelineRows,
	type PianoTimelineSpan
} from '../services/piano-roll/piano-roll-timeline';

export type PianoRollColors = ReturnType<typeof getColors>;

export interface PianoBlockPreview extends PianoNoteSpot {
	endRow: number;
	color: string | null;
	instrument: number | null;
	gestures: PianoNoteBlock['gestures'];
	level?: number | null;
}

export interface PianoKeyboardDrawOptions {
	colors: PianoRollColors;
	width: number;
	height: number;
	scrollY: number;
	metrics: PianoRollMetrics;
}

export interface PianoGridDrawOptions {
	colors: PianoRollColors;
	width: number;
	height: number;
	rulerHeight: number;
	scrollX: number;
	scrollY: number;
	metrics: PianoRollMetrics;
	blocks: PianoNoteBlock[];
	gates: PianoGateMarker[];
	spans: readonly PianoTimelineSpan[];
	currentOrderIndex: number;
	cursorRow: number;
	selectedNotes: readonly PianoNoteSpot[];
	marquee?: ContentRect | null;
	hiddenBlocks: readonly PianoNoteSpot[];
	previews: readonly PianoBlockPreview[];
	leavingBlocks?: readonly { block: PianoNoteBlock; presence: number; selected: boolean }[];
	presenceFor?: (block: PianoNoteBlock) => number;
	resolveColor: (block: PianoNoteBlock) => string | null;
}

export interface PianoLaneDrawOptions {
	colors: PianoRollColors;
	width: number;
	height: number;
	scrollX: number;
	metrics: PianoRollMetrics;
	lane: PianoRollLane;
	values: unknown[];
	valueOrigin: number;
	spans: readonly PianoTimelineSpan[];
	draft: Record<number, number> | null;
	cursorRow: number;
	envelopeAsNote?: boolean;
	tuningTable?: readonly number[];
}

interface PianoPalette {
	background: string;
	alternate: string;
	text: string;
	note: string;
	accent: string;
	grid: string;
	separator: string;
	noteOff: string;
	effect: string;
	envelope: string;
	table: string;
	instrument: string;
	cursor: string;
}

interface RowRange {
	firstRow: number;
	lastRow: number;
}

interface BlockFrame {
	metrics: PianoRollMetrics;
	scrollX: number;
	scrollY: number;
	rulerHeight: number;
	selectedStroke: string;
}

type LaneCellPainter = (row: number, x: number, raw: unknown) => void;

const CONFLICT_FILL = '#e64553';
const CONFLICT_MARK = '#fff7f7';

const paletteCache = new WeakMap<PianoRollColors, PianoPalette>();

function palette(colors: PianoRollColors): PianoPalette {
	const cached = paletteCache.get(colors);
	if (cached) return cached;
	const resolved: PianoPalette = {
		background: color(colors.patternBg, '#1e1e2e'),
		alternate: color(colors.patternAlternate, '#181825'),
		text: color(colors.patternText, '#cdd6f4'),
		note: color(colors.patternNote, '#89b4fa'),
		accent: color(colors.patternRowNum, '#89b4fa'),
		grid: color(colors.patternEmpty, '#313244'),
		separator: color(colors.patternChannelSeparator, '#45475a'),
		noteOff: color(colors.patternNoteOff, '#f38ba8'),
		effect: color(colors.patternEffect, '#cba6f7'),
		envelope: color(colors.patternEnvelope, '#a6e3a1'),
		table: color(colors.patternTable, '#a6e3a1'),
		instrument: color(colors.patternInstrument, '#a6e3a1'),
		cursor: color(colors.patternEmptySelected, '#5f6595')
	};
	paletteCache.set(colors, resolved);
	return resolved;
}

function color(value: string | undefined, fallback: string): string {
	return value && value.length > 0 ? value : fallback;
}

function parseColor(input: string): { r: number; g: number; b: number } | null {
	const match = /^#([0-9a-f]{6})$/i.exec(input.trim());
	if (!match?.[1]) return null;
	const value = parseInt(match[1], 16);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function mixColors(from: string, to: string, amount: number): string {
	const start = parseColor(from);
	const end = parseColor(to);
	if (!start || !end) return from;
	const ratio = Math.max(0, Math.min(1, amount));
	const channel = (a: number, b: number) =>
		Math.round(a + (b - a) * ratio)
			.toString(16)
			.padStart(2, '0');
	return `#${channel(start.r, end.r)}${channel(start.g, end.g)}${channel(start.b, end.b)}`;
}

function colorLuminance(input: string): number {
	const rgb = parseColor(input);
	if (!rgb) return 0;
	const channel = (value: number) => {
		const scaled = value / 255;
		return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function strokePath(
	ctx: CanvasRenderingContext2D,
	path: Path2D,
	style: string,
	alpha: number
): void {
	ctx.strokeStyle = style;
	ctx.globalAlpha = alpha;
	ctx.stroke(path);
	ctx.globalAlpha = 1;
}

function visibleRowRange(scrollX: number, width: number, metrics: PianoRollMetrics): RowRange {
	return {
		firstRow: Math.max(0, Math.floor(scrollX / metrics.rowWidth) - 1),
		lastRow: Math.min(metrics.columns, Math.ceil((scrollX + width) / metrics.rowWidth) + 1)
	};
}

function spotKeys(spots: readonly PianoNoteSpot[]): Set<string> {
	return new Set(spots.map(noteSpotKey));
}

function pianoKeyPalette(colors: PianoPalette): {
	whiteKey: string;
	cKey: string;
	whiteLine: string;
	cLine: string;
	blackKey: string;
	label: string;
} {
	const { background, text } = colors;
	const light = colorLuminance(background) > 0.4;
	const whiteKey = light
		? mixColors(background, '#ffffff', 0.42)
		: mixColors(background, '#f3f5fa', 0.88);
	const cKey = light ? mixColors(whiteKey, text, 0.1) : mixColors(whiteKey, background, 0.2);
	return {
		whiteKey,
		cKey,
		whiteLine: mixColors(whiteKey, light ? text : background, 0.2),
		cLine: mixColors(cKey, light ? text : background, 0.28),
		blackKey: light
			? mixColors(text, background, 0.08)
			: mixColors(background, '#05060a', 0.42),
		label: light ? text : mixColors(background, '#101218', 0.12)
	};
}

function pianoKeyLabel(noteName: NoteName, octave: number): string {
	return formatNoteFromEnum(noteName, octave).replace('-', '');
}

function blockCaption(
	ctx: CanvasRenderingContext2D,
	block: PianoNoteBlock,
	maxWidth: number
): string {
	const parsed = tuningTableIndexToNote(block.pitchIndex);
	const pitch = parsed ? pianoKeyLabel(parsed.noteName, parsed.octave) : '';
	const instrumentId =
		block.instrument != null && block.instrument > 0
			? numberToInstrumentId(block.instrument)
			: '';
	const combined = pitch && instrumentId ? `${pitch} ${instrumentId}` : pitch || instrumentId;
	if (maxWidth <= 0) return '';
	if (combined && ctx.measureText(combined).width <= maxWidth) return combined;
	if (instrumentId && ctx.measureText(instrumentId).width <= maxWidth) return instrumentId;
	if (pitch && ctx.measureText(pitch).width <= maxWidth) return pitch;
	return '';
}

export function drawPianoKeyboard(
	ctx: CanvasRenderingContext2D,
	options: PianoKeyboardDrawOptions
): void {
	const { width, height, scrollY, metrics } = options;
	const colors = palette(options.colors);
	ctx.clearRect(0, 0, width, height);
	const keyHeight = metrics.keyHeight;
	const labelGutter = 28;
	const blackWidth = Math.max(18, width - labelGutter);
	const fontSize = Math.max(8, Math.min(10, Math.floor(keyHeight) - 2));
	ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
	ctx.textBaseline = 'middle';
	const first = Math.max(0, Math.floor(scrollY / keyHeight) - 1);
	const last = Math.min(metrics.pitchCount, Math.ceil((scrollY + height) / keyHeight) + 1);
	const keys = pianoKeyPalette(colors);
	for (let fromTop = first; fromTop < last; fromTop++) {
		const pitch = metrics.pitchCount - 1 - fromTop;
		const y = fromTop * keyHeight - scrollY;
		const note = tuningTableIndexToNote(pitch);
		const label = note ? pianoKeyLabel(note.noteName, note.octave) : '';
		const black = isBlackPitch(pitch);
		const isC = note?.noteName === NoteName.C;
		ctx.fillStyle = isC ? keys.cKey : keys.whiteKey;
		ctx.fillRect(0, y, width, keyHeight);
		ctx.fillStyle = isC ? keys.cLine : keys.whiteLine;
		ctx.fillRect(0, y + keyHeight - 1, width, 1);
		if (black) {
			const inset = keyHeight > 10 ? 1 : 0;
			ctx.fillStyle = keys.blackKey;
			ctx.fillRect(0, y + inset, blackWidth, Math.max(1, keyHeight - inset * 2));
		}
		if (!label) continue;
		ctx.save();
		ctx.beginPath();
		ctx.rect(black ? blackWidth : 0, y, black ? width - blackWidth : width, keyHeight);
		ctx.clip();
		ctx.textAlign = 'right';
		ctx.fillStyle = keys.label;
		ctx.fillText(label, width - 4, y + keyHeight / 2);
		ctx.restore();
	}
	ctx.strokeStyle = colors.separator;
	ctx.beginPath();
	ctx.moveTo(width - 0.5, 0);
	ctx.lineTo(width - 0.5, height);
	ctx.stroke();
}

export function drawPianoGrid(ctx: CanvasRenderingContext2D, options: PianoGridDrawOptions): void {
	const { width, height, rulerHeight } = options;
	const colors = palette(options.colors);
	const rows = visibleRowRange(options.scrollX, width, options.metrics);
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = colors.background;
	ctx.fillRect(0, rulerHeight, width, Math.max(0, height - rulerHeight));
	drawPitchRows(ctx, options, colors);
	drawRowLines(ctx, options, colors, rows);
	drawNoteBlocks(ctx, options, colors);
	drawRuler(ctx, options, colors, rows);
	drawMarquee(ctx, options, colors);
	drawGridCursor(ctx, options, colors);
}

function drawPitchRows(
	ctx: CanvasRenderingContext2D,
	options: PianoGridDrawOptions,
	colors: PianoPalette
): void {
	const { width, height, rulerHeight, scrollY, metrics } = options;
	const noteHeight = Math.max(0, height - rulerHeight);
	const firstFromTop = Math.max(0, Math.floor(scrollY / metrics.keyHeight) - 1);
	const lastFromTop = Math.min(
		metrics.pitchCount,
		Math.ceil((scrollY + noteHeight) / metrics.keyHeight) + 1
	);
	const octaveLines = new Path2D();
	const pitchLines = new Path2D();
	ctx.fillStyle = colors.alternate;
	for (let fromTop = firstFromTop; fromTop < lastFromTop; fromTop++) {
		const pitch = metrics.pitchCount - 1 - fromTop;
		const y = rulerHeight + fromTop * metrics.keyHeight - scrollY;
		if (isBlackPitch(pitch)) ctx.fillRect(0, y, width, metrics.keyHeight);
		const lineY = y + metrics.keyHeight - 0.5;
		const path = pitch % 12 === 0 ? octaveLines : pitchLines;
		path.moveTo(0, lineY);
		path.lineTo(width, lineY);
	}
	strokePath(ctx, pitchLines, colors.grid, 0.35);
	strokePath(ctx, octaveLines, colors.separator, 0.9);
}

function drawRowLines(
	ctx: CanvasRenderingContext2D,
	options: PianoGridDrawOptions,
	colors: PianoPalette,
	rows: RowRange
): void {
	const { height, rulerHeight, scrollX, metrics, spans } = options;
	const boundaryLines = new Path2D();
	const barLines = new Path2D();
	const beatLines = new Path2D();
	const rowLines = new Path2D();
	for (const { row, span, localRow } of visibleTimelineRows(spans, rows.firstRow, rows.lastRow)) {
		const x = row * metrics.rowWidth - scrollX + 0.5;
		const path =
			span && row === span.startRow
				? boundaryLines
				: localRow % 16 === 0
					? barLines
					: localRow % 4 === 0
						? beatLines
						: rowLines;
		path.moveTo(x, rulerHeight);
		path.lineTo(x, height);
	}
	strokePath(ctx, rowLines, colors.grid, 0.14);
	strokePath(ctx, beatLines, colors.grid, 0.28);
	strokePath(ctx, barLines, colors.separator, 0.55);
	strokePath(ctx, boundaryLines, colors.separator, 0.95);
}

function drawNoteBlocks(
	ctx: CanvasRenderingContext2D,
	options: PianoGridDrawOptions,
	colors: PianoPalette
): void {
	const { width, scrollX, metrics } = options;
	const frame: BlockFrame = {
		metrics,
		scrollX,
		scrollY: options.scrollY,
		rulerHeight: options.rulerHeight,
		selectedStroke: colors.accent
	};
	const viewStart = scrollX - metrics.rowWidth;
	const viewEnd = scrollX + width + metrics.rowWidth;
	const hidden = spotKeys(options.hiddenBlocks);
	const selected = spotKeys(options.selectedNotes);
	const paint = (block: PianoNoteBlock, presence: number, isSelected: boolean) => {
		const blockStart = block.startRow * metrics.rowWidth;
		const blockEnd = block.endRow * metrics.rowWidth;
		if (blockEnd < viewStart || blockStart > viewEnd || presence <= 0) return;
		const fill = options.resolveColor(block) ?? colors.note;
		drawBlock(ctx, block, frame, fill, isSelected, presence);
	};
	for (const ghost of options.leavingBlocks ?? []) {
		if (!hidden.has(noteSpotKey(ghost.block)))
			paint(ghost.block, ghost.presence, ghost.selected);
	}
	for (const block of options.blocks) {
		const key = noteSpotKey(block);
		if (!hidden.has(key)) paint(block, options.presenceFor?.(block) ?? 1, selected.has(key));
	}
	for (const preview of options.previews) {
		drawBlock(ctx, { ...preview, note: '' }, frame, preview.color ?? colors.note, true);
	}
}

function drawRuler(
	ctx: CanvasRenderingContext2D,
	options: PianoGridDrawOptions,
	colors: PianoPalette,
	rows: RowRange
): void {
	const { width, rulerHeight, scrollX, metrics, spans } = options;
	ctx.fillStyle = colors.background;
	ctx.fillRect(0, 0, width, rulerHeight);
	ctx.strokeStyle = colors.separator;
	ctx.beginPath();
	ctx.moveTo(0, rulerHeight - 0.5);
	ctx.lineTo(width, rulerHeight - 0.5);
	ctx.stroke();
	ctx.font = '10px ui-monospace, monospace';
	ctx.textBaseline = 'middle';
	const firstSpan = timelineSpanIndex(spans, rows.firstRow);
	const lastSpan = timelineSpanIndex(spans, Math.max(rows.firstRow, rows.lastRow - 1));
	ctx.fillStyle = colors.accent;
	ctx.globalAlpha = 0.9;
	for (
		let index = Math.max(0, firstSpan);
		index <= (lastSpan < 0 ? firstSpan : lastSpan);
		index++
	) {
		const span = spans[index];
		if (!span || span.orderIndex !== options.currentOrderIndex) continue;
		ctx.fillRect(
			span.startRow * metrics.rowWidth - scrollX,
			0,
			span.length * metrics.rowWidth,
			2
		);
	}
	ctx.globalAlpha = 1;
	const gateRows = new Map(options.gates.map((gate) => [gate.row, gate.kind]));
	for (const { row, span, localRow } of visibleTimelineRows(spans, rows.firstRow, rows.lastRow)) {
		const x = row * metrics.rowWidth - scrollX;
		const boundary = !!span && row === span.startRow;
		if (boundary || (localRow % 4 === 0 && metrics.rowWidth >= 12)) {
			ctx.fillStyle = colors.accent;
			const label = boundary ? String(span.patternId).padStart(2, '0') : String(localRow);
			if (!boundary || span.length * metrics.rowWidth >= 12) {
				ctx.fillText(label, x + 3, rulerHeight / 2);
			}
		}
		const gate = gateRows.get(row);
		if (!gate) continue;
		ctx.fillStyle = gate === 'off' ? colors.noteOff : colors.effect;
		ctx.fillRect(x + 2, rulerHeight - 5, Math.max(4, metrics.rowWidth - 4), 3);
	}
}

function drawMarquee(
	ctx: CanvasRenderingContext2D,
	options: PianoGridDrawOptions,
	colors: PianoPalette
): void {
	const { marquee, width, height, rulerHeight, scrollX, scrollY } = options;
	if (!marquee) return;
	const left = Math.min(marquee.x0, marquee.x1) - scrollX;
	const top = rulerHeight + Math.min(marquee.y0, marquee.y1) - scrollY;
	const boxWidth = Math.abs(marquee.x1 - marquee.x0);
	const boxHeight = Math.abs(marquee.y1 - marquee.y0);
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, rulerHeight, width, Math.max(0, height - rulerHeight));
	ctx.clip();
	ctx.fillStyle = colors.accent;
	ctx.globalAlpha = 0.18;
	ctx.fillRect(left, top, boxWidth, boxHeight);
	ctx.globalAlpha = 0.9;
	ctx.strokeStyle = colors.accent;
	ctx.lineWidth = 1;
	ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, boxWidth - 1), Math.max(0, boxHeight - 1));
	ctx.restore();
}

function drawGridCursor(
	ctx: CanvasRenderingContext2D,
	options: PianoGridDrawOptions,
	colors: PianoPalette
): void {
	const { cursorRow, metrics, scrollX, height, rulerHeight } = options;
	if (cursorRow < 0 || cursorRow >= metrics.columns) return;
	const x = rowToX(cursorRow, metrics) - scrollX;
	ctx.fillStyle = colors.cursor;
	ctx.globalAlpha = 0.28;
	ctx.fillRect(x, rulerHeight, metrics.rowWidth, Math.max(0, height - rulerHeight));
	drawCursorLine(ctx, colors, x, height);
}

function drawCursorLine(
	ctx: CanvasRenderingContext2D,
	colors: PianoPalette,
	x: number,
	height: number
): void {
	ctx.fillStyle = colors.accent;
	ctx.globalAlpha = 0.9;
	ctx.fillRect(x, 0, 2, height);
	ctx.globalAlpha = 1;
}

export function drawPianoLane(ctx: CanvasRenderingContext2D, options: PianoLaneDrawOptions): void {
	const { width, height, scrollX, metrics, lane, cursorRow } = options;
	const colors = palette(options.colors);
	const rows = visibleRowRange(scrollX, width, metrics);
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = colors.background;
	ctx.fillRect(0, 0, width, height);
	const boundaries = new Path2D();
	const rowLines = new Path2D();
	for (const { row, span } of visibleTimelineRows(options.spans, rows.firstRow, rows.lastRow)) {
		const x = row * metrics.rowWidth - scrollX + 0.5;
		const path = span && row === span.startRow ? boundaries : rowLines;
		path.moveTo(x, 0);
		path.lineTo(x, height);
	}
	strokePath(ctx, rowLines, colors.grid, 0.14);
	strokePath(ctx, boundaries, colors.separator, 0.65);
	const paintCell = laneCellPainter(ctx, options, colors);
	ctx.font = '9px ui-monospace, monospace';
	ctx.textBaseline = 'top';
	for (let row = rows.firstRow; row < rows.lastRow; row++) {
		paintCell(row, row * metrics.rowWidth - scrollX, laneValueAt(options, row));
	}
	if (cursorRow >= 0 && cursorRow < metrics.columns) {
		drawCursorLine(ctx, colors, cursorRow * metrics.rowWidth - scrollX, height);
	}
	if (lane.kind === 'effect') return;
	ctx.save();
	ctx.globalAlpha = 0.34;
	ctx.fillStyle = colors.text;
	ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillText(lane.isGlobal ? `Chip ${lane.label}` : lane.label, 8, 6);
	ctx.restore();
}

function laneValueAt(options: PianoLaneDrawOptions, row: number): unknown {
	const { draft, values, valueOrigin } = options;
	if (draft && row in draft) return draft[row];
	const index = row - valueOrigin;
	return index >= 0 && index < values.length ? values[index] : undefined;
}

function laneCellPainter(
	ctx: CanvasRenderingContext2D,
	options: PianoLaneDrawOptions,
	colors: PianoPalette
): LaneCellPainter {
	const { lane, metrics, height, cursorRow } = options;
	const outlineCursor = (row: number, x: number) => {
		if (row !== cursorRow) return;
		ctx.strokeStyle = colors.accent;
		ctx.strokeRect(x + 1.5, 3.5, Math.max(2, metrics.rowWidth - 3), height - 7);
	};
	if (lane.kind === 'effect') {
		return (row, x, raw) => {
			const label = formatPianoEffectInput(raw);
			if (label) drawEffectColumn(ctx, colors, label, x, metrics.rowWidth, height);
			outlineCursor(row, x);
		};
	}
	const barColor = laneColor(options.colors, colors, lane);
	if (laneValueIsTyped(lane)) {
		const codec = typedLaneCodec(lane, {
			envelopeAsNote: options.envelopeAsNote ?? false,
			tuningTable: options.tuningTable
		});
		return (row, x, raw) => {
			const label = codec?.format(raw) ?? '';
			if (label) drawTypedLaneValue(ctx, barColor, label, x, metrics.rowWidth, height);
			outlineCursor(row, x);
		};
	}
	const labelFor = barLabel(lane);
	return (row, x, raw) => {
		const bar = pianoLaneBarValue(raw, lane);
		const label = labelFor(raw);
		if (bar === null && !label) return;
		const ratio = bar === null || lane.maxValue <= 0 ? 0 : bar / lane.maxValue;
		const barHeight = bar === null ? 0 : Math.max(8, ratio * (height - 16));
		if (barHeight > 0) {
			ctx.fillStyle = barColor;
			ctx.globalAlpha = row === cursorRow ? 1 : 0.8;
			ctx.fillRect(
				x + 1,
				height - 4 - barHeight,
				Math.max(2, metrics.rowWidth - 2),
				barHeight
			);
			ctx.globalAlpha = 1;
		}
		if (label && metrics.rowWidth >= 16) {
			ctx.fillStyle = colors.text;
			ctx.fillText(label, x + 2, 3);
		}
	};
}

function barLabel(lane: PianoRollLane): (raw: unknown) => string {
	const radix = radixLaneCodec(lane);
	if (radix) return (raw) => radix.format(raw);
	return (raw) => (typeof raw === 'number' && raw !== 0 ? String(Math.max(0, raw)) : '');
}

function laneColor(colors: PianoRollColors, fallback: PianoPalette, lane: PianoRollLane): string {
	const key = lane.color as keyof PianoRollColors | undefined;
	if (key && colors[key]) return colors[key];
	return fallback.instrument;
}

function drawBlock(
	ctx: CanvasRenderingContext2D,
	block: PianoNoteBlock,
	frame: BlockFrame,
	fill: string,
	selected: boolean,
	presence = 1
): void {
	if (presence <= 0) return;
	const rect = blockRect(block, frame, presence);
	if (!selected || presence >= 1) {
		paintBlock(ctx, block, frame, rect, fill, selected, presence, presence);
		return;
	}
	blendOverBackdrop(ctx, rect, presence, () =>
		paintBlock(ctx, block, frame, rect, fill, true, presence, 1)
	);
}

interface BlockRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function blockRect(block: PianoNoteBlock, frame: BlockFrame, presence: number): BlockRect {
	const { metrics } = frame;
	const x = block.startRow * metrics.rowWidth - frame.scrollX + 1;
	const width = Math.max(4, (block.endRow - block.startRow) * metrics.rowWidth - 2);
	const y = frame.rulerHeight + pitchToY(block.pitchIndex, metrics) - frame.scrollY + 1;
	const height = Math.max(3, metrics.keyHeight - 2);
	const scale = 0.86 + 0.14 * presence;
	const drawHeight = Math.max(2, height * scale);
	return {
		x,
		y: y + (height - drawHeight) / 2,
		width: Math.max(2, width * scale),
		height: drawHeight
	};
}

let backdropContext: CanvasRenderingContext2D | null = null;

function backdropFor(width: number, height: number): CanvasRenderingContext2D | null {
	if (!backdropContext) {
		if (typeof document === 'undefined') return null;
		backdropContext = document.createElement('canvas').getContext('2d');
		if (!backdropContext) return null;
	}
	const canvas = backdropContext.canvas;
	if (canvas.width < width) canvas.width = width;
	if (canvas.height < height) canvas.height = height;
	return backdropContext;
}

function blendOverBackdrop(
	ctx: CanvasRenderingContext2D,
	rect: BlockRect,
	presence: number,
	draw: () => void
): void {
	const transform = ctx.getTransform();
	const left = Math.max(0, Math.floor((rect.x - 2) * transform.a + transform.e));
	const top = Math.max(0, Math.floor((rect.y - 2) * transform.d + transform.f));
	const width = Math.min(ctx.canvas.width - left, Math.ceil((rect.width + 4) * transform.a));
	const height = Math.min(ctx.canvas.height - top, Math.ceil((rect.height + 4) * transform.d));
	const backdrop = width > 0 && height > 0 ? backdropFor(width, height) : null;
	if (!backdrop) {
		draw();
		return;
	}
	backdrop.clearRect(0, 0, width, height);
	backdrop.drawImage(ctx.canvas, left, top, width, height, 0, 0, width, height);
	draw();
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1 - presence;
	ctx.drawImage(backdrop.canvas, 0, 0, width, height, left, top, width, height);
	ctx.restore();
}

function paintBlock(
	ctx: CanvasRenderingContext2D,
	block: PianoNoteBlock,
	frame: BlockFrame,
	rect: BlockRect,
	fill: string,
	selected: boolean,
	presence: number,
	opacity: number
): void {
	const { metrics } = frame;
	const { x, y: drawY, width: drawWidth, height: drawHeight } = rect;
	const conflict = block.conflict === true;
	const alpha = (conflict ? 0.96 : noteLevelAlpha(block.level)) * opacity;
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = conflict ? CONFLICT_FILL : fill;
	ctx.fillRect(x, drawY, drawWidth, drawHeight);
	const lightBlock = colorLuminance(fill) > 0.55;
	const ink = lightBlock ? '#1a1c23' : '#f8fafc';
	drawVolumeAndDelay(ctx, block, x, drawY, drawWidth, drawHeight, ink);
	if (drawWidth >= 10) {
		ctx.fillStyle = ink;
		ctx.globalAlpha = alpha * 0.78;
		ctx.fillRect(x + drawWidth - 3, drawY + 1, 2, Math.max(1, drawHeight - 2));
		ctx.globalAlpha = alpha;
	}
	ctx.strokeStyle = selected
		? frame.selectedStroke
		: lightBlock
			? 'rgba(0,0,0,0.4)'
			: 'rgba(255,255,255,0.28)';
	ctx.lineWidth = selected ? 2 : 1;
	ctx.strokeRect(x + 0.5, drawY + 0.5, drawWidth - 1, drawHeight - 1);
	ctx.lineWidth = 1;
	drawPitchGestures(ctx, block, metrics, x, drawY, drawWidth, drawHeight, fill, ink, opacity);
	if (drawHeight >= 8 && drawWidth >= 12 && presence > 0.45) {
		ctx.font = '9px ui-monospace, monospace';
		const label = blockCaption(ctx, block, Math.max(0, drawWidth - 6));
		if (label) {
			ctx.beginPath();
			ctx.rect(x + 1, drawY + 1, Math.max(0, drawWidth - 2), Math.max(0, drawHeight - 2));
			ctx.clip();
			ctx.textBaseline = 'middle';
			ctx.lineWidth = 2;
			ctx.strokeStyle = lightBlock ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.75)';
			ctx.fillStyle = ink;
			const textX = Math.max(x + 3, 3);
			const textY = drawY + drawHeight / 2;
			ctx.strokeText(label, textX, textY);
			ctx.fillText(label, textX, textY);
		}
	}
	if (conflict && drawHeight >= 8 && drawWidth >= 8) {
		ctx.font = 'bold 12px ui-monospace, monospace';
		ctx.fillStyle = CONFLICT_MARK;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		ctx.fillText('!', x + drawWidth - 3, drawY + drawHeight / 2);
		ctx.textAlign = 'left';
	}
	ctx.restore();
	if (selected) {
		ctx.save();
		ctx.globalCompositeOperation = 'difference';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(x, drawY, drawWidth, drawHeight);
		ctx.restore();
	}
}

function drawVolumeAndDelay(
	ctx: CanvasRenderingContext2D,
	block: PianoNoteBlock,
	x: number,
	drawY: number,
	drawWidth: number,
	drawHeight: number,
	ink: string
): void {
	for (const gesture of block.gestures) {
		if (gesture.kind === 'volume') {
			const gradient = ctx.createLinearGradient(x, drawY, x + drawWidth, drawY);
			if (gesture.down >= gesture.up) {
				gradient.addColorStop(0, 'rgba(0,0,0,0)');
				gradient.addColorStop(1, `rgba(0,0,0,${0.25 + gesture.down * 0.55})`);
			} else {
				gradient.addColorStop(0, `rgba(255,255,255,${0.2 + gesture.up * 0.55})`);
				gradient.addColorStop(1, 'rgba(255,255,255,0)');
			}
			ctx.fillStyle = gradient;
			ctx.fillRect(x, drawY, drawWidth, drawHeight);
		} else if (gesture.kind === 'delay') {
			const inset = Math.max(2, Math.min(drawWidth * 0.7, drawWidth * gesture.portion));
			ctx.fillStyle = 'rgba(0,0,0,0.38)';
			ctx.fillRect(x, drawY, inset, drawHeight);
			ctx.save();
			ctx.strokeStyle = ink;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x + inset, drawY);
			ctx.lineTo(x + inset, drawY + drawHeight);
			ctx.stroke();
			ctx.restore();
		}
	}
}

function drawPitchGestures(
	ctx: CanvasRenderingContext2D,
	block: PianoNoteBlock,
	metrics: PianoRollMetrics,
	x: number,
	drawY: number,
	drawWidth: number,
	drawHeight: number,
	fill: string,
	ink: string,
	presence: number
): void {
	if (block.gestures.length === 0) return;
	ctx.save();
	ctx.strokeStyle = ink;
	ctx.lineWidth = 1.5;
	ctx.lineCap = 'round';
	ctx.globalAlpha = noteLevelAlpha(block.level) * 0.98 * presence;
	const mid = drawY + drawHeight / 2;
	for (const gesture of block.gestures) {
		if (gesture.kind === 'slide-up' || gesture.kind === 'slide-down') {
			const rise = Math.max(2, (drawHeight - 3) * gesture.amount);
			const startY = gesture.kind === 'slide-up' ? drawY + drawHeight - 2 : drawY + 2;
			const endY = gesture.kind === 'slide-up' ? startY - rise : startY + rise;
			ctx.beginPath();
			ctx.moveTo(x + 2, startY);
			ctx.lineTo(x + Math.max(3, drawWidth - 3), endY);
			ctx.stroke();
		} else if (gesture.kind === 'vibrato') {
			const amp = Math.max(1.5, gesture.depth * drawHeight * 0.32);
			const cycles = 1 + gesture.speed * 3;
			const steps = Math.max(8, Math.floor(drawWidth));
			ctx.beginPath();
			for (let index = 0; index <= steps; index++) {
				const t = index / steps;
				const px = x + t * drawWidth;
				const py = mid + Math.sin(t * cycles * Math.PI * 2) * amp;
				if (index === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.stroke();
		} else if (gesture.kind === 'portamento') {
			const fromY =
				gesture.fromPitch === null
					? mid + Math.max(metrics.keyHeight, gesture.amount * 6 * metrics.keyHeight)
					: mid - (gesture.fromPitch - block.pitchIndex) * metrics.keyHeight;
			ctx.beginPath();
			ctx.moveTo(x, fromY);
			ctx.lineTo(x + drawWidth * (0.2 + gesture.amount * 0.55), mid);
			ctx.stroke();
		} else if (gesture.kind === 'arpeggio') {
			ctx.save();
			ctx.strokeStyle = fill;
			ctx.globalAlpha = noteLevelAlpha(block.level) * 0.78 * presence;
			ctx.lineWidth = 2;
			ctx.setLineDash([3, 2]);
			for (const step of gesture.steps) {
				const tickY = mid - step * metrics.keyHeight;
				ctx.beginPath();
				ctx.moveTo(x, tickY);
				ctx.lineTo(x + drawWidth, tickY);
				ctx.stroke();
			}
			ctx.restore();
		}
	}
	ctx.restore();
}

function drawTypedLaneValue(
	ctx: CanvasRenderingContext2D,
	barColor: string,
	label: string,
	x: number,
	rowWidth: number,
	height: number
): void {
	const chars = [...label];
	if (chars.length === 0) return;
	const stacked = rowWidth < chars.length * 8;
	const fontSize = stacked
		? Math.max(11, Math.min(18, Math.floor((rowWidth - 1) / 0.56)))
		: Math.max(12, Math.min(16, Math.floor(rowWidth * 0.62)));
	const line = fontSize + 1;
	const textHeight = stacked ? line * chars.length : line;
	const boxHeight = Math.min(height - 4, textHeight + 4);
	const top = Math.max(2, (height - boxHeight) / 2);
	const light = colorLuminance(barColor) > 0.42;
	ctx.save();
	ctx.fillStyle = barColor;
	ctx.fillRect(x + 0.5, top, Math.max(2, rowWidth - 1), boxHeight);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = light ? '#14161c' : '#f8fafc';
	ctx.font = `700 ${fontSize}px ui-monospace, monospace`;
	const centerX = x + rowWidth / 2;
	if (stacked) {
		const start = top + (boxHeight - textHeight) / 2 + line / 2;
		for (let index = 0; index < chars.length; index++) {
			ctx.fillText(chars[index] ?? '', centerX, start + index * line);
		}
	} else {
		ctx.fillText(label, centerX, top + boxHeight / 2);
	}
	ctx.restore();
}

function drawEffectColumn(
	ctx: CanvasRenderingContext2D,
	colors: PianoPalette,
	label: string,
	x: number,
	rowWidth: number,
	height: number
): void {
	const chars = [...label].slice(0, 4);
	if (chars.length === 0) return;
	const glyphColors = getEffectFormatCharColors(label);
	const slot = height / chars.length;
	const fontSize = Math.max(
		6,
		Math.min(22, Math.floor(slot * 0.82), Math.floor((rowWidth - 2) / 0.62))
	);
	ctx.save();
	ctx.font = `${fontSize}px ui-monospace, monospace`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for (let index = 0; index < chars.length; index++) {
		const paint = effectGlyphPaint(colors, glyphColors[index] ?? EFFECT_FORMAT_COLORS.literal);
		ctx.globalAlpha = paint.alpha;
		ctx.fillStyle = paint.fill;
		ctx.fillText(chars[index] ?? '', x + rowWidth / 2, slot * index + slot / 2);
	}
	ctx.restore();
}

function effectGlyphPaint(
	colors: PianoPalette,
	glyphColor: string
): { fill: string; alpha: number } {
	if (glyphColor === EFFECT_FORMAT_COLORS.code) return { fill: colors.effect, alpha: 1 };
	if (glyphColor === EFFECT_FORMAT_COLORS.delay) return { fill: colors.envelope, alpha: 1 };
	if (glyphColor === EFFECT_FORMAT_COLORS.parameter) return { fill: colors.note, alpha: 1 };
	if (glyphColor === EFFECT_FORMAT_COLORS.table) return { fill: colors.table, alpha: 1 };
	return { fill: colors.text, alpha: 0.45 };
}
