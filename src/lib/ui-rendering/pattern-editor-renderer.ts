import type { PatternEditorTextParser, FieldSegment } from './pattern-editor-text-parser';
import type { Chip } from '../chips/types';
import { BaseCanvasRenderer, type BaseRenderOptions } from './base-canvas-renderer';
import { PatternTemplateParser } from '../services/pattern/editing/pattern-template-parsing';
import type { getColors } from '../utils/colors';
import type { VirtualChannelGroup } from '../models/virtual-channels';
import {
	isEffectFieldKey,
	MAX_CHANNEL_EFFECT_COLUMNS,
	MIN_CHANNEL_EFFECT_COLUMNS,
	resolveSchemaField,
	schemaHasChannelEffects
} from '../chips/base/channel-effect-columns';
import { emptyNoteBaselineYOffset, type EmptyNoteAlignment } from './empty-note-alignment';

export const CHANNEL_LEVEL_STRIP_HEIGHT = 6;

export function getChannelLevelStripDeviceRect(
	lineHeight: number,
	cssWidth: number,
	scale: number
): { x: number; y: number; width: number; height: number } {
	const safeScale = scale > 0 ? scale : 1;
	return {
		x: 0,
		y: Math.round(lineHeight * safeScale),
		width: Math.max(0, Math.round(cssWidth * safeScale)),
		height: Math.max(0, Math.round(CHANNEL_LEVEL_STRIP_HEIGHT * safeScale))
	};
}

const EFFECT_COLUMN_CONTROL_MIN_WIDTH = 10;
const EFFECT_COLUMN_CONTROL_MAX_WIDTH = 14;

export interface PatternEditorRenderOptions extends Omit<BaseRenderOptions, 'colors'> {
	colors: ReturnType<typeof getColors>;
	lineHeight: number;
	schema: Chip['schema'];
	channelSeparatorWidth: number;
	selectionStyle: 'inverted' | 'filled';
	emptyNoteAlignment: EmptyNoteAlignment;
}

export interface RowRenderData {
	rowString: string;
	y: number;
	isSelected: boolean;
	rowIndex: number;
	selectedColumn: number;
	segments: FieldSegment[];
	cellPositions: ReturnType<PatternEditorTextParser['getCellPositions']>;
	channelMuted: boolean[];
	selectionStartCol?: number | null;
	selectionEndCol?: number | null;
}

interface RowLayoutPixels {
	channelPositions: number[];
	globalColumns: Array<{ fieldKey: string; x: number; width: number }>;
	anchorSeparatorXs: number[];
}

export interface ChannelLabelData {
	rowString: string;
	channelLabels: string[];
	channelMuted: boolean[];
	virtualChannelGroups?: VirtualChannelGroup[];
	channelRoleMarks?: (string | null)[];
	channelLevels?: number[];
	effectColumnControlsEnabled?: boolean;
}

export interface RoleDriveLink {
	sourceIndex: number;
	voiceIndex: number;
}

export function roleDriveLinks(
	groups: readonly { virtualChannelIndices: readonly number[] }[] | undefined,
	marks: readonly (string | null)[] | undefined
): RoleDriveLink[] {
	if (!groups || !marks) return [];
	const links: RoleDriveLink[] = [];
	for (const group of groups) {
		const indices = group.virtualChannelIndices;
		if (indices.length < 2) continue;
		const sources = indices.filter((index) => Boolean(marks[index]));
		const voices = indices.filter((index) => !marks[index]);
		if (sources.length === 0 || voices.length === 0) continue;
		for (const sourceIndex of sources) {
			for (const voiceIndex of voices) {
				links.push({ sourceIndex, voiceIndex });
			}
		}
	}
	return links;
}

export type ChannelEffectColumnControlAction = 'add' | 'remove';

export interface ChannelEffectColumnControlHit {
	channelIndex: number;
	action: ChannelEffectColumnControlAction;
}

export class PatternEditorRenderer extends BaseCanvasRenderer {
	private lineHeight: number;
	private schema: Chip['schema'];
	private patternColors: ReturnType<typeof getColors>;
	private channelSeparatorWidth: number;
	private selectionStyle: 'inverted' | 'filled';
	private emptyNoteAlignment: EmptyNoteAlignment;
	private emptyNoteBaselineOffset: number | null = null;
	private layoutCacheKey = '';
	private layoutCache: RowLayoutPixels = {
		channelPositions: [],
		globalColumns: [],
		anchorSeparatorXs: []
	};
	private anchorSeparatorXs: number[] = [];
	private effectColumnCounts: number[] = [];
	private effectColumnControlsEnabled = true;

	constructor(options: PatternEditorRenderOptions) {
		super(options);
		this.lineHeight = options.lineHeight;
		this.schema = options.schema;
		this.patternColors = options.colors;
		this.channelSeparatorWidth = options.channelSeparatorWidth;
		this.selectionStyle = options.selectionStyle;
		this.emptyNoteAlignment = options.emptyNoteAlignment;
	}

	setChannelEffectColumnCounts(counts: number[]): void {
		this.effectColumnCounts = counts;
	}

	drawRow(data: RowRenderData): void {
		this.drawRowBackground(data);
		this.drawRowText(data);
		this.drawInvertedSelectionOverlay(data);
	}

	drawChannelLabels(data: ChannelLabelData): void {
		this.effectColumnControlsEnabled = data.effectColumnControlsEnabled !== false;
		const channelPositions = this.calculateChannelPositions(data.rowString);
		const centerY = this.lineHeight / 2;
		const borderWidth = 1;
		const hasLevels = data.channelLevels !== undefined;

		this.fillRect(0, 0, this.canvasWidth, this.lineHeight, this.patternColors.patternBg);

		this.save();
		const currentFont = this.ctx.font;
		let boldFont = currentFont;
		if (!/\b(bold|700|800|900)\b/.test(currentFont)) {
			boldFont = currentFont.replace(/^(\d+px\s+)/, '$1bold ');
		}
		this.setFont(boldFont);
		this.setTextBaseline('middle');

		if (this.schema.globalColumnLabels) {
			const globalPositions = this.calculateGlobalColumnPositions(data.rowString);
			const textColor = this.patternColors.patternRowNum || this.patternColors.patternText;
			for (const { fieldKey, x, width } of globalPositions) {
				const label = this.schema.globalColumnLabels[fieldKey];
				if (label) {
					const labelWidth = this.measureText(label);
					const textX = x + (width - labelWidth) / 2;
					this.fillText(
						label,
						textX,
						this.getVerticallyCenteredTextY(label, centerY),
						textColor
					);
				}
			}
		}

		const separatorMargin = 4;
		const hasVirtualGroups =
			data.virtualChannelGroups &&
			data.virtualChannelGroups.some((g) => g.virtualChannelIndices.length > 1);

		if (hasVirtualGroups && data.virtualChannelGroups) {
			this.drawVirtualChannelGroupLabels(
				data,
				channelPositions,
				separatorMargin,
				borderWidth
			);
		} else {
			for (let i = 0; i < data.channelLabels.length && i < channelPositions.length; i++) {
				this.drawSingleChannelLabel(
					this.channelHeaderText(this.formatChannelHeaderLabel(data.channelLabels[i]), i, data),
					i,
					channelPositions,
					separatorMargin,
					borderWidth,
					data.channelMuted[i] ?? false
				);
			}
		}

		if (hasLevels) {
			this.drawChannelLevelStrip(data, channelPositions, separatorMargin);
		}

		this.restore();
	}

	drawChannelLevelStripOnOverlay(
		overlayCtx: CanvasRenderingContext2D,
		data: ChannelLabelData
	): void {
		const channelPositions =
			data.channelLevels !== undefined ? this.calculateChannelPositions(data.rowString) : [];
		const saved = this.ctx;
		this.ctx = overlayCtx;
		overlayCtx.clearRect(0, 0, this.canvasWidth, CHANNEL_LEVEL_STRIP_HEIGHT);
		if (data.channelLevels !== undefined) {
			this.drawChannelLevelStrip(data, channelPositions, 4, 0);
		}
		this.ctx = saved;
	}

	private drawVirtualChannelGroupLabels(
		data: ChannelLabelData,
		channelPositions: number[],
		separatorMargin: number,
		borderWidth: number
	): void {
		const groups = data.virtualChannelGroups!;

		for (const group of groups) {
			const indices = group.virtualChannelIndices;
			const isVirtualGroup = indices.length > 1;

			if (!isVirtualGroup) {
				const idx = indices[0];
				if (idx < channelPositions.length) {
					this.drawSingleChannelLabel(
						this.channelHeaderText(
							this.formatChannelHeaderLabel(group.hardwareLabel),
							idx,
							data
						),
						idx,
						channelPositions,
						separatorMargin,
						borderWidth,
						data.channelMuted[idx] ?? false
					);
				}
				continue;
			}

			const firstIdx = indices[0];
			const lastIdx = indices[indices.length - 1];
			if (firstIdx >= channelPositions.length) continue;

			for (let vi = 0; vi < indices.length; vi++) {
				const vchIdx = indices[vi];
				if (vchIdx >= channelPositions.length) continue;
				const virtualLabel = group.virtualLabels[vi] ?? '';
				let suffix = virtualLabel.startsWith(group.hardwareLabel)
					? virtualLabel.slice(group.hardwareLabel.length)
					: virtualLabel;
				suffix = suffix.replace(/^[:\-\s]+/, '');
				const virtualText = suffix ? `${group.hardwareLabel}:${suffix}` : group.hardwareLabel;
				this.drawSingleChannelLabel(
					this.channelHeaderText(virtualText, vchIdx, data),
					vchIdx,
					channelPositions,
					separatorMargin,
					borderWidth,
					data.channelMuted[vchIdx] ?? false
				);
			}

			const groupStart = channelPositions[firstIdx];
			const groupEnd = this.channelColumnEnd(lastIdx, channelPositions);
			const groupX = Math.max(0, groupStart - separatorMargin);
			const groupWidth =
				(groupEnd < this.canvasWidth ? groupEnd - separatorMargin : this.canvasWidth) -
				groupX;
			const groupBorderColor =
				this.patternColors.patternCellSelected ||
				this.patternColors.patternSelected ||
				this.patternColors.patternText;

			this.save();
			this.ctx.globalAlpha = 0.6;
			this.ctx.lineWidth = 2;
			this.ctx.strokeStyle = groupBorderColor;
			const buttonHeight = this.lineHeight - 4;
			const buttonY = (this.lineHeight - buttonHeight) / 2;
			this.ctx.strokeRect(groupX, buttonY, groupWidth, buttonHeight);
			this.restore();
			this.drawRoleHeaderLinks(
				roleDriveLinks([group], data.channelRoleMarks),
				data,
				channelPositions,
				separatorMargin
			);
		}
	}

	private channelHeaderText(label: string, index: number, data: ChannelLabelData): string {
		const mark = data.channelRoleMarks?.[index];
		return mark ? `${label} ${mark}` : label;
	}

	private formatChannelHeaderLabel(label: string): string {
		if (label.includes(' ') || label.length > 2) {
			return label;
		}
		return `Channel ${label}`;
	}

	private drawSingleChannelLabel(
		label: string,
		index: number,
		channelPositions: number[],
		separatorMargin: number,
		borderWidth: number,
		isMuted: boolean
	): void {
		const channelStart = channelPositions[index];
		const channelEnd = this.channelColumnEnd(index, channelPositions);
		const buttonX = Math.max(0, channelStart - separatorMargin);
		const buttonEnd =
			channelEnd < this.canvasWidth ? channelEnd - separatorMargin : this.canvasWidth;
		const buttonWidth = buttonEnd - buttonX;
		const buttonHeight = this.lineHeight - 4;
		const buttonY = (this.lineHeight - buttonHeight) / 2;
		const centerY = buttonY + buttonHeight / 2;
		const labelWidth = this.measureText(label);
		const showEffectControls = schemaHasChannelEffects(this.schema);
		const controlLayout = this.getEffectColumnControlLayout(buttonHeight);
		const controlsWidth = showEffectControls
			? controlLayout.width * 2 + controlLayout.gap + controlLayout.margin * 2
			: 0;
		const textAreaWidth = Math.max(0, buttonWidth - controlsWidth);
		const textX = buttonX + Math.max(0, (textAreaWidth - (labelWidth - 8)) / 2);
		const headerColor = this.patternColors.patternRowNum || this.patternColors.patternText;
		const textColor = isMuted ? this.patternColors.patternEmpty : headerColor;
		const borderColor = isMuted
			? this.patternColors.patternEmpty
			: this.patternColors.patternCellSelected ||
				this.patternColors.patternSelected ||
				this.patternColors.patternText;
		const bgColor = this.patternColors.patternSelected || this.patternColors.patternBg;

		this.fillRectWithAlpha(buttonX, buttonY, buttonWidth, buttonHeight, bgColor, 0.3);

		this.save();
		this.ctx.globalAlpha = 0.4;
		this.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight, borderColor, borderWidth);
		this.restore();

		this.fillText(label, textX, this.getVerticallyCenteredTextY(label, centerY), textColor);
		if (showEffectControls) {
			this.drawEffectColumnControls(
				index,
				buttonX,
				buttonWidth,
				buttonY,
				buttonHeight,
				headerColor,
				centerY
			);
		}
	}

	private getVerticallyCenteredTextY(text: string, centerY: number): number {
		const metrics = this.ctx.measureText(text);
		const ascent = metrics.actualBoundingBoxAscent;
		const descent = metrics.actualBoundingBoxDescent;
		if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
			return centerY;
		}
		return centerY + (ascent - descent) / 2;
	}

	private getEffectColumnControlLayout(buttonHeight: number): {
		width: number;
		gap: number;
		margin: number;
		hitPadX: number;
	} {
		const compact = buttonHeight <= 12;
		const width = Math.max(
			EFFECT_COLUMN_CONTROL_MIN_WIDTH,
			Math.min(EFFECT_COLUMN_CONTROL_MAX_WIDTH, Math.round(buttonHeight * 0.7))
		);
		return {
			width,
			gap: compact ? 1 : 2,
			margin: compact ? 1 : 2,
			hitPadX: Math.max(4, Math.round(width * 0.5))
		};
	}

	private getEffectColumnControlRects(
		buttonX: number,
		buttonWidth: number,
		buttonY: number,
		buttonHeight: number
	): {
		remove: { x: number; y: number; width: number; height: number };
		add: { x: number; y: number; width: number; height: number };
	} {
		const { width, gap, margin } = this.getEffectColumnControlLayout(buttonHeight);
		const addX = buttonX + buttonWidth - margin - width;
		const removeX = addX - gap - width;
		return {
			remove: { x: removeX, y: 0, width, height: this.lineHeight },
			add: { x: addX, y: 0, width, height: this.lineHeight }
		};
	}

	private getEffectColumnControlHitRects(
		buttonX: number,
		buttonWidth: number,
		buttonY: number,
		buttonHeight: number
	): {
		remove: { x: number; y: number; width: number; height: number };
		add: { x: number; y: number; width: number; height: number };
	} {
		const layout = this.getEffectColumnControlLayout(buttonHeight);
		const visual = this.getEffectColumnControlRects(
			buttonX,
			buttonWidth,
			buttonY,
			buttonHeight
		);
		const splitX = visual.remove.x + visual.remove.width + layout.gap / 2;
		const removeLeft = visual.remove.x - layout.hitPadX;
		const addRight = visual.add.x + visual.add.width + layout.hitPadX;
		return {
			remove: {
				x: removeLeft,
				y: 0,
				width: splitX - removeLeft,
				height: this.lineHeight
			},
			add: {
				x: splitX,
				y: 0,
				width: addRight - splitX,
				height: this.lineHeight
			}
		};
	}

	private drawEffectColumnControls(
		channelIndex: number,
		buttonX: number,
		buttonWidth: number,
		buttonY: number,
		buttonHeight: number,
		textColor: string,
		centerY: number
	): void {
		const count = this.effectColumnCounts[channelIndex] ?? MIN_CHANNEL_EFFECT_COLUMNS;
		const rects = this.getEffectColumnControlRects(buttonX, buttonWidth, buttonY, buttonHeight);
		const canRemove = this.effectColumnControlsEnabled && count > MIN_CHANNEL_EFFECT_COLUMNS;
		const canAdd = this.effectColumnControlsEnabled && count < MAX_CHANNEL_EFFECT_COLUMNS;
		this.drawEffectColumnControl(rects.remove, 'remove', textColor, canRemove, centerY);
		this.drawEffectColumnControl(rects.add, 'add', textColor, canAdd, centerY);
	}

	private drawEffectColumnControl(
		rect: { x: number; y: number; width: number; height: number },
		action: ChannelEffectColumnControlAction,
		textColor: string,
		enabled: boolean,
		centerY: number
	): void {
		this.save();
		this.ctx.globalAlpha = enabled ? 0.85 : 0.28;
		this.ctx.lineCap = 'square';
		const cx = Math.floor(rect.x + rect.width / 2) + 0.5;
		const cy = centerY;
		const iconSpan = Math.min(rect.width, 12);
		const arm = Math.max(2, Math.round(iconSpan * 0.22));
		this.beginPath();
		this.moveTo(cx - arm, cy);
		this.lineTo(cx + arm, cy);
		if (action === 'add') {
			this.moveTo(cx, cy - arm);
			this.lineTo(cx, cy + arm);
		}
		this.stroke(textColor, 1);
		this.restore();
	}

	hitTestEffectColumnControl(
		x: number,
		y: number,
		rowString: string
	): ChannelEffectColumnControlHit | null {
		if (!schemaHasChannelEffects(this.schema)) return null;
		if (y < 0 || y > this.lineHeight) return null;
		const channelPositions = this.calculateChannelPositions(rowString);
		const separatorMargin = 4;
		const buttonHeight = this.lineHeight - 4;
		const buttonY = (this.lineHeight - buttonHeight) / 2;

		for (let index = 0; index < channelPositions.length; index++) {
			const channelStart = channelPositions[index];
			const channelEnd = this.channelColumnEnd(index, channelPositions);
			const buttonX = Math.max(0, channelStart - separatorMargin);
			const buttonEnd =
				channelEnd < this.canvasWidth ? channelEnd - separatorMargin : this.canvasWidth;
			const buttonWidth = buttonEnd - buttonX;
			const rects = this.getEffectColumnControlHitRects(
				buttonX,
				buttonWidth,
				buttonY,
				buttonHeight
			);
			const count = this.effectColumnCounts[index] ?? MIN_CHANNEL_EFFECT_COLUMNS;
			const controlsEnabled = this.effectColumnControlsEnabled;
			if (
				this.pointInControl(x, y, rects.remove) &&
				(!controlsEnabled || count > MIN_CHANNEL_EFFECT_COLUMNS)
			) {
				return { channelIndex: index, action: 'remove' };
			}
			if (
				this.pointInControl(x, y, rects.add) &&
				(!controlsEnabled || count < MAX_CHANNEL_EFFECT_COLUMNS)
			) {
				return { channelIndex: index, action: 'add' };
			}
		}
		return null;
	}

	private pointInControl(
		x: number,
		y: number,
		rect: { x: number; y: number; width: number; height: number }
	): boolean {
		return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
	}

	private drawChannelLevelStrip(
		data: ChannelLabelData,
		channelPositions: number[],
		separatorMargin: number,
		stripTopY: number = this.lineHeight
	): void {
		const levels = data.channelLevels;
		if (!levels) return;

		const barHeight = Math.max(2, Math.round(CHANNEL_LEVEL_STRIP_HEIGHT * 0.5));
		const barY = stripTopY + Math.floor((CHANNEL_LEVEL_STRIP_HEIGHT - barHeight) / 2);

		for (let i = 0; i < channelPositions.length; i++) {
			const channelStart = channelPositions[i];
			const channelEnd = this.channelColumnEnd(i, channelPositions);
			const buttonX = Math.max(0, channelStart - separatorMargin);
			const buttonEnd =
				channelEnd < this.canvasWidth ? channelEnd - separatorMargin : this.canvasWidth;
			const buttonWidth = buttonEnd - buttonX;
			const isMuted = data.channelMuted[i] ?? false;
			const level = isMuted ? 0 : (levels[i] ?? 0);

			this.drawCenteredChannelLevelBar(buttonX, buttonWidth, barY, barHeight, level, isMuted);
		}
	}

	private drawCenteredChannelLevelBar(
		buttonX: number,
		buttonWidth: number,
		barY: number,
		barHeight: number,
		level: number,
		isMuted: boolean
	): void {
		const barWidth = Math.max(10, Math.round(buttonWidth * 0.85));
		const barX = buttonX + (buttonWidth - barWidth) / 2;
		const fillColor = isMuted
			? this.patternColors.patternEmpty
			: this.patternColors.patternNote || this.patternColors.patternText;
		const clamped = Math.min(1, Math.max(0, level));
		const fillWidth = Math.round(barWidth * clamped);
		if (fillWidth <= 0) return;

		const fillX = barX + (barWidth - fillWidth) / 2;
		this.fillRectWithAlpha(fillX, barY, fillWidth, barHeight, fillColor, isMuted ? 0.35 : 0.85);
	}

	drawChannelSeparators(
		rowString: string,
		canvasHeight: number,
		virtualChannelGroups?: VirtualChannelGroup[]
	): void {
		const channelPositions = this.calculateChannelPositions(rowString);

		if (channelPositions.length === 0 || this.channelSeparatorWidth <= 0) return;

		const groupBoundaryIndices = new Set<number>();
		if (virtualChannelGroups) {
			for (const group of virtualChannelGroups) {
				if (group.virtualChannelIndices.length > 0) {
					groupBoundaryIndices.add(group.virtualChannelIndices[0]);
				}
			}
		}

		const hasVirtualGroups =
			virtualChannelGroups &&
			virtualChannelGroups.some((g) => g.virtualChannelIndices.length > 1);

		this.save();

		const margin = 4;
		const startY = this.lineHeight;

		const separatorXs = [
			...channelPositions,
			...this.anchorSeparatorXs.filter((anchorX) => !channelPositions.includes(anchorX))
		];
		for (let i = 0; i < separatorXs.length; i++) {
			const x = Math.floor(separatorXs[i] - margin) + 0.5;
			const channelIndex = channelPositions.indexOf(separatorXs[i]);
			const isGroupBoundary = channelIndex >= 0 && groupBoundaryIndices.has(channelIndex);

			if (hasVirtualGroups && !isGroupBoundary) {
				this.ctx.strokeStyle =
					this.patternColors.patternChannelSeparator || this.patternColors.patternEmpty;
				this.ctx.lineWidth = Math.max(1, this.channelSeparatorWidth - 1);
				this.ctx.setLineDash([4, 4]);
			} else {
				this.ctx.strokeStyle =
					this.patternColors.patternChannelSeparator || this.patternColors.patternEmpty;
				this.ctx.lineWidth = this.channelSeparatorWidth;
				this.ctx.setLineDash([]);
			}

			this.beginPath();
			this.moveTo(x, startY);
			this.lineTo(x, canvasHeight);
			this.stroke();
		}

		this.ctx.setLineDash([]);
		this.restore();
	}

	private roleSignalColor(isMuted: boolean): string {
		if (isMuted) return this.patternColors.patternEmpty;
		return this.patternColors.patternNote || this.patternColors.patternText;
	}

	private channelHeaderButton(
		index: number,
		channelPositions: number[],
		separatorMargin: number
	): { x: number; y: number; width: number; height: number } | null {
		if (index < 0 || index >= channelPositions.length) return null;
		const channelStart = channelPositions[index];
		const channelEnd = this.channelColumnEnd(index, channelPositions);
		const x = Math.max(0, channelStart - separatorMargin);
		const end = channelEnd < this.canvasWidth ? channelEnd - separatorMargin : this.canvasWidth;
		const width = end - x;
		const height = this.lineHeight - 4;
		const y = (this.lineHeight - height) / 2;
		if (width <= 0) return null;
		return { x, y, width, height };
	}

	private drawRoleHeaderLinks(
		links: RoleDriveLink[],
		data: ChannelLabelData,
		channelPositions: number[],
		separatorMargin: number
	): void {
		if (links.length === 0) return;
		this.save();
		this.ctx.lineCap = 'butt';
		this.ctx.lineJoin = 'miter';
		this.ctx.setLineDash([]);
		for (const link of links) {
			const source = this.channelHeaderButton(link.sourceIndex, channelPositions, separatorMargin);
			const voice = this.channelHeaderButton(link.voiceIndex, channelPositions, separatorMargin);
			if (!source || !voice) continue;
			this.drawCurvedHeaderArrow(
				source,
				voice,
				this.roleSignalColor(data.channelMuted[link.sourceIndex] ?? false),
				Math.abs(link.voiceIndex - link.sourceIndex)
			);
		}
		this.restore();
	}

	private drawCurvedHeaderArrow(
		source: { x: number; y: number; width: number; height: number },
		voice: { x: number; y: number; width: number; height: number },
		color: string,
		separation: number
	): void {
		const fromX = source.x + source.width / 2;
		const toX = voice.x + voice.width / 2;
		const span = Math.abs(toX - fromX);
		if (span < 4) return;
		const fromY = this.lineHeight;
		const floorY = this.lineHeight + CHANNEL_LEVEL_STRIP_HEIGHT + 4 + Math.max(1, separation) * 5;
		const arrowLength = 7;
		this.beginPath();
		this.moveTo(fromX, fromY);
		this.lineTo(fromX, floorY);
		this.lineTo(toX, floorY);
		this.lineTo(toX, fromY + arrowLength);
		this.stroke(color, 1.5);
		this.fillArrowHead(toX, fromY, 0, -1, color);
	}

	private fillArrowHead(x: number, y: number, ux: number, uy: number, color: string): void {
		const length = 7;
		const wing = 3.5;
		const px = -uy;
		const py = ux;
		const baseX = x - ux * length;
		const baseY = y - uy * length;
		this.beginPath();
		this.moveTo(x, y);
		this.lineTo(baseX + px * wing, baseY + py * wing);
		this.lineTo(baseX - px * wing, baseY - py * wing);
		this.ctx.closePath();
		this.ctx.fillStyle = color;
		this.ctx.fill();
	}

	calculateGlobalColumnPositions(
		rowString: string
	): Array<{ fieldKey: string; x: number; width: number }> {
		return this.getRowLayout(rowString).globalColumns;
	}

	calculateChannelPositions(rowString: string): number[] {
		return this.getRowLayout(rowString).channelPositions;
	}

	private getRowLayout(rowString: string): RowLayoutPixels {
		const cacheKey = `${this.ctx.font}\0${rowString}\0${this.effectColumnCounts.join(',')}`;
		if (cacheKey === this.layoutCacheKey) {
			this.anchorSeparatorXs = this.layoutCache.anchorSeparatorXs;
			return this.layoutCache;
		}

		const marks: Array<{
			kind: 'global' | 'channel';
			pos: number;
			fieldKey?: string;
			length?: number;
		}> = [];
		PatternTemplateParser.walkRow(rowString, this.schema, this.effectColumnCounts, {
			onGlobalField(key, field, pos) {
				marks.push({ kind: 'global', pos, fieldKey: key, length: field.length });
			},
			onChannelStart(_index, pos) {
				marks.push({ kind: 'channel', pos });
			}
		});

		const xAt: number[] = [10];
		for (let i = 0; i < rowString.length; i++) {
			xAt.push(xAt[i] + this.measureText(rowString[i]));
		}

		const channelPositions: number[] = [];
		const globalColumns: Array<{ fieldKey: string; x: number; width: number }> = [];
		for (const mark of marks) {
			const x = xAt[mark.pos] ?? 10;
			if (mark.kind === 'channel') {
				channelPositions.push(x);
			} else if (mark.fieldKey && mark.length) {
				const end = xAt[mark.pos + mark.length] ?? x;
				globalColumns.push({ fieldKey: mark.fieldKey, x, width: end - x });
			}
		}

		const firstChannelX = channelPositions[0] ?? Number.POSITIVE_INFINITY;
		const anchorSeparatorXs = globalColumns
			.filter((column) => column.x >= firstChannelX)
			.map((column) => column.x);
		const layout = { channelPositions, globalColumns, anchorSeparatorXs };
		this.layoutCacheKey = cacheKey;
		this.layoutCache = layout;
		this.anchorSeparatorXs = anchorSeparatorXs;
		return layout;
	}

	private channelColumnEnd(index: number, channelPositions: number[]): number {
		const start = channelPositions[index] ?? 0;
		let end =
			index < channelPositions.length - 1 ? channelPositions[index + 1] : this.canvasWidth;
		for (const anchorX of this.anchorSeparatorXs) {
			if (anchorX > start && anchorX < end) end = anchorX;
		}
		return end;
	}

	private isAlternateRow(rowIndex: number): boolean {
		return rowIndex % 4 === 0;
	}

	private drawRowBackground(data: RowRenderData): void {
		if (this.isAlternateRow(data.rowIndex)) {
			this.fillRect(
				0,
				data.y,
				this.canvasWidth,
				this.lineHeight,
				this.patternColors.patternAlternate
			);
		}

		if (
			data.selectionStartCol !== null &&
			data.selectionStartCol !== undefined &&
			data.selectionEndCol !== null &&
			data.selectionEndCol !== undefined
		) {
			const startCol = Math.min(data.selectionStartCol, data.selectionEndCol);
			const endCol = Math.max(data.selectionStartCol, data.selectionEndCol);

			if (startCol < data.cellPositions.length && endCol < data.cellPositions.length) {
				const firstCell = data.cellPositions[startCol];
				const lastCell = data.cellPositions[endCol];
				const selectionX = Math.floor(firstCell.x);
				const selectionWidth = Math.ceil(lastCell.x + lastCell.width) - selectionX;

				if (this.selectionStyle === 'filled') {
					this.fillRectWithAlpha(
						selectionX,
						data.y,
						selectionWidth,
						this.lineHeight,
						this.patternColors.patternCellSelected,
						0.25
					);
				}
			}
		} else if (data.isSelected) {
			this.fillRect(
				0,
				data.y,
				this.canvasWidth,
				this.lineHeight,
				this.patternColors.patternSelected
			);
		}

		if (
			data.isSelected &&
			data.selectedColumn < data.cellPositions.length &&
			(data.selectionStartCol === null || data.selectionStartCol === undefined)
		) {
			const cellPos = data.cellPositions[data.selectedColumn];
			this.fillRect(
				cellPos.x - 1,
				data.y,
				cellPos.width + 2,
				this.lineHeight,
				this.patternColors.patternCellSelected
			);
		}
	}

	private drawInvertedSelectionOverlay(data: RowRenderData): void {
		if (this.selectionStyle !== 'inverted') return;
		if (
			data.selectionStartCol === null ||
			data.selectionStartCol === undefined ||
			data.selectionEndCol === null ||
			data.selectionEndCol === undefined
		)
			return;

		const startCol = Math.min(data.selectionStartCol, data.selectionEndCol);
		const endCol = Math.max(data.selectionStartCol, data.selectionEndCol);
		if (startCol >= data.cellPositions.length || endCol >= data.cellPositions.length) return;

		const firstCell = data.cellPositions[startCol];
		const lastCell = data.cellPositions[endCol];
		const selectionX = Math.floor(firstCell.x);
		const selectionWidth = Math.ceil(lastCell.x + lastCell.width) - selectionX;

		this.save();
		this.ctx.globalCompositeOperation = 'difference';
		this.fillRect(selectionX, data.y, selectionWidth, this.lineHeight, '#ffffff');
		this.restore();
	}

	private drawRowText(data: RowRenderData): void {
		let x = 10;
		let segmentIndex = 0;
		let currentSegment = data.segments[0];
		const originalAlpha = this.ctx.globalAlpha;
		const channelIndexByChar = this.buildChannelIndexByChar(data.rowString);
		const baseY = data.y + this.lineHeight / 2;
		const emptyNoteYOffset =
			this.emptyNoteAlignment === 'baseline' ? this.getEmptyNoteBaselineOffset() : 0;

		for (let i = 0; i < data.rowString.length; i++) {
			const char = data.rowString[i];

			if (char === ' ') {
				x += this.measureText(' ');
				continue;
			}

			while (currentSegment && i >= currentSegment.end) {
				segmentIndex++;
				currentSegment = data.segments[segmentIndex];
			}

			const channelIndex = channelIndexByChar[i] ?? -1;
			const isMuted = channelIndex >= 0 && data.channelMuted[channelIndex];

			if (isMuted) {
				this.ctx.globalAlpha = originalAlpha * 0.4;
			} else {
				this.ctx.globalAlpha = originalAlpha;
			}

			const color = this.determineCharColor(char, data, currentSegment, i);
			const fieldText = currentSegment
				? data.rowString.substring(currentSegment.start, currentSegment.end)
				: '';
			const y = fieldText === '---' ? baseY + emptyNoteYOffset : baseY;
			this.fillText(char, x, y, color);
			x += this.measureText(char);
		}

		this.ctx.globalAlpha = originalAlpha;
	}

	private getEmptyNoteBaselineOffset(): number {
		if (this.emptyNoteBaselineOffset !== null) {
			return this.emptyNoteBaselineOffset;
		}
		this.emptyNoteBaselineOffset = emptyNoteBaselineYOffset(
			this.ctx.measureText('-'),
			this.ctx.measureText('.'),
			this.lineHeight * 0.12
		);
		return this.emptyNoteBaselineOffset;
	}

	private buildChannelIndexByChar(rowString: string): Int16Array {
		const indices = new Int16Array(rowString.length);
		indices.fill(-1);

		PatternTemplateParser.walkRow(rowString, this.schema, this.effectColumnCounts, {
			onChannelField(channelIndex, _key, field, pos) {
				const end = Math.min(pos + field.length, rowString.length);
				for (let i = pos; i < end; i++) {
					indices[i] = channelIndex;
				}
			}
		});

		return indices;
	}

	private getEmptyFieldColor(data: RowRenderData): string {
		if (data.isSelected) {
			return this.patternColors.patternEmptySelected;
		}
		return this.isAlternateRow(data.rowIndex)
			? this.patternColors.patternAlternateEmpty
			: this.patternColors.patternEmpty;
	}

	private determineCharColor(
		char: string,
		data: RowRenderData,
		currentSegment: FieldSegment | undefined,
		index: number
	): string {
		let color = this.patternColors.patternText;
		if (currentSegment) {
			color = currentSegment.color;
		}

		const fieldText = currentSegment
			? data.rowString.substring(currentSegment.start, currentSegment.end)
			: '';

		const field = currentSegment
			? resolveSchemaField(this.schema, currentSegment.fieldKey)
			: undefined;

		const isEmptyField = fieldText && fieldText.split('').every((c) => c === '.' || c === '-');

		if ((char === '.' || char === '-') && isEmptyField) {
			const isAtomic = field?.selectable === 'atomic';
			if (isAtomic) {
				if (fieldText === '---') {
					return this.getEmptyFieldColor(data);
				} else {
					return color;
				}
			} else {
				return this.getEmptyFieldColor(data);
			}
		}

		if (currentSegment && !isEmptyField) {
			const isNoteField = field?.type === 'note';
			const isEffectField = isEffectFieldKey(currentSegment.fieldKey);

			if (char === '.' && isEffectField) {
				return this.getEmptyFieldColor(data);
			}

			if (isNoteField) {
				if (fieldText === 'OFF' || fieldText === '===') {
					return this.patternColors.patternNoteOff;
				}

				const validNotePattern = /^[A-G][#-]\d$/;
				const isPartOfValidNote = validNotePattern.test(fieldText);

				if ((char === '.' || char === '-') && !isPartOfValidNote) {
					return this.getEmptyFieldColor(data);
				}
			}

			const isTableField = currentSegment?.fieldKey === 'table';
			if (isTableField && fieldText === '0') {
				return this.patternColors.patternTableOff;
			}
		}

		return color;
	}
}
