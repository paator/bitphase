<script lang="ts">
	import type { Pattern, Song } from '../../models/song';
	import type { GenericPattern } from '../../models/song/generic';
	import { getChipByType, getConverter, getFormatter } from '../../chips/registry';
	import { loadEmptyStateDemoProject } from '../../config/demo-songs';
	import { PatternRowDataService } from '../../services/pattern/pattern-row-data-service';
	import { themeService } from '../../services/theme/theme-service';
	import {
		PatternEditorRenderer
	} from '../../ui-rendering/pattern-editor-renderer';
	import {
		PatternEditorTextParser,
		type CellPosition,
		type FieldSegment
	} from '../../ui-rendering/pattern-editor-text-parser';
	import { getVirtualChannelGroups } from '../../models/virtual-channels';
	import { settingsStore } from '../../stores/settings.svelte';
	import { getColors } from '../../utils/colors';
	import { getFonts } from '../../utils/fonts';
	import { setupCanvas as setupCanvasUtil } from '../../utils/canvas-utils';
	import { Cache } from '../../utils/memoize';
	import { PATTERN_EDITOR_CONSTANTS } from './types';

	let containerDiv: HTMLDivElement | null = $state(null);
	let canvas: HTMLCanvasElement | null = $state(null);

	let pattern = $state.raw<Pattern | null>(null);
	let song = $state.raw<Song | null>(null);

	const fontSize = $derived(settingsStore.patternEditorFontSize);
	const fontFamily = $derived(settingsStore.patternEditorFontFamily);
	const lineHeight = $derived(fontSize * PATTERN_EDITOR_CONSTANTS.LINE_HEIGHT_MULTIPLIER);
	const channelSeparatorWidth = $derived(settingsStore.channelSeparatorWidth);
	const selectionStyle = $derived(settingsStore.selectionStyle);

	const rowStringCache = new Cache<string, string>();
	const patternGenericCache = new Cache<number, GenericPattern>();
	const cellPositionsCache = new Cache<string, CellPosition[]>();
	const rowSegmentsCache = new Cache<string, FieldSegment[]>();

	let ctx: CanvasRenderingContext2D | null = null;
	let renderer: PatternEditorRenderer | null = null;
	let textParser: PatternEditorTextParser | null = null;
	let canvasWidth = PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_WIDTH;
	let canvasHeight = PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_HEIGHT;

	function clearCaches(): void {
		PatternRowDataService.clearAllCaches(
			rowStringCache,
			patternGenericCache,
			cellPositionsCache,
			rowSegmentsCache
		);
	}

	function getRowString(targetPattern: Pattern, rowIndex: number): string {
		const chip = song?.chipType ? getChipByType(song.chipType) : null;
		if (!chip) return '';
		return PatternRowDataService.getRowData({
			pattern: targetPattern,
			rowIndex,
			converter: getConverter(chip),
			formatter: getFormatter(chip),
			schema: chip.schema,
			patternGenericCache,
			rowStringCache
		});
	}

	function measureSize(targetPattern: Pattern): void {
		if (containerDiv) {
			canvasHeight = Math.max(
				PATTERN_EDITOR_CONSTANTS.MIN_CANVAS_HEIGHT,
				containerDiv.clientHeight
			);
		}

		if (ctx) {
			const rowString = getRowString(targetPattern, 0);
			const width = ctx.measureText(rowString).width;
			canvasWidth = Math.max(
				PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_WIDTH,
				width + PATTERN_EDITOR_CONSTANTS.CANVAS_PADDING
			);
		}
	}

	function setupRenderer(targetPattern: Pattern, chipType: string): boolean {
		if (!canvas) return false;
		const chip = getChipByType(chipType);
		if (!chip) return false;

		ctx = canvas.getContext('2d');
		if (!ctx) return false;

		const colors = getColors();
		const fonts = getFonts();
		const effectiveFontFamily = fontFamily === 'monospace' ? 'monospace' : `"${fontFamily}"`;
		const fontFallback = fontFamily === 'monospace' ? 'monospace' : fonts.mono;
		const fontString = `${fontSize}px ${effectiveFontFamily}, ${fontFallback}`;

		ctx.font = fontString;
		measureSize(targetPattern);

		setupCanvasUtil({
			canvas,
			ctx,
			width: canvasWidth,
			height: canvasHeight,
			fontSize,
			fonts: { ...fonts, mono: fontString },
			textBaseline: 'middle'
		});
		ctx.font = fontString;

		textParser = new PatternEditorTextParser(
			chip.schema,
			getFormatter(chip),
			colors,
			ctx,
			rowSegmentsCache,
			cellPositionsCache
		);

		renderer = new PatternEditorRenderer({
			ctx,
			colors,
			canvasWidth,
			lineHeight,
			schema: chip.schema,
			channelSeparatorWidth,
			selectionStyle
		});

		return true;
	}

	function draw(): void {
		if (!ctx || !renderer || !textParser || !pattern || !song) return;

		const chip = song.chipType ? getChipByType(song.chipType) : null;
		if (!chip) return;

		renderer.drawBackground(canvasHeight);

		const muted = pattern.channels.map(() => false);
		const centerRow = Math.floor(pattern.length / 3);
		const rowsAbove = Math.floor((canvasHeight / lineHeight - 1) / 2);
		const firstRow = Math.max(0, centerRow - rowsAbove);
		const visibleCount = Math.ceil(canvasHeight / lineHeight);

		for (let displayIndex = 1; displayIndex < visibleCount; displayIndex++) {
			const rowIndex = firstRow + displayIndex - 1;
			if (rowIndex < 0 || rowIndex >= pattern.length) continue;

			const rowString = getRowString(pattern, rowIndex);
			const segments = textParser.parseRowString(rowString, rowIndex);
			const cellPositions = textParser.getCellPositions(rowString, rowIndex);

			renderer.drawRow({
				rowString,
				y: displayIndex * lineHeight,
				isSelected: false,
				rowIndex,
				selectedColumn: 0,
				segments,
				cellPositions,
				channelMuted: muted
			});
		}

		const labelRowIndex = Math.min(Math.max(firstRow, 0), pattern.length - 1);
		const labelRowString = getRowString(pattern, labelRowIndex);
		const vcGroups = getVirtualChannelGroups(
			chip.schema.channelLabels ?? ['A', 'B', 'C'],
			song.virtualChannelMap ?? {}
		);
		renderer.drawChannelSeparators(labelRowString, canvasHeight, vcGroups);
		renderer.drawChannelLabels({
			rowString: labelRowString,
			channelLabels: pattern.channels.map((channel) => channel.label),
			channelMuted: muted,
			virtualChannelGroups: vcGroups
		});
	}

	function paint(): void {
		if (!pattern || !song?.chipType) return;
		clearCaches();
		if (!setupRenderer(pattern, song.chipType)) return;
		draw();
	}

	$effect(() => {
		let cancelled = false;

		(async () => {
			const project = await loadEmptyStateDemoProject();
			if (cancelled || !project?.songs[0]) return;

			const demoSong = project.songs[0];
			const orderId = project.patternOrder[0] ?? demoSong.patterns[0]?.id ?? 0;
			const demoPattern =
				demoSong.patterns.find((entry) => entry.id === orderId) ?? demoSong.patterns[0];
			if (!demoPattern) return;

			song = demoSong;
			pattern = demoPattern;
			paint();
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		fontSize;
		fontFamily;
		channelSeparatorWidth;
		selectionStyle;
		if (!pattern || !canvas) return;
		paint();
	});

	$effect(() => {
		if (!containerDiv) return;

		const observer = new ResizeObserver(() => {
			if (!pattern) return;
			paint();
		});
		observer.observe(containerDiv);

		const unsubscribe = themeService.onColorChange(() => {
			if (!pattern) return;
			paint();
		});

		return () => {
			observer.disconnect();
			unsubscribe();
		};
	});
</script>

<div
	bind:this={containerDiv}
	class="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden blur-[2.5px]"
	aria-hidden="true">
	<canvas bind:this={canvas} class="bg-pattern-bg block opacity-80"></canvas>
</div>
