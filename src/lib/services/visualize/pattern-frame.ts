import type { Project } from '../../models/project';
import { Pattern } from '../../models/song';
import type { ChipSchema } from '../../chips/base/schema';
import type { PatternConverter } from '../../chips/base/adapter';
import type { PatternFormatter } from '../../chips/base/formatter-interface';
import { getChipByType } from '../../chips/registry';
import { getPatternEffectColumnCounts } from '../../chips/base/channel-effect-columns';
import {
	getVirtualChannelGroups,
	virtualChannelRoleMarks
} from '../../models/virtual-channels';
import { PatternRowDataService } from '../pattern/pattern-row-data-service';
import { PatternVisibleRowsService } from '../pattern/pattern-visible-rows';
import { PatternEditorRenderer } from '../../ui-rendering/pattern-editor-renderer';
import { PatternEditorTextParser } from '../../ui-rendering/pattern-editor-text-parser';
import {
	applyInstrumentColorsToSegments,
	createInstrumentCarryLookup,
	instrumentColorsById
} from '../../ui-rendering/instrument-pattern-colors';
import type { EmptyNoteAlignment } from '../../ui-rendering/empty-note-alignment';
import { getColors } from '../../utils/colors';
import { Cache } from '../../utils/memoize';
import type { RowMotion } from './playback-position';
import { displayPt3Effects, pt3RecorderSchema } from './pt3-effect-display';
import {
	choosePatternFontSize,
	patternContentWidth,
	patternFont,
	PATTERN_LINE_HEIGHT_MULTIPLIER
} from './pattern-layout';

export type PatternFrameOptions = {
	canvas: HTMLCanvasElement;
	project: Project;
	songIndex: number;
	fontFamily: string;
	selectionStyle: 'inverted' | 'filled';
	emptyNoteAlignment: EmptyNoteAlignment;
};

export async function createPatternRollFrame(
	options: PatternFrameOptions
): Promise<PatternRollFrame> {
	const frame = new PatternRollFrame(options);
	await frame.prepare();
	return frame;
}

class PatternRollFrame {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly project: Project;
	private readonly songIndex: number;
	private readonly fontFamily: string;
	private readonly selectionStyle: 'inverted' | 'filled';
	private readonly emptyNoteAlignment: EmptyNoteAlignment;
	private readonly width: number;
	private readonly height: number;
	private contentWidth = 0;
	private offsetX = 0;
	private patternBg = '#1e1e2e';
	private schema!: ChipSchema;
	private converter!: PatternConverter;
	private formatter!: PatternFormatter;
	private font = '16px monospace';
	private fontSize = 16;
	private lineHeight = 24;
	private renderer!: PatternEditorRenderer;
	private textParser!: PatternEditorTextParser;
	private readonly patternCache = new Cache<number, ReturnType<PatternConverter['toGeneric']>>(200);
	private readonly rowCache = new Cache<string, string>(10000);
	private readonly segmentCache = new Cache<string, ReturnType<PatternEditorTextParser['parseRowString']>>(10000);
	private readonly cellCache = new Cache<string, ReturnType<PatternEditorTextParser['getCellPositions']>>(10000);
	private instrumentCarry: ReturnType<typeof createInstrumentCarryLookup> | null = null;
	private instrumentColors = new Map<string, string>();
	private rowsCanvas: HTMLCanvasElement | null = null;
	private rowsContext: CanvasRenderingContext2D | null = null;
	private stripKey = '';

	constructor(options: PatternFrameOptions) {
		const context = options.canvas.getContext('2d', { alpha: false });
		if (!context) {
			throw new Error('Could not create the pattern canvas');
		}
		this.canvas = options.canvas;
		this.ctx = context;
		this.project = options.project;
		this.songIndex = options.songIndex;
		this.fontFamily = options.fontFamily || 'JetBrains Mono';
		this.selectionStyle = options.selectionStyle;
		this.emptyNoteAlignment = options.emptyNoteAlignment;
		this.width = options.canvas.width;
		this.height = options.canvas.height;
	}

	async prepare(): Promise<void> {
		const song = this.project.songs[this.songIndex];
		if (!song?.chipType) {
			throw new Error('Song has no chip');
		}
		const chip = getChipByType(song.chipType);
		if (!chip) {
			throw new Error(`No chip available for ${song.chipType}`);
		}
		this.schema = pt3RecorderSchema(chip.schema);
		this.converter = chip.createConverter();
		this.formatter = chip.createFormatter();
		let family = this.fontFamily;
		try {
			await document.fonts.load(`16px "${family}"`);
		} catch {
			family = 'monospace';
		}

		const widest = this.widestRowString();
		this.fontSize = choosePatternFontSize(this.width, this.height, (size) => {
			this.ctx.font = patternFont(size, family);
			return 10 + this.ctx.measureText(widest).width + 24;
		});
		this.lineHeight = this.fontSize * PATTERN_LINE_HEIGHT_MULTIPLIER;
		this.font = patternFont(this.fontSize, family);
		try {
			await document.fonts.load(this.font);
		} catch {
			this.font = `${this.fontSize}px monospace`;
		}
		this.ctx.font = this.font;
		this.ctx.textAlign = 'left';
		this.ctx.textBaseline = 'middle';
		const textEnd = this.measuredTextEnd(widest);
		const trailingGap = this.ctx.measureText(' ').width;
		this.contentWidth = patternContentWidth(this.width, textEnd, trailingGap);
		this.offsetX = Math.floor((this.width - this.contentWidth) / 2);

		const colors = getColors();
		this.patternBg = colors.patternBg;
		this.textParser = new PatternEditorTextParser(
			this.schema,
			this.formatter,
			colors,
			this.ctx,
			this.segmentCache,
			this.cellCache
		);
		this.renderer = new PatternEditorRenderer({
			ctx: this.ctx,
			colors,
			canvasWidth: this.contentWidth,
			lineHeight: this.lineHeight,
			schema: this.schema,
			channelSeparatorWidth: Math.max(1, Math.round(this.fontSize / 14)),
			selectionStyle: this.selectionStyle,
			emptyNoteAlignment: this.emptyNoteAlignment
		});
		this.rowsCanvas = document.createElement('canvas');
		this.rowsCanvas.width = Math.max(1, this.contentWidth);
		this.rowsCanvas.height = this.height;
		const rowsContext = this.rowsCanvas.getContext('2d', { alpha: false });
		if (!rowsContext) {
			throw new Error('Could not create the pattern canvas');
		}
		this.rowsContext = rowsContext;
		this.instrumentColors = instrumentColorsById(this.project.instruments);
		this.instrumentCarry =
			this.instrumentColors.size > 0
				? createInstrumentCarryLookup(this.patternOrder(), (patternId) => this.findPattern(patternId))
				: null;
	}

	draw(motion: RowMotion): void {
		const key = `${motion.orderIndex}:${motion.row}`;
		if (key === this.stripKey) return;
		if (this.rowsContext && this.rowsCanvas) {
			this.useContext(this.rowsContext);
			this.paintRows(motion, this.rowsCanvas.height);
		}
		this.useContext(this.ctx);
		this.ctx.fillStyle = this.patternBg;
		this.ctx.fillRect(0, 0, this.width, this.height);
		this.ctx.imageSmoothingEnabled = false;
		if (this.rowsCanvas) {
			this.ctx.drawImage(this.rowsCanvas, this.offsetX, 0);
		}
		this.ctx.save();
		this.ctx.translate(this.offsetX, 0);
		try {
			this.paintHeader(motion);
		} finally {
			this.ctx.restore();
		}
		this.stripKey = key;
	}

	private useContext(ctx: CanvasRenderingContext2D): void {
		ctx.font = this.font;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.imageSmoothingEnabled = false;
		this.renderer.setDrawingContext(ctx);
	}

	private paintRows(motion: RowMotion, stripHeight: number): void {
		const ctx = this.rowsContext;
		if (!ctx) return;
		this.renderer.drawBackground(stripHeight);

		const patternOrder = this.patternOrder();
		if (patternOrder.length === 0) return;
		const orderIndex = Math.min(Math.max(motion.orderIndex, 0), patternOrder.length - 1);
		const patternId = patternOrder[orderIndex] ?? 0;
		const pattern = this.findPattern(patternId);
		if (!pattern || pattern.length === 0) return;

		const row = Math.min(Math.max(motion.row, 0), pattern.length - 1);
		const { rows } = PatternVisibleRowsService.getVisibleRows(
			pattern,
			{
				patterns: this.patterns(),
				patternOrder,
				currentPatternOrderIndex: orderIndex,
				selectedRow: row,
				canvasHeight: this.height,
				lineHeight: this.lineHeight,
				createPatternIfMissing: (missingId) => this.missingPattern(missingId)
			},
			null
		);
		for (const visible of rows) {
			if (visible.isEmpty || visible.rowIndex < 0) continue;
			const patternToDraw = this.findPattern(visible.patternIndex);
			if (!patternToDraw || visible.rowIndex >= patternToDraw.length) continue;
			ctx.globalAlpha = visible.isGhost ? 0.3 : 1;
			const rowString = this.rowString(patternToDraw, visible.rowIndex);
			const parsed = this.textParser.parseRowString(rowString, visible.rowIndex);
			const segments = this.instrumentCarry
				? applyInstrumentColorsToSegments(
						parsed,
						rowString,
						this.instrumentColors,
						this.instrumentCarry.idsAt(visible.orderIndex, visible.rowIndex)
					)
				: parsed;
			this.renderer.drawRow({
				rowString,
				y: visible.displayIndex * this.lineHeight,
				isSelected: visible.isSelected,
				rowIndex: visible.rowIndex,
				selectedColumn: -1,
				segments,
				cellPositions: this.textParser.getCellPositions(rowString, visible.rowIndex),
				channelMuted: patternToDraw.channels.map(() => false)
			});
		}
		ctx.globalAlpha = 1;
	}

	private paintHeader(motion: RowMotion): void {
		const located = this.locatedPattern(motion);
		if (!located) return;
		const headerString = this.rowString(located.pattern, 0);
		const groups = getVirtualChannelGroups(
			this.schema.channelLabels ?? ['A', 'B', 'C'],
			this.song()?.virtualChannelMap ?? {}
		);
		this.renderer.drawChannelSeparators(headerString, this.height, groups);
		const song = this.song();
		const hwLabels = this.schema.channelLabels ?? ['A', 'B', 'C'];
		this.renderer.drawChannelLabels({
			rowString: headerString,
			channelLabels: located.pattern.channels.map((channel) => channel.label),
			channelMuted: located.pattern.channels.map(() => false),
			virtualChannelGroups: groups,
			channelRoleMarks: song
				? virtualChannelRoleMarks(
						located.pattern.channels.length,
						hwLabels,
						song.virtualChannelMap,
						song.virtualChannelRoles,
						this.schema.virtualChannelRoles
					)
				: undefined,
			effectColumnControlsEnabled: false,
			showEffectColumnControls: false,
			showGlobalColumnLabels: false
		});
	}

	private locatedPattern(
		motion: RowMotion
	): { pattern: Pattern; orderIndex: number; row: number } | null {
		const patternOrder = this.patternOrder();
		if (patternOrder.length === 0) return null;
		const orderIndex = Math.min(Math.max(motion.orderIndex, 0), patternOrder.length - 1);
		const patternId = patternOrder[orderIndex] ?? 0;
		const pattern = this.findPattern(patternId);
		if (!pattern || pattern.length === 0) return null;
		return {
			pattern,
			orderIndex,
			row: Math.min(Math.max(motion.row, 0), pattern.length - 1)
		};
	}

	private song() {
		return this.project.songs[this.songIndex];
	}

	private patterns(): Pattern[] {
		return this.song()?.patterns ?? [];
	}

	private patternOrder(): number[] {
		return this.project.patternOrder?.length ? this.project.patternOrder : [0];
	}

	private findPattern(patternId: number): Pattern | undefined {
		return this.patterns().find((pattern) => pattern.id === patternId);
	}

	private missingPattern(patternId: number): Pattern {
		return new Pattern(patternId, 0);
	}

	private rowString(pattern: Pattern, rowIndex: number): string {
		const counts = getPatternEffectColumnCounts(pattern);
		this.textParser.setChannelEffectColumnCounts(counts);
		this.renderer.setChannelEffectColumnCounts(counts);
		return this.formattedRow(pattern, rowIndex, counts);
	}

	private formattedRow(pattern: Pattern, rowIndex: number, counts: number[]): string {
		const row = PatternRowDataService.getRowData({
			pattern,
			rowIndex,
			converter: this.converter,
			formatter: this.formatter,
			schema: this.schema,
			patternGenericCache: this.patternCache,
			rowStringCache: this.rowCache
		});
		const commands = pattern.channels.map((channel) => {
			const command = channel.rows[rowIndex]?.pt3EffectCommand;
			return typeof command === 'string' ? command : undefined;
		});
		return displayPt3Effects(row, this.schema, counts, commands);
	}

	private measuredTextEnd(row: string): number {
		let x = 10;
		for (const char of row) {
			x += this.ctx.measureText(char).width;
		}
		return x;
	}

	private widestRowString(): string {
		let widest = '';
		for (const pattern of this.patterns()) {
			if (pattern.length <= 0) continue;
			const sample = this.formattedRow(pattern, 0, getPatternEffectColumnCounts(pattern));
			if (sample.length > widest.length) widest = sample;
		}
		return widest || '00';
	}

}
