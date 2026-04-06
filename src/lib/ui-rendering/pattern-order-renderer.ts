import type { Pattern } from '../models/song';
import type { getPatternOrderColors } from '../utils/pattern-order-colors';
import type { getFonts } from '../utils/fonts';
import { parseHexColor } from '../utils/hex-color';
import { BaseCanvasRenderer, type BaseRenderOptions } from './base-canvas-renderer';

export interface PatternOrderRenderOptions extends Omit<BaseRenderOptions, 'colors'> {
	colors: ReturnType<typeof getPatternOrderColors>;
	fonts: ReturnType<typeof getFonts>;
	canvasHeight: number;
	fontSize: number;
	cellWidth: number;
	cellHeight: number;
	padding: number;
	fadeHeight: number;
}

export interface PatternCell {
	pattern: Pattern | undefined;
	patternId: number;
	y: number;
	isSelected: boolean;
	isHovered: boolean;
	isEditing: boolean;
	editingValue: string;
	index: number;
	isDragging?: boolean;
	orderIndexColor?: string;
	isLoopMarker?: boolean;
}

const CONTRAST_DARK = '#1a1a1a';
const CONTRAST_LIGHT = '#f5f5f5';

function getContrastingTextColor(hexBackground: string): string {
	const normalized = parseHexColor(hexBackground);
	if (normalized === null) return CONTRAST_DARK;
	const hex = normalized.replace(/^#/, '');
	const r = parseInt(hex.slice(0, 2), 16) / 255;
	const g = parseInt(hex.slice(2, 4), 16) / 255;
	const b = parseInt(hex.slice(4, 6), 16) / 255;
	const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
	return luminance > 0.4 ? CONTRAST_DARK : CONTRAST_LIGHT;
}

export class PatternOrderRenderer extends BaseCanvasRenderer {
	private fonts: ReturnType<typeof getFonts>;
	private canvasHeight: number;
	private fontSize: number;
	private cellWidth: number;
	private cellHeight: number;
	private padding: number;
	private fadeHeight: number;
	private orderColors: ReturnType<typeof getPatternOrderColors>;

	constructor(options: PatternOrderRenderOptions) {
		super(options);
		
		this.fonts = options.fonts;
		this.canvasHeight = options.canvasHeight;
		this.fontSize = options.fontSize;
		this.cellWidth = options.cellWidth;
		this.cellHeight = options.cellHeight;
		this.padding = options.padding;
		this.fadeHeight = options.fadeHeight;
		this.orderColors = options.colors;
	}

	updateCanvasHeight(canvasHeight: number): void {
		this.canvasHeight = canvasHeight;
	}

	drawBackground(canvasHeight: number): void {
		this.canvasHeight = canvasHeight;
		this.fillRect(0, 0, this.canvasWidth, canvasHeight, this.orderColors.orderBg);
	}

	drawPatternCell(cell: PatternCell): void {
		const cellY = cell.y - this.cellHeight / 2;
		const isEmpty = !cell.pattern;

		if (cell.isDragging) {
			this.save();
			this.ctx.globalAlpha = 0.4;
		}

		this.drawCellBackground(cell, cellY);
		this.drawCellLoopMarkerAccent(cell, cellY);
		this.drawCellText(cell, isEmpty);
		this.drawCellEditingIndicator(cell, cellY);
		this.drawCellSelectionIndicator(cell);

		if (cell.isDragging) {
			this.restore();
		}
	}

	private drawCellBackground(cell: PatternCell, cellY: number): void {
		const customColor = cell.orderIndexColor
			? parseHexColor(cell.orderIndexColor) ?? undefined
			: undefined;
		let fillColor: string;
		if (cell.isSelected) {
			fillColor = customColor ?? this.orderColors.orderSelected;
			this.fillRect(
				this.padding,
				cellY,
				this.cellWidth,
				this.cellHeight,
				fillColor
			);
			this.strokeRectPixelPerfect(
				this.padding,
				cellY,
				this.cellWidth,
				this.cellHeight,
				this.orderColors.orderBorder
			);
		} else if (cell.isHovered) {
			fillColor = customColor ?? this.orderColors.orderHovered;
			this.fillRect(
				this.padding,
				cellY,
				this.cellWidth,
				this.cellHeight,
				fillColor
			);
			this.strokeRectPixelPerfect(
				this.padding,
				cellY,
				this.cellWidth,
				this.cellHeight,
				this.orderColors.orderBorder
			);
		} else {
			fillColor =
				customColor ??
				(cell.index % 2 === 0
					? this.orderColors.orderBg
					: this.orderColors.orderAlternate);
			this.fillRect(this.padding, cellY, this.cellWidth, this.cellHeight, fillColor);
			this.strokeRectPixelPerfect(
				this.padding,
				cellY,
				this.cellWidth,
				this.cellHeight,
				this.orderColors.orderBorder
			);
		}
	}

	private drawCellText(cell: PatternCell, isEmpty: boolean): void {
		let patternText: string;
		if (cell.isEditing) {
			patternText =
				cell.editingValue === ''
					? cell.patternId.toString().padStart(2, '0')
					: cell.editingValue.padStart(2, '0');
		} else {
			patternText = cell.patternId.toString().padStart(2, '0');
		}

		let textColor: string;
		if (cell.orderIndexColor) {
			textColor = getContrastingTextColor(cell.orderIndexColor);
		} else {
			textColor = isEmpty
				? this.orderColors.orderEmpty
				: this.orderColors.orderText;
		}

		this.setTextAlign('center');
		this.setTextBaseline('middle');
		this.fillText(patternText, this.padding + this.cellWidth / 2, cell.y, textColor);
	}

	private drawCellEditingIndicator(cell: PatternCell, cellY: number): void {
		if (!cell.isEditing) return;

		this.save();
		const borderColor = this.orderColors.orderBorder;
		this.strokeRect(
			this.padding + 1,
			cellY + 1,
			this.cellWidth - 2,
			this.cellHeight - 2,
			borderColor,
			2
		);

		const patternText =
			cell.editingValue === ''
				? cell.patternId.toString().padStart(2, '0')
				: cell.editingValue.padStart(2, '0');
		const textWidth = this.measureText(patternText);
		const charWidth = textWidth / 2;
		const underlineY = cell.y + this.fontSize / 2 + 2;
		const centerX = this.padding + this.cellWidth / 2;
		const underlineX = centerX - charWidth;

		const underlineColor = cell.orderIndexColor
			? getContrastingTextColor(cell.orderIndexColor)
			: this.orderColors.orderText;
		this.beginPath();
		this.moveTo(underlineX, underlineY);
		this.lineTo(underlineX + charWidth * 2, underlineY);
		this.stroke(underlineColor, 1);
		this.restore();
		this.setTextAlign('center');
		this.setTextBaseline('middle');
	}

	private drawCellSelectionIndicator(cell: PatternCell): void {
		if (!cell.isSelected) return;

		const indicatorColor = cell.orderIndexColor
			? getContrastingTextColor(cell.orderIndexColor)
			: this.orderColors.orderText;
		this.save();
		this.setTextAlign('left');
		this.setTextBaseline('middle');
		this.fillText('►', 2, cell.y, indicatorColor);
		this.restore();
		this.setTextAlign('center');
		this.setTextBaseline('middle');
	}

	private drawCellLoopMarkerAccent(cell: PatternCell, cellY: number): void {
		if (!cell.isLoopMarker) return;

		const markerColor = cell.orderIndexColor
			? getContrastingTextColor(cell.orderIndexColor)
			: this.orderColors.orderText;
		this.fillRect(this.padding + 1, cellY + 1, 3, this.cellHeight - 2, markerColor);
	}

	drawScrollIndicators(hasMoreAbove: boolean, hasMoreBelow: boolean): void {
		if (hasMoreAbove) {
			this.drawTopFade();
			this.drawTopArrow();
		}

		if (hasMoreBelow) {
			this.drawBottomFade();
			this.drawBottomArrow();
		}
	}

	private drawTopFade(): void {
		const topGradient = this.createLinearGradient(0, 0, 0, this.fadeHeight);
		topGradient.addColorStop(0, this.orderColors.orderBg);
		topGradient.addColorStop(1, 'rgba(0,0,0,0)');
		this.ctx.fillStyle = topGradient;
		this.fillRect(0, 0, this.canvasWidth, this.fadeHeight);
	}

	private drawBottomFade(): void {
		const offset = 10;
		const fadeStart = this.canvasHeight - this.fadeHeight - offset;
		const fadeEnd = this.canvasHeight - offset;
		const bottomGradient = this.createLinearGradient(
			0,
			fadeStart,
			0,
			fadeEnd
		);
		bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
		bottomGradient.addColorStop(1, this.orderColors.orderBg);
		this.ctx.fillStyle = bottomGradient;
		this.fillRect(0, fadeStart, this.canvasWidth, this.fadeHeight);
	}

	private drawTopArrow(): void {
		this.save();
		this.setFont(`${this.fontSize}px ${this.fonts.mono}`);
		this.setTextAlign('center');
		this.setTextBaseline('top');
		this.fillText('▲', this.canvasWidth / 2, 2, this.orderColors.orderText);
		this.restore();
	}

	private drawBottomArrow(): void {
		this.save();
		this.setFont(`${this.fontSize}px ${this.fonts.mono}`);
		this.setTextAlign('center');
		this.setTextBaseline('top');
		this.fillText('▼', this.canvasWidth / 2, this.canvasHeight - this.fadeHeight + 2, this.orderColors.orderText);
		this.restore();
	}

	drawDropIndicator(y: number): void {
		const lineY = Math.round(y) + 0.5;
		this.save();
		this.ctx.setLineDash([4, 2]);
		this.beginPath();
		this.moveTo(this.padding, lineY);
		this.lineTo(this.padding + this.cellWidth, lineY);
		this.stroke(this.orderColors.orderText, 2);
		this.restore();
	}
}
