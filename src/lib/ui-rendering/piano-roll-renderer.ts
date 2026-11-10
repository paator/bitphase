import { formatHex, formatSymbol } from '../chips/base/field-formatters';
import { getColors } from '../utils/colors';
import { numberToInstrumentId } from '../utils/instrument-id';
import { formatNoteFromEnum, tuningTableIndexToNote } from '../utils/note-utils';
import { NoteName } from '../models/song';
import { EFFECT_FORMAT_COLORS, getEffectFormatCharColors } from '../chips/base/effect-format-color';
import { PatternEffectHandling } from '../services/pattern/editing/pattern-effect-handling';
import {
	isBlackPitch,
	pitchToY,
	rowToX,
	type ContentRect,
	type PianoRollMetrics
} from '../services/piano-roll/piano-roll-geometry';
import { formatPianoTypedLabel } from '../services/piano-roll/piano-hex-input';
import { laneValueIsTyped } from '../services/piano-roll/piano-symbol-input';
import {
	pianoLaneBarValue,
	noteLevelAlpha,
	timelineSpanIndex,
	type PianoGateMarker,
	type PianoNoteBlock,
	type PianoRollLane,
	type PianoTimelineSpan
} from '../services/piano-roll/piano-roll-model';

export type PianoRollColors = ReturnType<typeof getColors>;

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
	selectedBlock: { startRow: number; pitchIndex: number } | null;
	selectedNotes?: readonly { startRow: number; pitchIndex: number }[];
	marquee?: ContentRect | null;
	hiddenBlock: { startRow: number; pitchIndex: number } | null;
	hiddenBlocks?: readonly { startRow: number; pitchIndex: number }[];
	preview: {
		startRow: number;
		endRow: number;
		pitchIndex: number;
		color: string | null;
		instrument: number | null;
		gestures: PianoNoteBlock['gestures'];
		level?: number | null;
	} | null;
	previews?: readonly {
		startRow: number;
		endRow: number;
		pitchIndex: number;
		color: string | null;
		instrument: number | null;
		gestures: PianoNoteBlock['gestures'];
		level?: number | null;
	}[];
	leavingBlocks?: readonly { block: PianoNoteBlock; presence: number }[];
	presenceFor?: (block: PianoNoteBlock) => number;
	resolveColor: (block: PianoNoteBlock) => string | null;
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
	const channel = (a: number, b: number) => Math.round(a + (b - a) * ratio).toString(16).padStart(2, '0');
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

function pianoKeyPalette(colors: PianoRollColors): {
	whiteKey: string;
	cKey: string;
	whiteLine: string;
	cLine: string;
	blackKey: string;
	label: string;
} {
	const background = color(colors.patternBg, '#1e1e2e');
	const text = color(colors.patternText, '#cdd6f4');
	const light = colorLuminance(background) > 0.4;
	const whiteKey = light ? mixColors(background, '#ffffff', 0.42) : mixColors(background, '#f3f5fa', 0.88);
	const cKey = light ? mixColors(whiteKey, text, 0.1) : mixColors(whiteKey, background, 0.2);
	return {
		whiteKey,
		cKey,
		whiteLine: mixColors(whiteKey, light ? text : background, 0.2),
		cLine: mixColors(cKey, light ? text : background, 0.28),
		blackKey: light ? mixColors(text, background, 0.08) : mixColors(background, '#05060a', 0.42),
		label: light ? text : mixColors(background, '#101218', 0.12)
	};
}

function pianoKeyLabel(noteName: NoteName, octave: number): string {
	return formatNoteFromEnum(noteName, octave).replace('-', '');
}

function blockCaption(ctx: CanvasRenderingContext2D, block: PianoNoteBlock, maxWidth: number): string {
	const parsed = tuningTableIndexToNote(block.pitchIndex);
	const pitch = parsed ? pianoKeyLabel(parsed.noteName, parsed.octave) : '';
	const instrumentId =
		block.instrument != null && block.instrument > 0 ? numberToInstrumentId(block.instrument) : '';
	const combined = pitch && instrumentId ? `${pitch} ${instrumentId}` : pitch || instrumentId;
	if (maxWidth <= 0) return '';
	if (combined && ctx.measureText(combined).width <= maxWidth) return combined;
	if (instrumentId && ctx.measureText(instrumentId).width <= maxWidth) return instrumentId;
	if (pitch && ctx.measureText(pitch).width <= maxWidth) return pitch;
	return '';
}

export function drawPianoKeyboard(
	ctx: CanvasRenderingContext2D,
	options: {
		colors: PianoRollColors;
		width: number;
		height: number;
		scrollY: number;
		metrics: PianoRollMetrics;
	}
): void {
	const { colors, width, height, scrollY, metrics } = options;
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
	ctx.strokeStyle = color(colors.patternChannelSeparator, '#313244');
	ctx.beginPath();
	ctx.moveTo(width - 0.5, 0);
	ctx.lineTo(width - 0.5, height);
	ctx.stroke();
}

export function drawPianoGrid(ctx: CanvasRenderingContext2D, options: PianoGridDrawOptions): void {
	const {
		colors,
		width,
		height,
		rulerHeight,
		scrollX,
		scrollY,
		metrics,
		blocks,
		gates,
		spans,
		currentOrderIndex,
		cursorRow,
		selectedBlock,
		selectedNotes,
		marquee,
		hiddenBlock,
		hiddenBlocks,
		preview,
		previews,
		leavingBlocks,
		presenceFor,
		resolveColor
	} = options;
	ctx.clearRect(0, 0, width, height);
	const noteHeight = Math.max(0, height - rulerHeight);
	ctx.fillStyle = color(colors.patternBg, '#1e1e2e');
	ctx.fillRect(0, rulerHeight, width, noteHeight);
	const firstRow = Math.max(0, Math.floor(scrollX / metrics.rowWidth) - 1);
	const lastRow = Math.min(
		metrics.columns,
		Math.ceil((scrollX + width) / metrics.rowWidth) + 1
	);
	const firstFromTop = Math.max(0, Math.floor(scrollY / metrics.keyHeight) - 1);
	const lastFromTop = Math.min(
		metrics.pitchCount,
		Math.ceil((scrollY + noteHeight) / metrics.keyHeight) + 1
	);
	for (let fromTop = firstFromTop; fromTop < lastFromTop; fromTop++) {
		const pitch = metrics.pitchCount - 1 - fromTop;
		const y = rulerHeight + fromTop * metrics.keyHeight - scrollY;
		if (isBlackPitch(pitch)) {
			ctx.fillStyle = color(colors.patternAlternate, '#181825');
			ctx.fillRect(0, y, width, metrics.keyHeight);
		}
	}
	const octaveLines = new Path2D();
	const pitchLines = new Path2D();
	for (let fromTop = firstFromTop; fromTop < lastFromTop; fromTop++) {
		const pitch = metrics.pitchCount - 1 - fromTop;
		const y = rulerHeight + fromTop * metrics.keyHeight - scrollY + metrics.keyHeight - 0.5;
		const path = pitch % 12 === 0 ? octaveLines : pitchLines;
		path.moveTo(0, y);
		path.lineTo(width, y);
	}
	ctx.strokeStyle = color(colors.patternEmpty, '#313244');
	ctx.globalAlpha = 0.35;
	ctx.stroke(pitchLines);
	ctx.strokeStyle = color(colors.patternChannelSeparator, '#313244');
	ctx.globalAlpha = 0.9;
	ctx.stroke(octaveLines);
	ctx.globalAlpha = 1;
	const boundaryLines = new Path2D();
	const barLines = new Path2D();
	const beatLines = new Path2D();
	const rowLines = new Path2D();
	let spanCursor = timelineSpanIndex(spans, firstRow);
	if (spanCursor < 0) spanCursor = 0;
	for (let row = firstRow; row < lastRow; row++) {
		while (
			spanCursor < spans.length - 1 &&
			(spans[spanCursor + 1]?.startRow ?? Number.POSITIVE_INFINITY) <= row
		) {
			spanCursor++;
		}
		const span = spans[spanCursor];
		const local = span && row >= span.startRow ? row - span.startRow : row;
		const boundary = !!span && local === 0 && row === span.startRow;
		const x = row * metrics.rowWidth - scrollX + 0.5;
		const path = boundary
			? boundaryLines
			: local % 16 === 0
				? barLines
				: local % 4 === 0
					? beatLines
					: rowLines;
		path.moveTo(x, rulerHeight);
		path.lineTo(x, height);
	}
	ctx.strokeStyle = color(colors.patternEmpty, '#313244');
	ctx.globalAlpha = 0.14;
	ctx.stroke(rowLines);
	ctx.globalAlpha = 0.28;
	ctx.stroke(beatLines);
	ctx.strokeStyle = color(colors.patternChannelSeparator, '#45475a');
	ctx.globalAlpha = 0.55;
	ctx.stroke(barLines);
	ctx.globalAlpha = 0.95;
	ctx.stroke(boundaryLines);
	ctx.globalAlpha = 1;
	const viewStart = scrollX - metrics.rowWidth;
	const viewEnd = scrollX + width + metrics.rowWidth;
	const paintBlock = (block: PianoNoteBlock, presence: number) => {
		const blockStart = block.startRow * metrics.rowWidth;
		const blockEnd = block.endRow * metrics.rowWidth;
		if (blockEnd < viewStart || blockStart > viewEnd || presence <= 0) return;
		if (isSelected(block, hiddenBlock, hiddenBlocks)) return;
		drawBlock(
			ctx,
			block,
			metrics,
			scrollX,
			scrollY,
			rulerHeight,
			resolveColor(block) ?? color(colors.patternNote, '#89b4fa'),
			isSelected(block, selectedBlock, selectedNotes),
			color(colors.patternRowNum, '#89b4fa'),
			presence
		);
	};
	for (const ghost of leavingBlocks ?? []) paintBlock(ghost.block, ghost.presence);
	for (const block of blocks) paintBlock(block, presenceFor?.(block) ?? 1);
	for (const item of [...(previews ?? []), ...(preview ? [preview] : [])]) {
		drawBlock(
			ctx,
			{
				startRow: item.startRow,
				endRow: item.endRow,
				pitchIndex: item.pitchIndex,
				note: '',
				instrument: item.instrument,
				gestures: item.gestures,
				level: item.level
			},
			metrics,
			scrollX,
			scrollY,
			rulerHeight,
			item.color ?? color(colors.patternNote, '#89b4fa'),
			true,
			color(colors.patternRowNum, '#89b4fa')
		);
	}
	ctx.fillStyle = color(colors.patternBg, '#1e1e2e');
	ctx.fillRect(0, 0, width, rulerHeight);
	ctx.strokeStyle = color(colors.patternChannelSeparator, '#313244');
	ctx.beginPath();
	ctx.moveTo(0, rulerHeight - 0.5);
	ctx.lineTo(width, rulerHeight - 0.5);
	ctx.stroke();
	ctx.font = '10px ui-monospace, monospace';
	ctx.textBaseline = 'middle';
	const gateRows = new Map(gates.map((gate) => [gate.row, gate.kind]));
	const accent = color(colors.patternRowNum, '#89b4fa');
	const firstSpan = timelineSpanIndex(spans, firstRow);
	const lastSpan = timelineSpanIndex(spans, Math.max(firstRow, lastRow - 1));
	ctx.fillStyle = accent;
	for (let index = Math.max(0, firstSpan); index <= (lastSpan < 0 ? firstSpan : lastSpan); index++) {
		const span = spans[index];
		if (!span || span.orderIndex !== currentOrderIndex) continue;
		const x = span.startRow * metrics.rowWidth - scrollX;
		ctx.globalAlpha = 0.9;
		ctx.fillRect(x, 0, span.length * metrics.rowWidth, 2);
		ctx.globalAlpha = 1;
	}
	spanCursor = timelineSpanIndex(spans, firstRow);
	if (spanCursor < 0) spanCursor = 0;
	for (let row = firstRow; row < lastRow; row++) {
		while (
			spanCursor < spans.length - 1 &&
			(spans[spanCursor + 1]?.startRow ?? Number.POSITIVE_INFINITY) <= row
		) {
			spanCursor++;
		}
		const span = spans[spanCursor];
		const x = row * metrics.rowWidth - scrollX;
		const local = span && row >= span.startRow ? row - span.startRow : row;
		const boundary = !!span && row === span.startRow;
		if (boundary || (local % 4 === 0 && metrics.rowWidth >= 12)) {
			ctx.fillStyle = boundary ? accent : color(colors.patternRowNum, '#a6adc8');
			const label = boundary && span ? String(span.patternId).padStart(2, '0') : String(local);
			if (!boundary || span.length * metrics.rowWidth >= 12) ctx.fillText(label, x + 3, rulerHeight / 2);
		}
		const gate = gateRows.get(row);
		if (!gate) continue;
		ctx.fillStyle =
			gate === 'off'
				? color(colors.patternNoteOff, '#f38ba8')
				: color(colors.patternEffect, '#cba6f7');
		ctx.fillRect(x + 2, rulerHeight - 5, Math.max(4, metrics.rowWidth - 4), 3);
	}
	if (marquee) {
		const left = Math.min(marquee.x0, marquee.x1) - scrollX;
		const top = rulerHeight + Math.min(marquee.y0, marquee.y1) - scrollY;
		const boxWidth = Math.abs(marquee.x1 - marquee.x0);
		const boxHeight = Math.abs(marquee.y1 - marquee.y0);
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, rulerHeight, width, noteHeight);
		ctx.clip();
		ctx.fillStyle = color(colors.patternRowNum, '#89b4fa');
		ctx.globalAlpha = 0.18;
		ctx.fillRect(left, top, boxWidth, boxHeight);
		ctx.globalAlpha = 0.9;
		ctx.strokeStyle = color(colors.patternRowNum, '#89b4fa');
		ctx.lineWidth = 1;
		ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, boxWidth - 1), Math.max(0, boxHeight - 1));
		ctx.restore();
	}
	if (cursorRow >= 0 && cursorRow < metrics.columns) {
		const x = rowToX(cursorRow, metrics) - scrollX;
		ctx.fillStyle = color(colors.patternEmptySelected, '#5f6595');
		ctx.globalAlpha = 0.28;
		ctx.fillRect(x, rulerHeight, metrics.rowWidth, noteHeight);
		ctx.globalAlpha = 1;
		ctx.fillStyle = color(colors.patternRowNum, '#89b4fa');
		ctx.globalAlpha = 0.9;
		ctx.fillRect(x, 0, 2, height);
		ctx.globalAlpha = 1;
	}
}

export function drawPianoLane(
	ctx: CanvasRenderingContext2D,
	options: {
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
): void {
	const {
		colors,
		width,
		height,
		scrollX,
		metrics,
		lane,
		values,
		valueOrigin,
		spans,
		draft,
		cursorRow,
		envelopeAsNote = false,
		tuningTable
	} = options;
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = color(colors.patternBg, '#1e1e2e');
	ctx.fillRect(0, 0, width, height);
	const firstRow = Math.max(0, Math.floor(scrollX / metrics.rowWidth) - 1);
	const lastRow = Math.min(
		metrics.columns,
		Math.ceil((scrollX + width) / metrics.rowWidth) + 1
	);
	const boundaries = new Path2D();
	const rowLines = new Path2D();
	let spanCursor = timelineSpanIndex(spans, firstRow);
	if (spanCursor < 0) spanCursor = 0;
	for (let row = firstRow; row < lastRow; row++) {
		while (
			spanCursor < spans.length - 1 &&
			(spans[spanCursor + 1]?.startRow ?? Number.POSITIVE_INFINITY) <= row
		) {
			spanCursor++;
		}
		const span = spans[spanCursor];
		const x = row * metrics.rowWidth - scrollX + 0.5;
		const path = span && row === span.startRow ? boundaries : rowLines;
		path.moveTo(x, 0);
		path.lineTo(x, height);
	}
	ctx.strokeStyle = color(colors.patternEmpty, '#313244');
	ctx.globalAlpha = 0.14;
	ctx.stroke(rowLines);
	ctx.strokeStyle = color(colors.patternChannelSeparator, '#45475a');
	ctx.globalAlpha = 0.65;
	ctx.stroke(boundaries);
	ctx.globalAlpha = 1;
	const barColor = laneColor(colors, lane);
	ctx.font = '9px ui-monospace, monospace';
	ctx.textBaseline = 'top';
	for (let row = firstRow; row < lastRow; row++) {
		const x = row * metrics.rowWidth - scrollX;
		const valueIndex = row - valueOrigin;
		const raw =
			draft && row in draft
				? draft[row]
				: valueIndex >= 0 && valueIndex < values.length
					? values[valueIndex]
					: undefined;
		if (lane.kind === 'effect') {
			const label = effectLabel(raw);
			if (label) drawEffectColumn(ctx, colors, label, x, metrics.rowWidth, height);
			if (row === cursorRow) {
				ctx.strokeStyle = color(colors.patternRowNum, '#89b4fa');
				ctx.strokeRect(x + 1.5, 3.5, Math.max(2, metrics.rowWidth - 3), height - 7);
			}
			continue;
		}
		if (laneValueIsTyped(lane)) {
			const label = formatPianoTypedLabel(raw, lane, envelopeAsNote, tuningTable);
			if (label) drawTypedLaneValue(ctx, colors, barColor, label, x, metrics.rowWidth, height);
			if (row === cursorRow) {
				ctx.strokeStyle = color(colors.patternRowNum, '#89b4fa');
				ctx.strokeRect(x + 1.5, 3.5, Math.max(2, metrics.rowWidth - 3), height - 7);
			}
			continue;
		}
		const bar = pianoLaneBarValue(raw, lane);
		const label = valueLabel(raw, lane);
		if (bar === null && !label) continue;
		const ratio = bar === null || lane.maxValue <= 0 ? 0 : bar / lane.maxValue;
		const barHeight = bar === null ? 0 : Math.max(8, ratio * (height - 16));
		if (barHeight > 0) {
			ctx.fillStyle = barColor;
			ctx.globalAlpha = row === cursorRow ? 1 : 0.8;
			ctx.fillRect(x + 1, height - 4 - barHeight, Math.max(2, metrics.rowWidth - 2), barHeight);
			ctx.globalAlpha = 1;
		}
		if (label && metrics.rowWidth >= 16) {
			ctx.fillStyle = color(colors.patternText, '#cdd6f4');
			ctx.fillText(label, x + 2, 3);
		}
	}
	if (cursorRow >= 0 && cursorRow < metrics.columns) {
		const x = cursorRow * metrics.rowWidth - scrollX;
		ctx.fillStyle = color(colors.patternRowNum, '#89b4fa');
		ctx.globalAlpha = 0.9;
		ctx.fillRect(x, 0, 2, height);
		ctx.globalAlpha = 1;
	}
	if (lane.kind === 'effect') return;
	ctx.save();
	ctx.globalAlpha = 0.34;
	ctx.fillStyle = color(colors.patternText, '#cdd6f4');
	ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillText(lane.isGlobal ? `Chip ${lane.label}` : lane.label, 8, 6);
	ctx.restore();
}

function drawBlock(
	ctx: CanvasRenderingContext2D,
	block: PianoNoteBlock,
	metrics: PianoRollMetrics,
	scrollX: number,
	scrollY: number,
	rulerHeight: number,
	fill: string,
	selected: boolean,
	selectedStroke: string,
	presence = 1
): void {
	if (presence <= 0) return;
	const x = block.startRow * metrics.rowWidth - scrollX + 1;
	const width = Math.max(4, (block.endRow - block.startRow) * metrics.rowWidth - 2);
	const y = rulerHeight + pitchToY(block.pitchIndex, metrics) - scrollY + 1;
	const height = Math.max(3, metrics.keyHeight - 2);
	const scale = 0.86 + 0.14 * presence;
	const drawWidth = Math.max(2, width * scale);
	const drawHeight = Math.max(2, height * scale);
	const drawY = y + (height - drawHeight) / 2;
	const conflict = block.conflict === true;
	const alpha = (conflict ? 0.96 : noteLevelAlpha(block.level)) * presence;
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = conflict ? '#e64553' : fill;
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
	ctx.strokeStyle = selected ? selectedStroke : lightBlock ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.28)';
	ctx.lineWidth = selected ? 2 : 1;
	ctx.strokeRect(x + 0.5, drawY + 0.5, drawWidth - 1, drawHeight - 1);
	ctx.lineWidth = 1;
	drawPitchGestures(ctx, block, metrics, x, drawY, drawWidth, drawHeight, fill, ink, presence);
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
		ctx.fillStyle = '#fff7f7';
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

function sameNote(
	block: { startRow: number; pitchIndex: number },
	selected: { startRow: number; pitchIndex: number }
): boolean {
	return selected.startRow === block.startRow && selected.pitchIndex === block.pitchIndex;
}

function isSelected(
	block: PianoNoteBlock,
	selected: { startRow: number; pitchIndex: number } | null,
	selectedNotes?: readonly { startRow: number; pitchIndex: number }[]
): boolean {
	if (selected && sameNote(block, selected)) return true;
	return selectedNotes?.some((note) => sameNote(block, note)) ?? false;
}

function drawTypedLaneValue(
	ctx: CanvasRenderingContext2D,
	_colors: PianoRollColors,
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

function valueLabel(raw: unknown, lane: PianoRollLane): string {
	if (lane.kind === 'effect') return effectLabel(raw);
	if (lane.fieldType === 'hex' || lane.fieldType === 'symbol') {
		const text =
			lane.fieldType === 'hex'
				? formatHex(raw as number | string | null | undefined, lane.length, lane.allowZeroValue)
				: formatSymbol(raw as number | string | null | undefined, lane.length, lane.allowZeroValue);
		return /^\.+$/.test(text) ? '' : text;
	}
	if (typeof raw === 'number' && raw !== 0) return String(raw < 0 ? 0 : raw);
	return '';
}

function drawEffectColumn(
	ctx: CanvasRenderingContext2D,
	colors: PianoRollColors,
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
	colors: PianoRollColors,
	glyphColor: string
): { fill: string; alpha: number } {
	if (glyphColor === EFFECT_FORMAT_COLORS.code) {
		return { fill: color(colors.patternEffect, '#cba6f7'), alpha: 1 };
	}
	if (glyphColor === EFFECT_FORMAT_COLORS.delay) {
		return { fill: color(colors.patternEnvelope, '#a6e3a1'), alpha: 1 };
	}
	if (glyphColor === EFFECT_FORMAT_COLORS.parameter) {
		return { fill: color(colors.patternNote, '#89b4fa'), alpha: 1 };
	}
	if (glyphColor === EFFECT_FORMAT_COLORS.table) {
		return { fill: color(colors.patternTable, '#a6e3a1'), alpha: 1 };
	}
	return { fill: color(colors.patternText, '#cdd6f4'), alpha: 0.45 };
}

function effectLabel(raw: unknown): string {
	if (!raw || typeof raw !== 'object') return '';
	const effect = raw as { effect?: number; delay?: number; parameter?: number; tableIndex?: number };
	if (typeof effect.effect !== 'number') return '';
	const text = PatternEffectHandling.formatEffectAsString({
		effect: effect.effect,
		delay: effect.delay ?? 0,
		parameter: effect.parameter ?? 0,
		tableIndex: effect.tableIndex
	});
	return text === '....' ? '' : text;
}

function laneColor(colors: PianoRollColors, lane: PianoRollLane): string {
	const key = lane.color as keyof PianoRollColors | undefined;
	if (key && colors[key]) return colors[key];
	return color(colors.patternInstrument, '#a6e3a1');
}

function color(value: string | undefined, fallback: string): string {
	return value && value.length > 0 ? value : fallback;
}
