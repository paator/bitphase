<script lang="ts">
	import type { Pattern, Instrument } from '../../models/song';
	import type {
		ChipProcessor,
		TuningTableSupport,
		InstrumentSupport,
		PreviewNoteSupport
	} from '../../chips/base/processor';
	import type { AudioService } from '../../services/audio/audio-service';
	import type { Chip } from '../../chips/types';
	import { getColors } from '../../utils/colors';
	import { getFonts } from '../../utils/fonts';
	import { setupCanvas as setupCanvasUtil } from '../../utils/canvas-utils';
	import { getContext, untrack } from 'svelte';
	import { normalizeInstrumentId, isValidInstrumentId } from '../../utils/instrument-id';
	import { PATTERN_EDITOR_CONSTANTS } from './types';
	import { playbackStore } from '../../stores/playback.svelte';
	import { getFormatter, getConverter } from '../../chips/registry';
	import { PatternService } from '../../services/pattern/pattern-service';
	import { PatternNavigationService } from '../../services/pattern/pattern-navigation';
	import {
		PatternVisibleRowsService,
		type VisibleRow,
		type VisibleRowsCache
	} from '../../services/pattern/pattern-visible-rows';
	import { PatternEditingService } from '../../services/pattern/pattern-editing';
	import { PreviewService } from '../../services/audio/preview-service';
	import { PatternEditorRenderer } from '../../ui-rendering/pattern-editor-renderer';
	import { PatternEditorTextParser } from '../../ui-rendering/pattern-editor-text-parser';
	import { getColumnAtX } from '../../ui-rendering/pattern-editor-hit-test';
	import { Cache } from '../../utils/memoize';
	import { channelMuteStore } from '../../stores/channel-mute.svelte';
	import { PatternFieldDetection } from '../../services/pattern/editing/pattern-field-detection';
	import {
		PatternValueUpdates,
		type GenericFieldUpdate
	} from '../../services/pattern/editing/pattern-value-updates';

	import { EffectField } from '../../services/pattern/editing/effect-field';
	import { undoRedoStore } from '../../stores/undo-redo.svelte';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import {
		PatternFieldEditAction,
		BulkPatternEditAction,
		VirtualChannelAction,
		type PatternEditContext,
		type VirtualChannelEditContext,
		type CursorPosition
	} from '../../models/actions';
	import {
		ClipboardService,
		type ClipboardContext
	} from '../../services/pattern/clipboard-service';
	import {
		ChannelSwapService,
		type ChannelSwapContext
	} from '../../services/pattern/channel-swap-service';
	import {
		PatternKeyboardShortcutsService,
		type PatternKeyboardShortcutsContext
	} from '../../services/pattern/pattern-keyboard-shortcuts';
	import { autoEnvStore } from '../../stores/auto-env.svelte';
	import { AutoEnvService } from '../../services/pattern/auto-env-service';
	import { EnvelopeModeService } from '../../services/pattern/envelope-mode-service';
	import { PatternRowDataService } from '../../services/pattern/pattern-row-data-service';
	import {
		SelectionBoundsService,
		type SelectionBounds
	} from '../../services/pattern/selection-bounds-service';
	import {
		envelopePeriodToNote,
		noteToEnvelopePeriod
	} from '../../utils/envelope-note-conversion';
	import { themeService } from '../../services/theme/theme-service';
	import { settingsStore } from '../../stores/settings.svelte';
	import { UserScriptsService } from '../../services/user-scripts/user-scripts-service';
	import type { UserScript } from '../../services/user-scripts/types';
	import { PatternTemplateParser } from '../../services/pattern/editing/pattern-template-parsing';
	import { ContextMenu } from '../Menu';
	import type { MenuItem } from '../Menu/types';
	import { editMenuItems } from '../../config/app-menu';
	import {
		ACTION_PLAY_FROM_ROW,
		ACTION_SELECT_INSTRUMENT_OR_TABLE_IN_EDITOR
	} from '../../config/keybindings';
	import { tableDisplayCharToId } from '../../utils/table-id';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import { projectStore } from '../../stores/project.svelte';
	import {
		computeStateHorizon,
		buildCatchUpSegmentsToHorizon
	} from '../../services/audio/play-from-position';
	import {
		getVirtualChannelGroups,
		getHardwareChannelIndex,
		computeEffectiveChannelLabels,
		getTotalVirtualChannelCount
	} from '../../models/virtual-channels';
	import { VirtualChannelService } from '../../services/pattern/virtual-channel-service';
	import { AYProcessor } from '../../chips/ay/processor';
	import { midiService } from '../../services/midi/midi-service';
	import type { EditingContext, FieldInfo } from '../../services/pattern/editing/editing-context';

	let {
		songIndex,
		currentPatternOrderIndex = $bindable(0),
		selectedRow = $bindable(0),
		isActive = false,
		isPlaybackMaster = false,
		onfocus,
		canFocusOnHover = () => false,
		onaction,
		initAllChips,
		initAllChipsForPlayPattern,
		getSpeedForChip,
		getSpeedForPlayPattern,
		chip,
		chipProcessor,
		tuningTableVersion = 0
	}: {
		songIndex: number;
		currentPatternOrderIndex: number;
		selectedRow: number;
		isActive?: boolean;
		isPlaybackMaster?: boolean;
		onfocus?: () => void;
		canFocusOnHover?: () => boolean;
		onaction?: (data: { action: string }) => void;
		initAllChips?: () => void;
		initAllChipsForPlayPattern?: () => void;
		getSpeedForChip?: (chipIndex: number) => number | null;
		getSpeedForPlayPattern?: (chipIndex: number) => number | null;
		chip: Chip;
		chipProcessor: ChipProcessor;
		tuningTableVersion?: number;
	} = $props();

	const patterns = $derived(projectStore.patterns[songIndex] ?? []);
	const patternOrder = $derived(projectStore.patternOrder);
	const tuningTable = $derived(projectStore.songs[songIndex]?.tuningTable ?? []);
	const speed = $derived(projectStore.songs[songIndex]?.initialSpeed ?? 3);
	const instruments = $derived(projectStore.instruments);
	const tables = $derived(projectStore.tables);

	function updatePatterns(newPatterns: Pattern[]): void {
		projectStore.updatePatterns(songIndex, newPatterns);
	}

	let contextMenuPosition = $state<{ x: number; y: number } | null>(null);
	let channelContextMenuPosition = $state<{ x: number; y: number } | null>(null);
	let channelContextMenuHwIndex = $state<number>(-1);
	let channelContextMenuVirtualIndex = $state<number>(-1);

	const services: { audioService: AudioService } = getContext('container');

	const formatter = getFormatter(chip);
	const converter = getConverter(chip);
	const schema = chip.schema;
	const previewService = new PreviewService();
	const pressedKeyChannels = new Map<string, number>();
	let previewInitialized = false;

	$effect(() => {
		if (chipProcessor && chipProcessor.isAudioNodeAvailable()) {
			const withTuningTables = chipProcessor as ChipProcessor & Partial<TuningTableSupport>;
			const withInstruments = chipProcessor as ChipProcessor & Partial<InstrumentSupport>;
			if ('sendInitTuningTable' in chipProcessor && withTuningTables.sendInitTuningTable) {
				withTuningTables.sendInitTuningTable(tuningTable);
			}
			if ('sendInitInstruments' in chipProcessor && withInstruments.sendInitInstruments) {
				withInstruments.sendInitInstruments(instruments);
			}
			chipProcessor.sendInitTables(tables);
			previewInitialized = true;
		}
	});

	let previousEnvelopeAsNote: boolean | undefined;
	let previousDecimalRowNumbers: boolean | undefined;
	let previousTuningTable: number[] | undefined;
	let previousTuningTableVersion: number | undefined;

	$effect(() => {
		const formatterWithOpts = formatter as { tuningTable?: number[]; envelopeAsNote?: boolean };
		if ('envelopeAsNote' in formatterWithOpts) {
			formatterWithOpts.tuningTable = tuningTable;
			const versionChanged = tuningTableVersion !== previousTuningTableVersion;
			if (versionChanged) {
				previousTuningTableVersion = tuningTableVersion;
			}
			const newEnvelopeAsNote = editorStateStore.envelopeAsNote;

			const result = EnvelopeModeService.handleModeChange(
				{ patterns },
				previousEnvelopeAsNote ?? newEnvelopeAsNote,
				newEnvelopeAsNote
			);

			formatterWithOpts.envelopeAsNote = newEnvelopeAsNote;
			previousEnvelopeAsNote = newEnvelopeAsNote;

			const tuningTableChanged = tuningTable !== previousTuningTable;
			if (tuningTableChanged) {
				previousTuningTable = tuningTable;
			}

			if (result.shouldRedraw || tuningTableChanged || versionChanged) {
				if (result.shouldRedraw) {
					updatePatterns(result.updatedPatterns);
				}
				clearAllCaches();
				untrack(() => {
					if (ctx && renderer && textParser) {
						draw();
					}
				});
			}
		}
	});

	$effect(() => {
		const baseFormatter = formatter as { decimalRowNumbers?: boolean };
		const newDecimalRowNumbers = settingsStore.decimalRowNumbers;

		if (previousDecimalRowNumbers !== newDecimalRowNumbers) {
			baseFormatter.decimalRowNumbers = newDecimalRowNumbers;
			previousDecimalRowNumbers = newDecimalRowNumbers;
			clearAllCaches();
			untrack(() => {
				if (ctx && renderer && textParser) {
					draw();
				}
			});
		}
	});

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let containerDiv: HTMLDivElement;

	let COLORS = $state(getColors());
	let FONTS = $derived.by(() => {
		settingsStore.uiFontFamily;
		return getFonts();
	});

	let fontSize = $derived(settingsStore.patternEditorFontSize);
	let fontFamily = $derived(settingsStore.patternEditorFontFamily);
	let channelSeparatorWidth = $derived(settingsStore.channelSeparatorWidth);
	let selectionStyle = $derived(settingsStore.selectionStyle);
	let canvasWidth = $state(PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_WIDTH);
	let canvasHeight = $state(PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_HEIGHT);
	let lineHeight = $derived(fontSize * PATTERN_EDITOR_CONSTANTS.LINE_HEIGHT_MULTIPLIER);

	let selectedColumn = $state(0);

	let selectionStartRow = $state<number | null>(null);
	let selectionStartColumn = $state<number | null>(null);
	let selectionEndRow = $state<number | null>(null);
	let selectionEndColumn = $state<number | null>(null);
	let isSelecting = $state(false);
	let mouseDownCell: { row: number; column: number } | null = null;
	let autoScrollInterval: number | null = null;
	let autoScrollDirection: number = 0;
	let isEnterKeyHeld = $state(false);

	const rowStringCache = new Cache<string, string>(500);
	const patternGenericCache = new Cache<number, ReturnType<typeof converter.toGeneric>>(100);
	const cellPositionsCache = new Cache<
		string,
		ReturnType<PatternEditorTextParser['getCellPositions']>
	>(500);
	const rowSegmentsCache = new Cache<
		string,
		ReturnType<PatternEditorTextParser['parseRowString']>
	>(500);
	let textParser: PatternEditorTextParser | null = $state(null);
	let renderer: PatternEditorRenderer | null = $state(null);
	let lastVisibleRowsCache: VisibleRowsCache | null = null;
	let fontReady = $state(false);

	let currentPattern = $derived.by(() => {
		const patternId = patternOrder[currentPatternOrderIndex];
		return findOrCreatePattern(patternId);
	});

	function findOrCreatePattern(patternId: number): Pattern {
		const { pattern, newPatterns } = PatternService.findOrCreatePattern(patterns, patternId);
		if (newPatterns !== patterns) {
			updatePatterns(newPatterns);
		}
		return pattern;
	}

	function clearAllCaches(): void {
		PatternRowDataService.clearAllCaches(
			rowStringCache,
			patternGenericCache,
			cellPositionsCache,
			rowSegmentsCache
		);
		lastVisibleRowsCache = null;
	}

	$effect(() => {
		patterns.length;
		patternOrder.length;
		clearAllCaches();
	});

	let lastActiveState = isActive;
	$effect(() => {
		const becameActive = isActive && !lastActiveState;
		lastActiveState = isActive;

		if (becameActive) {
			clearAllCaches();
			lastVisibleRowsCache = null;
			if (ctx && renderer && textParser) {
				draw();
			}
		}
	});

	function ensurePatternExists(): Pattern | null {
		return currentPattern;
	}

	function getSelectionBounds() {
		return SelectionBoundsService.getSelectionBounds({
			selectionStartRow,
			selectionStartColumn,
			selectionEndRow,
			selectionEndColumn
		});
	}

	function updatePatternInArray(updatedPattern: Pattern): void {
		updatePatterns(PatternService.updatePatternInArray(patterns, updatedPattern));
		patternGenericCache.delete(updatedPattern.id);
		rowStringCache.invalidate((key) => {
			if (typeof key === 'string') {
				return key.startsWith(`${updatedPattern.id}:`);
			}
			return false;
		});
		lastVisibleRowsCache = null;
	}

	function createEditContext(): PatternEditContext {
		return {
			patterns,
			updatePatterns: (newPatterns: Pattern[]) => {
				updatePatterns(newPatterns);
				lastDrawnPatternLength = -1;
				lastVisibleRowsCache = null;
				clearAllCaches();
				draw();
			},
			setCursor: (position: CursorPosition) => {
				selectedRow = position.row;
				selectedColumn = position.column;
				currentPatternOrderIndex = position.patternOrderIndex;
				clearAllCaches();
				draw();
			}
		};
	}

	function getCursorPosition(): CursorPosition {
		return {
			row: selectedRow,
			column: selectedColumn,
			patternOrderIndex: currentPatternOrderIndex
		};
	}

	function recordPatternEdit(oldPattern: Pattern, newPattern: Pattern): void {
		const action = new PatternFieldEditAction(
			createEditContext(),
			oldPattern,
			newPattern,
			getCursorPosition()
		);
		undoRedoStore.pushAction(action);
	}

	function refreshAfterVirtualChannelChange(): void {
		sendVirtualChannelConfigToProcessor();
		clearAllCaches();
		updateSize();
		setupCanvas();
		draw();
	}

	function createVirtualChannelEditContext(): VirtualChannelEditContext {
		const song = projectStore.songs[songIndex];
		return {
			patterns,
			song: song!,
			updatePatterns: (newPatterns: Pattern[]) => {
				updatePatterns(newPatterns);
				lastDrawnPatternLength = -1;
				lastVisibleRowsCache = null;
			},
			setCursor: (position: CursorPosition) => {
				selectedRow = position.row;
				selectedColumn = position.column;
				currentPatternOrderIndex = position.patternOrderIndex;
			},
			onVirtualChannelChange: refreshAfterVirtualChannelChange
		};
	}

	function recordBulkPatternEdit(oldPattern: Pattern, newPattern: Pattern): void {
		const action = new BulkPatternEditAction(
			createEditContext(),
			oldPattern,
			newPattern,
			getCursorPosition()
		);
		undoRedoStore.pushAction(action);
	}

	export function resetToBeginning() {
		selectedRow = 0;
		currentPatternOrderIndex = 0;
	}

	export function setPatternOrderIndex(index: number) {
		if (index >= 0 && index < patternOrder.length) {
			currentPatternOrderIndex = index;
			pendingPlaybackPosition = null;
			playbackStartTime = performance.now();
			if (playbackRafId !== null) {
				cancelAnimationFrame(playbackRafId);
				playbackRafId = null;
			}
		}
	}

	export function getSelectedColumn(): number {
		return selectedColumn;
	}

	export function requestRedraw(): void {
		clearAllCaches();
		lastVisibleRowsCache = null;
		if (ctx && renderer && textParser) {
			draw();
		}
	}

	export function focusCanvas(): void {
		canvas?.focus();
	}

	export function getCanvas(): HTMLCanvasElement | undefined {
		return canvas;
	}

	export function getSelectedFieldKey(): string | null {
		if (patternOrder.length === 0) return null;
		const pattern = currentPattern;
		if (!pattern || selectedRow < 0 || selectedRow >= pattern.length) return null;

		const rowString = getPatternRowData(pattern, selectedRow);
		const cellPositions = getCellPositions(rowString, selectedRow);

		if (selectedColumn < 0 || selectedColumn >= cellPositions.length) return null;
		const cell = cellPositions[selectedColumn];
		return cell?.fieldKey || null;
	}

	export function getCurrentPatternLength(): number | null {
		if (patternOrder.length === 0) return null;
		const pattern = currentPattern;
		return pattern?.length ?? null;
	}

	export function getCurrentPatternOrderIndex(): number {
		return currentPatternOrderIndex;
	}

	export function setSelectedRow(row: number) {
		const pattern = currentPattern || ensurePatternExists();
		if (pattern && row >= 0 && row < pattern.length) {
			selectedRow = row;
		}
	}

	export function resizePatternTo(newLength: number): void {
		const pattern = currentPattern || ensurePatternExists();
		if (!pattern) return;

		if (newLength < 1 || newLength > 256) {
			return;
		}

		if (newLength === pattern.length) {
			return;
		}

		const resizedPattern = PatternService.resizePattern(pattern, newLength, schema);
		const newPatterns = PatternService.updatePatternInArray(patterns, resizedPattern);
		updatePatterns(newPatterns);

		if (selectedRow >= resizedPattern.length) {
			selectedRow = resizedPattern.length - 1;
		}

		lastDrawnPatternLength = -1;
		lastVisibleRowsCache = null;
		clearAllCaches();
		draw();
	}

	export function hasSelection(): boolean {
		return (
			selectionStartRow !== null &&
			selectionStartColumn !== null &&
			selectionEndRow !== null &&
			selectionEndColumn !== null &&
			(selectionStartRow !== selectionEndRow || selectionStartColumn !== selectionEndColumn)
		);
	}

	export async function applyScript(script: UserScript): Promise<void> {
		const bounds = getSelectionBounds();
		if (!bounds) return;

		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);

		const selectedChannels = getSelectedChannels(originalPattern, bounds);

		try {
			const updatedPattern = await UserScriptsService.runScript(script, {
				pattern: originalPattern,
				bounds,
				converter,
				selectedChannels
			});

			recordBulkPatternEdit(originalPattern, updatedPattern);
			updatePatternInArray(updatedPattern);
			clearAllCaches();
			draw();
		} catch (error) {
			console.error('Error executing user script:', error);
		}
	}

	function getSelectedChannels(pattern: Pattern, bounds: SelectionBounds): Set<number> {
		const channels = new Set<number>();
		const rowString = getPatternRowData(pattern, bounds.minRow);
		const cellPositions = getCellPositions(rowString, bounds.minRow);

		for (let col = bounds.minCol; col <= bounds.maxCol && col < cellPositions.length; col++) {
			const cell = cellPositions[col];
			if (!cell.fieldKey) continue;

			const isGlobal = !!schema.globalFields?.[cell.fieldKey];
			if (isGlobal) continue;

			const channelIndex = PatternTemplateParser.calculateChannelIndexForField(
				cell.fieldKey,
				cell.charIndex,
				rowString,
				schema
			);
			channels.add(channelIndex);
		}

		return channels;
	}

	export function isEnterPlayFromRowActive(): boolean {
		return isEnterKeyHeld;
	}

	export function clearEnterPlayFromRowState(): void {
		isEnterKeyHeld = false;
	}

	export function playFromCursor() {
		if (!chipProcessor || !chipProcessor.isAudioNodeAvailable()) {
			console.warn('Audio processor not available or not initialized');
			return;
		}

		try {
			if (!currentPattern) {
				console.warn('No pattern selected');
				return;
			}

			initAllChips?.();
			pendingPlaybackPosition = null;
			playbackStartTime = performance.now();
			if (playbackRafId !== null) {
				cancelAnimationFrame(playbackRafId);
				playbackRafId = null;
			}

			const chipProcessors = services.audioService.chipProcessors;
			const usePerChip = chipProcessors.length > 1;

			const buildOptions = () => {
				if (usePerChip) {
					return {
						getStartPatternForChip: (chipIndex: number) => {
							const patternId = patternOrder[currentPatternOrderIndex];
							const songPatterns = projectStore.patterns[chipIndex] ?? [];
							const schema = chipProcessors[chipIndex]?.chip?.schema;
							return (
								songPatterns.find((p) => p.id === patternId) ??
								PatternService.createEmptyPattern(patternId, schema)
							);
						},
						getCatchUpSegmentsForChip: (chipIndex: number) => {
							const songPatterns = projectStore.patterns[chipIndex] ?? [];
							const schema = chipProcessors[chipIndex]?.chip?.schema;
							const getPattern = (id: number) =>
								songPatterns.find((p) => p.id === id);
							const horizon =
								schema && songPatterns.length > 0
									? computeStateHorizon(
											patternOrder,
											getPattern,
											currentPatternOrderIndex,
											selectedRow,
											schema
										)
									: null;
							return horizon
								? buildCatchUpSegmentsToHorizon(
										patternOrder,
										getPattern,
										horizon.orderIndex,
										horizon.row
									)
								: [];
						}
					};
				}
				const getPattern = (id: number) => findOrCreatePattern(id);
				const horizon = chip.schema
					? computeStateHorizon(
							patternOrder,
							getPattern,
							currentPatternOrderIndex,
							selectedRow,
							chip.schema
						)
					: null;
				const catchUpSegments = horizon
					? buildCatchUpSegmentsToHorizon(
							patternOrder,
							getPattern,
							horizon.orderIndex,
							horizon.row
						)
					: [];
				return {
					catchUpSegments,
					startPattern: currentPattern
				};
			};

			services.audioService.playFromRow(
				selectedRow,
				currentPatternOrderIndex,
				getSpeedForChip,
				buildOptions()
			);
		} catch (error) {
			console.error('Error during playback from cursor:', error);
			services.audioService.stop();
		}
	}

	export function playPattern() {
		if (!chipProcessor || !chipProcessor.isAudioNodeAvailable()) {
			console.warn('Audio processor not available or not initialized');
			return;
		}

		try {
			if (!currentPattern) {
				console.warn('No pattern selected');
				return;
			}

			initAllChipsForPlayPattern?.();
			pendingPlaybackPosition = null;
			playbackStartTime = performance.now();
			if (playbackRafId !== null) {
				cancelAnimationFrame(playbackRafId);
				playbackRafId = null;
			}

			const chipProcessors = services.audioService.chipProcessors;
			const usePerChip = chipProcessors.length > 1;

			const buildOptions = () => {
				if (usePerChip) {
					return {
						getStartPatternForChip: (chipIndex: number) => {
							const patternId = currentPattern.id;
							const songPatterns = projectStore.patterns[chipIndex] ?? [];
							const schema = chipProcessors[chipIndex]?.chip?.schema;
							return (
								songPatterns.find((p) => p.id === patternId) ??
								PatternService.createEmptyPattern(patternId, schema)
							);
						},
						getCatchUpSegmentsForChip: (chipIndex: number) => {
							const songPatterns = projectStore.patterns[chipIndex] ?? [];
							const schema = chipProcessors[chipIndex]?.chip?.schema;
							const getPattern = (id: number) =>
								songPatterns.find((p) => p.id === id);
							const orderIndexForBacktrack =
								services.audioService.getPlayPatternId() !== null
									? Math.max(0, patternOrder.indexOf(currentPattern.id))
									: 0;
							const horizon =
								schema && songPatterns.length > 0
									? computeStateHorizon(
											patternOrder,
											getPattern,
											orderIndexForBacktrack,
											0,
											schema
										)
									: null;
							return horizon
								? buildCatchUpSegmentsToHorizon(
										patternOrder,
										getPattern,
										horizon.orderIndex,
										horizon.row
									)
								: [];
						}
					};
				}
				const getPattern = (id: number) => findOrCreatePattern(id);
				const orderIndexForBacktrack =
					services.audioService.getPlayPatternId() !== null
						? Math.max(0, patternOrder.indexOf(currentPattern.id))
						: 0;
				const horizon = chip.schema
					? computeStateHorizon(
							patternOrder,
							getPattern,
							orderIndexForBacktrack,
							0,
							chip.schema
						)
					: null;
				const catchUpSegments = horizon
					? buildCatchUpSegmentsToHorizon(
							patternOrder,
							getPattern,
							horizon.orderIndex,
							horizon.row
						)
					: [];
				return { catchUpSegments, startPattern: currentPattern };
			};

			services.audioService.playFromRow(0, 0, getSpeedForPlayPattern ?? getSpeedForChip, {
				...buildOptions()
			});
		} catch (error) {
			console.error('Error during play pattern:', error);
			services.audioService.stop();
		}
	}

	export function togglePlayback() {
		if (!chipProcessor || !chipProcessor.isAudioNodeAvailable()) {
			console.warn('Audio processor not available or not initialized');
			return;
		}

		try {
			if (!services.audioService.playing) {
				if (!currentPattern) {
					console.warn('No pattern selected');
					return;
				}

				initAllChips?.();
				pendingPlaybackPosition = null;
				playbackStartTime = performance.now();
				if (playbackRafId !== null) {
					cancelAnimationFrame(playbackRafId);
					playbackRafId = null;
				}

				const defaultGetSpeed = (index: number) =>
					projectStore.songs[index]?.initialSpeed ?? 3;
				const chipProcessors = services.audioService.chipProcessors;
				const usePerChip = chipProcessors.length > 1;
				const startRow = 0;

				const buildOptions = () => {
					if (usePerChip) {
						return {
							getStartPatternForChip: (chipIndex: number) => {
								const patternId = patternOrder[currentPatternOrderIndex];
								const songPatterns = projectStore.patterns[chipIndex] ?? [];
								const schema = chipProcessors[chipIndex]?.chip?.schema;
								return (
									songPatterns.find((p) => p.id === patternId) ??
									PatternService.createEmptyPattern(patternId, schema)
								);
							},
							getCatchUpSegmentsForChip: (chipIndex: number) => {
								const songPatterns = projectStore.patterns[chipIndex] ?? [];
								const schema = chipProcessors[chipIndex]?.chip?.schema;
								const getPattern = (id: number) =>
									songPatterns.find((p) => p.id === id);
								const horizon =
									schema && songPatterns.length > 0
										? computeStateHorizon(
												patternOrder,
												getPattern,
												currentPatternOrderIndex,
												startRow,
												schema
											)
										: null;
								return horizon
									? buildCatchUpSegmentsToHorizon(
											patternOrder,
											getPattern,
											horizon.orderIndex,
											horizon.row
										)
									: [];
							}
						};
					}
					const getPattern = (id: number) => findOrCreatePattern(id);
					const horizon = chip.schema
						? computeStateHorizon(
								patternOrder,
								getPattern,
								currentPatternOrderIndex,
								startRow,
								chip.schema
							)
						: null;
					const catchUpSegments = horizon
						? buildCatchUpSegmentsToHorizon(
								patternOrder,
								getPattern,
								horizon.orderIndex,
								horizon.row
							)
						: [];
					return {
						catchUpSegments,
						startPattern: currentPattern
					};
				};

				services.audioService.playFromRow(
					startRow,
					currentPatternOrderIndex,
					getSpeedForChip ?? defaultGetSpeed,
					buildOptions()
				);
			}
		} catch (error) {
			console.error('Error during playback toggle:', error);
			services.audioService.stop();
		}
	}

	function initPlayback() {
		sendVirtualChannelConfigToProcessor();
		chipProcessor.sendInitPattern(currentPattern, currentPatternOrderIndex);
		chipProcessor.sendInitSpeed(speed);

		const withTuningTables = chipProcessor as ChipProcessor & Partial<TuningTableSupport>;
		const withInstruments = chipProcessor as ChipProcessor & Partial<InstrumentSupport>;
		if ('sendInitTuningTable' in chipProcessor && withTuningTables.sendInitTuningTable) {
			withTuningTables.sendInitTuningTable(tuningTable);
		}
		if ('sendInitInstruments' in chipProcessor && withInstruments.sendInitInstruments) {
			withInstruments.sendInitInstruments(instruments);
		}
	}

	function pausePlayback() {
		services.audioService.stop();
	}

	function getCellPositions(
		rowString: string,
		rowIndex: number
	): ReturnType<PatternEditorTextParser['getCellPositions']> {
		if (!textParser) return [];
		return textParser.getCellPositions(rowString, rowIndex);
	}

	function getTotalCellCount(rowString: string): number {
		return rowString.replace(/\s/g, '').length;
	}

	function getVisibleRows(pattern: Pattern): VisibleRow[] {
		const { rows, cache } = PatternVisibleRowsService.getVisibleRows(
			pattern,
			{
				patterns,
				patternOrder,
				currentPatternOrderIndex,
				selectedRow,
				canvasHeight,
				lineHeight,
				createPatternIfMissing: (patternId: number) => {
					const newPattern = PatternService.createEmptyPattern(patternId);
					updatePatterns([...patterns, newPattern]);
					return newPattern;
				}
			},
			lastVisibleRowsCache
		);
		lastVisibleRowsCache = cache;
		return rows;
	}

	function setupCanvas(): boolean {
		if (!canvas) return false;

		ctx = canvas.getContext('2d')!;

		try {
			const effectiveFontFamily =
				fontFamily === 'monospace' ? 'monospace' : `"${fontFamily}"`;
			const fontFallback = fontFamily === 'monospace' ? 'monospace' : FONTS.mono;
			const fontString = `${fontSize}px ${effectiveFontFamily}, ${fontFallback}`;

			canvas.style.fontFeatureSettings = "'liga' 0, 'calt' 0";
			canvas.style.fontVariantLigatures = 'none';

			ctx.font = fontString;
			updateSize();

			setupCanvasUtil({
				canvas,
				ctx,
				width: canvasWidth,
				height: canvasHeight,
				fontSize: fontSize,
				fonts: { ...FONTS, mono: fontString },
				textBaseline: 'middle'
			});

			ctx.font = fontString;

			textParser = new PatternEditorTextParser(
				schema,
				formatter,
				COLORS,
				ctx,
				rowSegmentsCache,
				cellPositionsCache
			);

			renderer = new PatternEditorRenderer({
				ctx,
				colors: COLORS,
				canvasWidth,
				lineHeight,
				schema,
				channelSeparatorWidth,
				selectionStyle
			});

			if (fontFamily && fontFamily !== 'monospace') {
				const fontSpec = `${fontSize}px "${fontFamily}"`;
				const isFontLoaded = document.fonts.check(fontSpec);

				if (!isFontLoaded) {
					fontReady = false;
					document.fonts
						.load(fontSpec)
						.then(() => {
							if (ctx && canvas) {
								ctx.font = fontString;
								clearAllCaches();
								updateSize();
								draw();
								fontReady = true;
							}
						})
						.catch((e) => {
							console.warn(`Failed to load font: ${fontFamily}`, e);
							if (ctx && canvas) draw();
							fontReady = true;
						});
					return false;
				}
			}

			fontReady = true;
			return true;
		} catch (error) {
			console.error('Error during canvas setup:', error);
			fontReady = true;
			return true;
		}
	}

	$effect(() => {
		const unsubscribe = themeService.onColorChange(() => {
			requestAnimationFrame(() => {
				COLORS = getColors();
				clearAllCaches();
				if (document.hidden) return;
				if (ctx && canvas && renderer && textParser) {
					textParser = new PatternEditorTextParser(
						schema,
						formatter,
						COLORS,
						ctx,
						rowSegmentsCache,
						cellPositionsCache
					);
					renderer = new PatternEditorRenderer({
						ctx,
						colors: COLORS,
						canvasWidth,
						lineHeight,
						schema,
						channelSeparatorWidth,
						selectionStyle
					});
					draw();
				}
			});
		});
		return unsubscribe;
	});

	function getChipIndex(): number {
		return services.audioService.chipProcessors.findIndex((p) => p === chipProcessor);
	}

	function getChannelMutedState(pattern: Pattern): boolean[] {
		const chipIndex = getChipIndex();
		return pattern.channels.map(
			(_, index) => chipIndex >= 0 && channelMuteStore.isChannelMuted(chipIndex, index)
		);
	}

	function getPatternRowData(
		pattern: Pattern,
		rowIndex: number,
		options?: { debug?: boolean }
	): string {
		return PatternRowDataService.getRowData(
			{
				pattern,
				rowIndex,
				converter,
				formatter,
				schema,
				patternGenericCache,
				rowStringCache
			},
			options
		);
	}

	function draw() {
		if (!ctx || !renderer || !textParser) return;
		if (document.hidden) return;

		renderer.drawBackground(canvasHeight);

		const patternId = patternOrder[currentPatternOrderIndex];
		const patternToDraw = findOrCreatePattern(patternId);
		if (!patternToDraw) return;

		const visibleRows = getVisibleRows(patternToDraw);
		const bounds = getSelectionBounds();
		const channelMutedByPatternId = new Map<number, boolean[]>();

		function getCachedChannelMuted(pattern: Pattern): boolean[] {
			let muted = channelMutedByPatternId.get(pattern.id);
			if (muted === undefined) {
				muted = getChannelMutedState(pattern);
				channelMutedByPatternId.set(pattern.id, muted);
			}
			return muted;
		}

		for (const row of visibleRows) {
			const y = row.displayIndex * lineHeight;

			if (row.isEmpty) {
				continue;
			}

			if (row.isGhost) {
				ctx.globalAlpha = 0.3;
			} else {
				ctx.globalAlpha = 1.0;
			}

			const patternToRender = findOrCreatePattern(row.patternIndex);
			if (row.rowIndex >= 0 && row.rowIndex < patternToRender.length) {
				const rowString = getPatternRowData(patternToRender, row.rowIndex);

				if (!textParser || !renderer) continue;
				const segments = textParser.parseRowString(rowString, row.rowIndex);
				const cellPositions = getCellPositions(rowString, row.rowIndex);
				const channelMuted = getCachedChannelMuted(patternToRender);

				const isCurrentPattern = row.patternIndex === patternId;
				const isInSelection =
					isCurrentPattern &&
					bounds &&
					row.rowIndex >= bounds.minRow &&
					row.rowIndex <= bounds.maxRow;

				let selectionStartCol: number | null = null;
				let selectionEndCol: number | null = null;

				if (isInSelection && bounds) {
					selectionStartCol = bounds.minCol;
					selectionEndCol = bounds.maxCol;
				}

				renderer.drawRow({
					rowString,
					y,
					isSelected: row.isSelected && isActive,
					rowIndex: row.rowIndex,
					selectedColumn,
					segments,
					cellPositions,
					channelMuted,
					selectionStartCol,
					selectionEndCol
				});
			}
		}

		ctx.globalAlpha = 1.0;

		if (patternToDraw && patternToDraw.length > 0) {
			let rowToUse: number | null = null;
			const firstVisibleRow = visibleRows.find((r) => !r.isEmpty);

			if (
				firstVisibleRow &&
				firstVisibleRow.rowIndex >= 0 &&
				firstVisibleRow.rowIndex < patternToDraw.length
			) {
				rowToUse = firstVisibleRow.rowIndex;
			} else {
				rowToUse = 0;
			}

			if (rowToUse !== null && rowToUse >= 0 && rowToUse < patternToDraw.length) {
				const rowString = getPatternRowData(patternToDraw, rowToUse);

				const song = projectStore.songs[songIndex];
				const vcGroups = song
					? getVirtualChannelGroups(
							schema.channelLabels ?? ['A', 'B', 'C'],
							song.virtualChannelMap ?? {}
						)
					: undefined;

				renderer.drawChannelSeparators(rowString, canvasHeight, vcGroups);

				const channelLabels = patternToDraw.channels.map((ch) => ch.label);
				const channelMuted = getCachedChannelMuted(patternToDraw);

				renderer.drawChannelLabels({
					rowString,
					channelLabels,
					channelMuted,
					virtualChannelGroups: vcGroups
				});
			}
		}
	}

	function moveRow(delta: number) {
		if (playbackStore.isPlaying) return;

		const pattern = currentPattern || ensurePatternExists();
		if (!pattern) return;

		const navigationState = PatternNavigationService.moveRow(
			{
				selectedRow,
				currentPatternOrderIndex,
				selectedColumn
			},
			{
				patterns,
				patternOrder,
				currentPattern: pattern,
				converter,
				formatter,
				schema,
				getCellPositions
			},
			delta
		);

		selectedRow = navigationState.selectedRow;
		if (currentPatternOrderIndex !== navigationState.currentPatternOrderIndex) {
			currentPatternOrderIndex = navigationState.currentPatternOrderIndex;
			pendingPlaybackPosition = null;
			playbackStartTime = performance.now();
			if (playbackRafId !== null) {
				cancelAnimationFrame(playbackRafId);
				playbackRafId = null;
			}
		}

		const updatedPattern = currentPattern || ensurePatternExists();
		if (updatedPattern) {
			const updatedState = PatternNavigationService.moveColumn(navigationState, {
				patterns,
				patternOrder,
				currentPattern: updatedPattern,
				converter,
				formatter,
				schema,
				getCellPositions
			});
			selectedColumn = updatedState.selectedColumn;
		}
	}

	function moveColumn(delta: number) {
		const pattern = currentPattern || ensurePatternExists();
		if (!pattern) return;

		const navigationState = PatternNavigationService.moveColumnByDelta(
			{
				selectedRow,
				currentPatternOrderIndex,
				selectedColumn
			},
			{
				patterns,
				patternOrder,
				currentPattern: pattern,
				converter,
				formatter,
				schema,
				getCellPositions
			},
			delta
		);

		selectedColumn = navigationState.selectedColumn;
	}

	export function handleKeyDownFromMenu(event: KeyboardEvent) {
		handleKeyDown(event);
	}

	function createShortcutsContext(): PatternKeyboardShortcutsContext {
		const patternId = patternOrder[currentPatternOrderIndex];
		const pattern = findOrCreatePattern(patternId);

		return {
			isPlaying: playbackStore.isPlaying,
			selectedColumn,
			selectedRow,
			currentPatternOrderIndex,
			pattern,
			hasSelection,
			onUndo: () => {
				if (!playbackStore.isPlaying) undoRedoStore.undo();
			},
			onRedo: () => {
				if (!playbackStore.isPlaying) undoRedoStore.redo();
			},
			onCopy: copySelection,
			onCut: cutSelection,
			onPaste: pasteSelection,
			onPasteWithoutErasing: pasteSelectionWithoutErasing,
			onDelete: deleteSelection,
			onSelectAll: (column: number, startRow: number, endRow: number) => {
				selectionStartRow = startRow;
				selectionStartColumn = column;
				selectionEndRow = endRow;
				selectionEndColumn = column;
				draw();
			},
			onSelectProgressive: (
				startRow: number,
				endRow: number,
				startColumn: number,
				endColumn: number
			) => {
				selectionStartRow = startRow;
				selectionStartColumn = startColumn;
				selectionEndRow = endRow;
				selectionEndColumn = endColumn;
				draw();
			},
			onTogglePlayback: () => {
				playbackStore.isPlaying = true;
				togglePlayback();
			},
			onPausePlayback: () => {
				playbackStore.isPlaying = false;
				pausePlayback();
			},
			onMoveRow: moveRow,
			onMoveColumn: moveColumn,
			onSetSelectedRow: setSelectedRow,
			onSetSelectedColumn: (column: number) => {
				selectedColumn = column;
			},
			onSetCurrentPatternOrderIndex: (index: number) => {
				currentPatternOrderIndex = index;
				selectedRow = 0;
				pendingPlaybackPosition = null;
				playbackStartTime = performance.now();
				if (playbackRafId !== null) {
					cancelAnimationFrame(playbackRafId);
					playbackRafId = null;
				}
			},
			onClearSelection: () => {
				selectionStartRow = null;
				selectionStartColumn = null;
				selectionEndRow = null;
				selectionEndColumn = null;
				draw();
			},
			onSetSelectionAnchor: (row: number, column: number) => {
				selectionStartRow = row;
				selectionStartColumn = column;
			},
			onExtendSelection: (row: number, column: number) => {
				selectionEndRow = row;
				selectionEndColumn = column;
				draw();
			},
			onIncrementFieldValue: (
				delta: number,
				isOctaveIncrement?: boolean,
				keyForPreview?: string
			) => {
				incrementFieldValue(delta, isOctaveIncrement, keyForPreview);
			},
			onSwapChannelLeft: swapChannelLeft,
			onSwapChannelRight: swapChannelRight,
			onToggleSolo: () => {
				const chipIdx = getChipIndex();
				if (chipIdx < 0) return;
				const channelIndex = getChannelIndexAtCursor();
				if (channelIndex < 0) return;
				if (isPlayingSolo()) {
					executeUnmuteAll();
				} else {
					executePlaySolo(chipIdx, channelIndex);
				}
			},
			selectionStartRow,
			selectionStartColumn,
			selectionEndRow,
			selectionEndColumn,
			getPatternRowData,
			navigationContext: {
				patterns,
				patternOrder,
				currentPattern: pattern,
				converter,
				formatter,
				schema,
				getCellPositions
			}
		};
	}

	function isPlayFromRowShortcut(event: KeyboardEvent): boolean {
		const fromEvent = ShortcutString.normalizeForComparison(ShortcutString.fromEvent(event));
		const shortcut = ShortcutString.normalizeForComparison(
			keybindingsStore.getShortcut(ACTION_PLAY_FROM_ROW)
		);
		return fromEvent === shortcut;
	}

	function buildEditingContext(): {
		context: EditingContext;
		fieldInfoBeforeEdit: FieldInfo | null;
	} | null {
		const patternId = patternOrder[currentPatternOrderIndex];
		const pattern = findOrCreatePattern(patternId);
		const rowString = getPatternRowData(pattern, selectedRow);
		const cellPositions = getCellPositions(rowString, selectedRow);
		const segments = textParser ? textParser.parseRowString(rowString, selectedRow) : undefined;
		const context: EditingContext = {
			pattern,
			selectedRow,
			selectedColumn,
			cellPositions,
			segments,
			converter,
			formatter,
			schema,
			tuningTable
		};
		const fieldInfoBeforeEdit = PatternEditingService.getFieldAtCursor(context);
		return { context, fieldInfoBeforeEdit };
	}

	function applyEditingResult(
		editingResult: { updatedPattern: Pattern; shouldMoveNext: boolean },
		fieldInfoBeforeEdit: FieldInfo | null,
		context: EditingContext,
		previewKey?: string
	): void {
		let finalPattern = editingResult.updatedPattern;

		if (
			autoEnvStore.enabled &&
			fieldInfoBeforeEdit &&
			fieldInfoBeforeEdit.channelIndex >= 0 &&
			(fieldInfoBeforeEdit.fieldType === 'note' ||
				fieldInfoBeforeEdit.fieldKey === 'envelopeShape')
		) {
			const autoEnvPattern = AutoEnvService.applyAutoEnvelope(
				finalPattern,
				selectedRow,
				fieldInfoBeforeEdit.channelIndex,
				tuningTable,
				autoEnvStore.currentRatio
			);
			if (autoEnvPattern) {
				finalPattern = autoEnvPattern;
			}
		}

		recordPatternEdit(context.pattern, finalPattern);
		updatePatternInArray(finalPattern);

		if (editingResult.shouldMoveNext) {
			moveColumn(1);
		}

		const shouldPreview =
			fieldInfoBeforeEdit &&
			(fieldInfoBeforeEdit.channelIndex >= 0 ||
				fieldInfoBeforeEdit.fieldKey === 'envelopeValue');
		const previewChannel =
			fieldInfoBeforeEdit?.fieldKey === 'envelopeValue'
				? 0
				: (fieldInfoBeforeEdit?.channelIndex ?? -1);
		if (
			previewKey !== undefined &&
			!playbackStore.isPlaying &&
			shouldPreview &&
			previewChannel >= 0 &&
			chipProcessor &&
			'playPreviewRow' in chipProcessor &&
			!pressedKeyChannels.has(previewKey)
		) {
			services.audioService.setPreviewActiveForChips(songIndex);
			const processor = chipProcessor as ChipProcessor & PreviewNoteSupport;
			const isNoteField =
				fieldInfoBeforeEdit.fieldType === 'note' ||
				fieldInfoBeforeEdit.fieldKey === 'envelopeValue';
			const previewChannelResult = previewService.playFromContext(
				processor,
				editingResult.updatedPattern,
				previewChannel,
				selectedRow,
				schema,
				isNoteField
			);
			if (previewChannelResult !== undefined) {
				pressedKeyChannels.set(previewKey, previewChannelResult);
			}
		}

		const step = editorStateStore.step;
		if (step > 0) {
			moveRow(step);
		}

		clearAllCaches();
		draw();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (isPlayFromRowShortcut(event) && !event.repeat && !isEnterKeyHeld) {
			event.preventDefault();
			isEnterKeyHeld = true;
			playbackStore.isPlaying = true;
			playFromCursor();
			return;
		}

		const shortcutsContext = createShortcutsContext();
		const result = PatternKeyboardShortcutsService.handleKeyDown(event, shortcutsContext);

		if (result.handled) {
			if (result.shouldPreventDefault) {
				event.preventDefault();
			}
			return;
		}

		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) {
			selection.removeAllRanges();
		}

		const built = buildEditingContext();
		if (!built) return;

		const editingResult = PatternEditingService.handleKeyInput(built.context, event.key);

		if (editingResult) {
			event.preventDefault();
			applyEditingResult(
				editingResult,
				built.fieldInfoBeforeEdit,
				built.context,
				event.key
			);
		} else if (event.key.length === 1) {
			event.preventDefault();
		}
	}

	$effect(() => {
		const enabled = !!settingsStore.midiInputDeviceId;
		if (!enabled) return;
		const remove = midiService.addNoteListener((midiNote: number, velocity: number) => {
			if (!canvas || document.activeElement !== canvas) return;
			if (velocity === 0) {
				const previewKey = `midi-${midiNote}`;
				const channel = pressedKeyChannels.get(previewKey);
				if (channel !== undefined) {
					if (chipProcessor && 'stopPreviewNote' in chipProcessor) {
						const processor = chipProcessor as ChipProcessor & PreviewNoteSupport;
						previewService.stopNote(processor, channel === -1 ? undefined : channel);
					}
					services.audioService.setPreviewActiveForChips(null);
					pressedKeyChannels.delete(previewKey);
				}
				return;
			}
			const built = buildEditingContext();
			if (!built) return;
			const result = PatternEditingService.handleMidiNote(built.context, midiNote);
			if (result) {
				applyEditingResult(
					result,
					built.fieldInfoBeforeEdit,
					built.context,
					`midi-${midiNote}`
				);
			}
		});
		return remove;
	});

	function handleKeyUp(event: KeyboardEvent) {
		if (isPlayFromRowShortcut(event) && isEnterKeyHeld) {
			isEnterKeyHeld = false;
			playbackStore.isPlaying = false;
			pausePlayback();
			return;
		}

		const channel = pressedKeyChannels.get(event.key);
		if (channel !== undefined) {
			if (chipProcessor && 'stopPreviewNote' in chipProcessor) {
				const processor = chipProcessor as ChipProcessor & PreviewNoteSupport;
				previewService.stopNote(processor, channel === -1 ? undefined : channel);
			}
			services.audioService.setPreviewActiveForChips(null);
			pressedKeyChannels.delete(event.key);
		}
	}

	function handleWheel(event: WheelEvent) {
		if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
			return;
		}

		event.preventDefault();
		moveRow(Math.sign(event.deltaY));
	}

	function startAutoScroll(direction: number): void {
		if (autoScrollInterval !== null || direction === 0) return;

		autoScrollDirection = direction;
		autoScrollInterval = window.setInterval(() => {
			moveRow(autoScrollDirection);
		}, 50);
	}

	function stopAutoScroll(): void {
		if (autoScrollInterval !== null) {
			clearInterval(autoScrollInterval);
			autoScrollInterval = null;
			autoScrollDirection = 0;
		}
	}

	function handleGlobalMouseMove(event: MouseEvent): void {
		if (!canvas || !isSelecting) return;

		const rect = canvas.getBoundingClientRect();
		const y = event.clientY - rect.top;

		const scrollMargin = lineHeight * 2;
		const isAboveCanvas = event.clientY < rect.top;
		const isBelowCanvas = event.clientY > rect.bottom;
		const isNearTop = y < lineHeight + scrollMargin;
		const isNearBottom = y > canvasHeight - scrollMargin;

		if (isAboveCanvas || isNearTop) {
			startAutoScroll(-1);
		} else if (isBelowCanvas || isNearBottom) {
			startAutoScroll(1);
		} else {
			stopAutoScroll();
		}
	}

	let isHoveringLabel = $state(false);

	function handleMouseLeave(): void {
		if (canvas) {
			canvas.style.cursor = 'default';
			isHoveringLabel = false;
		}
	}

	function handleMouseEnter(event: MouseEvent): void {
		if (canvas) {
			const rect = canvas.getBoundingClientRect();
			const y = event.clientY - rect.top;
			isHoveringLabel = y <= lineHeight;
			canvas.style.cursor = isHoveringLabel ? 'pointer' : 'default';

			if (canFocusOnHover()) {
				canvas.focus();
				const selection = window.getSelection();
				if (selection) {
					selection.removeAllRanges();
				}
				onfocus?.();
			}
		}
	}

	function findCellAtPosition(x: number, y: number): { row: number; column: number } | null {
		if (!canvas || !currentPattern || !renderer || !textParser) return null;

		const patternToRender = findOrCreatePattern(currentPattern.id);

		if (y <= lineHeight) return null;

		const visibleRows = getVisibleRows(currentPattern);

		let closestRow: (typeof visibleRows)[0] | null = null;
		let minRowDistance = Infinity;

		const patternId = patternOrder[currentPatternOrderIndex];

		for (const row of visibleRows) {
			if (row.isEmpty || row.rowIndex < 0 || row.isGhost || row.patternIndex !== patternId)
				continue;

			const rowY = row.displayIndex * lineHeight;
			const rowCenterY = rowY + lineHeight / 2;
			const distance = Math.abs(y - rowCenterY);

			if (distance < minRowDistance) {
				minRowDistance = distance;
				closestRow = row;
			}
		}

		if (!closestRow) return null;

		const rowString = getPatternRowData(patternToRender, closestRow.rowIndex);
		const cellPositions = getCellPositions(rowString, closestRow.rowIndex);
		const closestColumn = getColumnAtX(cellPositions, x);
		return { row: closestRow.rowIndex, column: closestColumn };
	}

	function handleCanvasMouseDown(event: MouseEvent): void {
		if (!canvas || !currentPattern || !renderer || !textParser) return;
		if (event.button === 2) return;

		if (
			settingsStore.midiInputDeviceId &&
			midiService.isSupported() &&
			!midiService.hasAccess()
		) {
			midiService.requestAccess();
		}

		canvas.focus();
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
		}
		onfocus?.();

		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		const patternToRender = findOrCreatePattern(currentPattern.id);

		if (y <= lineHeight) {
			const visibleRows = getVisibleRows(currentPattern);
			const firstVisibleRow = visibleRows.find((r) => !r.isEmpty);
			if (
				!firstVisibleRow ||
				firstVisibleRow.rowIndex < 0 ||
				firstVisibleRow.rowIndex >= patternToRender.length
			)
				return;

			const rowString = getPatternRowData(patternToRender, firstVisibleRow.rowIndex);
			const channelPositions = renderer.calculateChannelPositions(rowString);

			for (let i = 0; i < channelPositions.length; i++) {
				const channelStart = channelPositions[i];
				const channelEnd =
					i < channelPositions.length - 1 ? channelPositions[i + 1] : canvasWidth;

				if (x >= channelStart && x < channelEnd) {
					const chipIndex = getChipIndex();
					if (chipIndex >= 0) {
						channelMuteStore.toggleChannel(chipIndex, i);
						const isMuted = channelMuteStore.isChannelMuted(chipIndex, i);
						chipProcessor.updateParameter(`channelMute_${i}`, isMuted);
						draw();
					}
					break;
				}
			}
			return;
		}

		const cell = findCellAtPosition(x, y);
		if (!cell) {
			selectionStartRow = null;
			selectionStartColumn = null;
			selectionEndRow = null;
			selectionEndColumn = null;
			mouseDownCell = null;
			draw();
			return;
		}

		const selectShortcut = keybindingsStore.getShortcut(
			ACTION_SELECT_INSTRUMENT_OR_TABLE_IN_EDITOR
		);
		const rowString = getPatternRowData(patternToRender, cell.row);
		const cellPositions = getCellPositions(rowString, cell.row);
		const cellAtColumn = cellPositions[cell.column];

		if (
			selectShortcut &&
			ShortcutString.matchesMouseEvent(selectShortcut, event) &&
			cellAtColumn
		) {
			if (schema.fields?.instrument && cellAtColumn.fieldKey === 'instrument') {
				const segments = textParser.parseRowString(rowString, cell.row);
				const segment = segments?.find(
					(s) =>
						s.fieldKey === 'instrument' &&
						cellAtColumn.charIndex >= s.start &&
						cellAtColumn.charIndex < s.end
				);
				const instrumentValue = segment
					? rowString.substring(segment.start, segment.end)
					: '';
				const instrumentId = normalizeInstrumentId(instrumentValue);
				if (isValidInstrumentId(instrumentId)) {
					editorStateStore.requestSelectInstrument(instrumentId);
					event.preventDefault();
					canvas.focus();
					draw();
					return;
				}
			}
			if (schema.fields?.table && cellAtColumn.fieldKey === 'table') {
				const segments = textParser.parseRowString(rowString, cell.row);
				const segment = segments?.find(
					(s) =>
						s.fieldKey === 'table' &&
						cellAtColumn.charIndex >= s.start &&
						cellAtColumn.charIndex < s.end
				);
				const tableValue = segment
					? rowString.substring(segment.start, segment.end).trim().slice(-1)
					: '';
				const tableId = tableDisplayCharToId(tableValue);
				if (tableId >= 0) {
					editorStateStore.requestSelectTable(tableId);
					event.preventDefault();
					canvas.focus();
					draw();
					return;
				}
			}
		}

		if (playbackStore.isPlaying) {
			selectedColumn = cell.column;
			canvas.focus();
			draw();
			return;
		}

		mouseDownCell = { row: cell.row, column: cell.column };

		if (event.shiftKey && selectionStartRow !== null) {
			selectionEndRow = cell.row;
			selectionEndColumn = cell.column;
			selectedRow = cell.row;
			selectedColumn = cell.column;
		} else {
			window.addEventListener('mousemove', handleGlobalMouseMove);
			window.addEventListener('mouseup', handleCanvasMouseUp);
		}

		canvas.focus();
		draw();
	}

	function handleCanvasMouseMove(event: MouseEvent): void {
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		const wasHoveringLabel = isHoveringLabel;
		isHoveringLabel = y <= lineHeight;

		if (wasHoveringLabel !== isHoveringLabel) {
			canvas.style.cursor = isHoveringLabel ? 'pointer' : 'default';
		}

		if (!currentPattern || !renderer || !textParser) return;
		if (!mouseDownCell || playbackStore.isPlaying) return;

		const cell = findCellAtPosition(x, y);
		if (!cell) return;

		if (!isSelecting) {
			const movedToDifferentCell =
				cell.row !== mouseDownCell.row || cell.column !== mouseDownCell.column;
			if (movedToDifferentCell) {
				isSelecting = true;
				selectionStartRow = mouseDownCell.row;
				selectionStartColumn = mouseDownCell.column;
				selectionEndRow = cell.row;
				selectionEndColumn = cell.column;
			}
		} else {
			selectionEndRow = cell.row;
			selectionEndColumn = cell.column;
		}
		if (isSelecting) draw();
	}

	function handleCanvasMouseUp(): void {
		stopAutoScroll();
		window.removeEventListener('mousemove', handleGlobalMouseMove);
		window.removeEventListener('mouseup', handleCanvasMouseUp);
		if (mouseDownCell && !isSelecting) {
			selectionStartRow = null;
			selectionStartColumn = null;
			selectionEndRow = null;
			selectionEndColumn = null;
			selectedRow = mouseDownCell.row;
			selectedColumn = mouseDownCell.column;
		}
		isSelecting = false;
		mouseDownCell = null;
		draw();
	}

	function handleContextMenu(event: MouseEvent): void {
		event.preventDefault();

		if (!canvas || !renderer) {
			contextMenuPosition = { x: event.clientX, y: event.clientY };
			return;
		}

		const rect = canvas.getBoundingClientRect();
		const y = event.clientY - rect.top;
		const x = event.clientX - rect.left;

		if (y <= lineHeight && currentPattern) {
			const patternToRender = findOrCreatePattern(currentPattern.id);
			const visibleRows = getVisibleRows(currentPattern);
			const firstVisibleRow = visibleRows.find((r) => !r.isEmpty);
			if (
				firstVisibleRow &&
				firstVisibleRow.rowIndex >= 0 &&
				firstVisibleRow.rowIndex < patternToRender.length
			) {
				const rowString = getPatternRowData(patternToRender, firstVisibleRow.rowIndex);
				const channelPositions = renderer.calculateChannelPositions(rowString);
				const song = projectStore.songs[songIndex];
				const hwLabels = schema.channelLabels ?? ['A', 'B', 'C'];

				for (let i = 0; i < channelPositions.length; i++) {
					const channelStart = channelPositions[i];
					const channelEnd =
						i < channelPositions.length - 1 ? channelPositions[i + 1] : canvasWidth;
					if (x >= channelStart && x < channelEnd) {
						const hwIndex = getHardwareChannelIndex(
							i,
							hwLabels,
							song?.virtualChannelMap ?? {}
						);
						channelContextMenuHwIndex = hwIndex;
						channelContextMenuVirtualIndex = i;
						channelContextMenuPosition = { x: event.clientX, y: event.clientY };
						return;
					}
				}
			}
		}

		contextMenuPosition = { x: event.clientX, y: event.clientY };
	}

	function closeContextMenu(): void {
		contextMenuPosition = null;
	}

	function closeChannelContextMenu(): void {
		channelContextMenuPosition = null;
	}

	function handleContextMenuAction(data: { action: string }): void {
		closeContextMenu();
		onaction?.(data);
	}

	function applyVirtualChannelChange(result: {
		updatedMap: Record<number, number>;
		updatedPatterns: Pattern[];
	}): void {
		const song = projectStore.songs[songIndex]!;
		const oldMap = { ...song.virtualChannelMap };
		const oldPatterns = patterns;

		song.virtualChannelMap = result.updatedMap;
		updatePatterns(result.updatedPatterns);

		const action = new VirtualChannelAction(
			createVirtualChannelEditContext(),
			oldPatterns,
			result.updatedPatterns,
			oldMap,
			result.updatedMap,
			getCursorPosition()
		);
		undoRedoStore.pushAction(action);

		refreshAfterVirtualChannelChange();
	}

	function getChannelIndexAtCursor(): number {
		const patternId = patternOrder[currentPatternOrderIndex];
		const pattern = findOrCreatePattern(patternId);
		if (!pattern) return -1;
		const rowString = getPatternRowData(pattern, selectedRow);
		const cellPositions = getCellPositions(rowString, selectedRow);
		const segments = textParser ? textParser.parseRowString(rowString, selectedRow) : undefined;
		const fieldInfo = PatternFieldDetection.detectFieldAtCursor({
			pattern,
			selectedRow,
			selectedColumn,
			cellPositions,
			segments,
			converter,
			formatter,
			schema
		});
		if (!fieldInfo) return -1;
		if (fieldInfo.channelIndex < 0) return 0;
		return fieldInfo.channelIndex;
	}

	function isPlayingSolo(): boolean {
		let unmutedCount = 0;
		const chipProcessors = services.audioService.chipProcessors;
		for (let chipIdx = 0; chipIdx < chipProcessors.length; chipIdx++) {
			const chipSong = projectStore.songs[chipIdx];
			const chipSchema = chipProcessors[chipIdx].chip.schema;
			const hwLabels = chipSchema.channelLabels ?? ['A', 'B', 'C'];
			const totalChannels = getTotalVirtualChannelCount(
				hwLabels.length,
				chipSong?.virtualChannelMap ?? {}
			);
			for (let ch = 0; ch < totalChannels; ch++) {
				if (!channelMuteStore.isChannelMuted(chipIdx, ch)) unmutedCount++;
			}
		}
		return unmutedCount === 1;
	}

	function executePlaySolo(clickedChipIndex: number, soloChannel: number): void {
		const chipProcessors = services.audioService.chipProcessors;
		chipProcessors.forEach((processor, chipIdx) => {
			const chipSong = projectStore.songs[chipIdx];
			const chipSchema = processor.chip.schema;
			const hwLabels = chipSchema.channelLabels ?? ['A', 'B', 'C'];
			const totalChannels = getTotalVirtualChannelCount(
				hwLabels.length,
				chipSong?.virtualChannelMap ?? {}
			);
			for (let ch = 0; ch < totalChannels; ch++) {
				const muted = chipIdx === clickedChipIndex ? ch !== soloChannel : true;
				channelMuteStore.setChannelMuted(chipIdx, ch, muted);
				processor.updateParameter(`channelMute_${ch}`, muted);
			}
		});
		draw();
	}

	function executeUnmuteAll(): void {
		const chipProcessors = services.audioService.chipProcessors;
		chipProcessors.forEach((processor, chipIdx) => {
			const chipSong = projectStore.songs[chipIdx];
			const chipSchema = processor.chip.schema;
			const hwLabels = chipSchema.channelLabels ?? ['A', 'B', 'C'];
			const totalChannels = getTotalVirtualChannelCount(
				hwLabels.length,
				chipSong?.virtualChannelMap ?? {}
			);
			for (let ch = 0; ch < totalChannels; ch++) {
				channelMuteStore.setChannelMuted(chipIdx, ch, false);
				processor.updateParameter(`channelMute_${ch}`, false);
			}
		});
		draw();
	}

	function handleChannelContextMenuAction(data: { action: string }): void {
		closeChannelContextMenu();
		const song = projectStore.songs[songIndex];
		if (!song) return;

		const hwIndex = channelContextMenuHwIndex;
		const isPlaying = playbackStore.isPlaying;

		if (data.action === 'add_virtual_channel') {
			if (isPlaying) return;
			applyVirtualChannelChange(
				VirtualChannelService.addVirtualChannel(song, hwIndex, patterns)
			);
		} else if (data.action === 'remove_virtual_channel') {
			if (isPlaying) return;
			const result = VirtualChannelService.removeVirtualChannel(
				song,
				hwIndex,
				patterns,
				channelContextMenuVirtualIndex
			);
			if (result) {
				applyVirtualChannelChange(result);
			}
		} else if (data.action === 'play_solo') {
			executePlaySolo(getChipIndex(), channelContextMenuVirtualIndex);
		} else if (data.action === 'unmute_all') {
			executeUnmuteAll();
		}
	}

	function getChannelContextMenuItems(): MenuItem[] {
		const song = projectStore.songs[songIndex];
		const hwLabels = schema.channelLabels ?? ['A', 'B', 'C'];
		const hwIndex = channelContextMenuHwIndex;
		const currentCount = song?.virtualChannelMap?.[hwIndex] ?? 1;
		const hwLabel = hwLabels[hwIndex] ?? '?';
		const effectiveLabels = computeEffectiveChannelLabels(
			hwLabels,
			song?.virtualChannelMap ?? {}
		);
		const clickedLabel = effectiveLabels[channelContextMenuVirtualIndex] ?? hwLabel;
		const isPlaying = playbackStore.isPlaying;

		const items: MenuItem[] = [
			{
				label: 'Play solo',
				action: 'play_solo'
			},
			{
				label: 'Unmute all',
				action: 'unmute_all'
			},
			{
				label: `Add virtual channel to ${hwLabel}`,
				action: 'add_virtual_channel',
				disabled: isPlaying
			}
		];
		if (currentCount > 1) {
			items.push({
				label: `Remove virtual channel ${clickedLabel}`,
				action: 'remove_virtual_channel',
				disabled: isPlaying
			});
		}
		return items;
	}

	function sendVirtualChannelConfigToProcessor(): void {
		const song = projectStore.songs[songIndex];
		if (!song) return;
		const hwLabels = schema.channelLabels ?? ['A', 'B', 'C'];
		if (chipProcessor && 'sendVirtualChannelConfig' in chipProcessor) {
			(chipProcessor as AYProcessor).sendVirtualChannelConfig(
				song.virtualChannelMap,
				hwLabels.length
			);
		}
	}

	function createClipboardContext(): ClipboardContext {
		const patternId = patternOrder[currentPatternOrderIndex];
		const pattern = findOrCreatePattern(patternId);

		return {
			pattern,
			selectedRow,
			selectedColumn,
			hasSelection: hasSelection(),
			getSelectionBounds,
			getCellPositions,
			getPatternRowData,
			createEditingContext: (pat: Pattern, row: number, col: number) => {
				const rowString = getPatternRowData(pat, row);
				const cellPositions = getCellPositions(rowString, row);
				const segments = textParser ? textParser.parseRowString(rowString, row) : undefined;

				return {
					pattern: pat,
					selectedRow: row,
					selectedColumn: col,
					cellPositions,
					segments,
					converter,
					formatter,
					schema,
					tuningTable
				};
			},
			tuningTable,
			getOctave: () => editorStateStore.octave,
			converter,
			formatter,
			schema
		};
	}

	function copySelection(): void {
		ClipboardService.copySelection(createClipboardContext());
	}

	function cutSelection(): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);

		ClipboardService.cutSelection(createClipboardContext(), (updatedPattern) => {
			recordBulkPatternEdit(originalPattern, updatedPattern);
			updatePatternInArray(updatedPattern);
		});

		selectionStartRow = null;
		selectionStartColumn = null;
		selectionEndRow = null;
		selectionEndColumn = null;
		clearAllCaches();
		draw();
	}

	function pasteSelection(): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);

		ClipboardService.pasteSelection(createClipboardContext(), (updatedPattern) => {
			recordBulkPatternEdit(originalPattern, updatedPattern);
			updatePatternInArray(updatedPattern);
			clearAllCaches();
			draw();
		});
	}

	function pasteSelectionWithoutErasing(): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);

		ClipboardService.pasteSelectionWithoutErasing(
			createClipboardContext(),
			(updatedPattern) => {
				recordBulkPatternEdit(originalPattern, updatedPattern);
				updatePatternInArray(updatedPattern);
				clearAllCaches();
				draw();
			}
		);
	}

	function createChannelSwapContext(): ChannelSwapContext {
		const clipboardCtx = createClipboardContext();
		return {
			pattern: clipboardCtx.pattern,
			getCellPositions: clipboardCtx.getCellPositions,
			getPatternRowData: clipboardCtx.getPatternRowData,
			createEditingContext: clipboardCtx.createEditingContext,
			converter,
			schema
		};
	}

	function swapChannelLeft(): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);
		const bounds = hasSelection()
			? getSelectionBounds()
			: {
					minRow: selectedRow,
					maxRow: selectedRow,
					minCol: selectedColumn,
					maxCol: selectedColumn
				};
		if (!bounds) return;

		const updatedPattern = ChannelSwapService.swapChannelsLeft(
			originalPattern,
			bounds,
			createChannelSwapContext()
		);
		recordBulkPatternEdit(originalPattern, updatedPattern);
		updatePatternInArray(updatedPattern);
		clearAllCaches();
		draw();
	}

	function swapChannelRight(): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);
		const bounds = hasSelection()
			? getSelectionBounds()
			: {
					minRow: selectedRow,
					maxRow: selectedRow,
					minCol: selectedColumn,
					maxCol: selectedColumn
				};
		if (!bounds) return;

		const updatedPattern = ChannelSwapService.swapChannelsRight(
			originalPattern,
			bounds,
			createChannelSwapContext()
		);
		recordBulkPatternEdit(originalPattern, updatedPattern);
		updatePatternInArray(updatedPattern);
		clearAllCaches();
		draw();
	}

	function deleteSelection(): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);

		const bounds = hasSelection()
			? getSelectionBounds()
			: {
					minRow: selectedRow,
					maxRow: selectedRow,
					minCol: selectedColumn,
					maxCol: selectedColumn
				};
		if (!bounds) return;

		const updatedPattern = ClipboardService.bulkDelete(createClipboardContext(), bounds);
		if (updatedPattern) {
			recordBulkPatternEdit(originalPattern, updatedPattern);
			updatePatternInArray(updatedPattern);
		}

		selectionStartRow = null;
		selectionStartColumn = null;
		selectionEndRow = null;
		selectionEndColumn = null;

		clearAllCaches();
		draw();
	}

	function updateFieldAtPosition(
		pattern: Pattern,
		row: number,
		col: number,
		fieldInfo: any,
		currentValue: string | number | null,
		delta: number,
		isOctaveIncrement: boolean
	): Pattern {
		const rowString = getPatternRowData(pattern, row);
		const cellPositions = getCellPositions(rowString, row);
		const segments = textParser ? textParser.parseRowString(rowString, row) : undefined;

		const fieldDefinition = PatternValueUpdates.getFieldDefinition(
			{
				pattern,
				selectedRow: row,
				selectedColumn: col,
				cellPositions,
				segments,
				converter,
				formatter,
				schema
			},
			fieldInfo.fieldKey
		);

		let adjustedDelta = delta;
		if (fieldInfo.fieldType === 'note' && isOctaveIncrement) {
			adjustedDelta = delta * 12;
		}

		if (fieldInfo.fieldType === 'note') {
			if (currentValue === null || currentValue === undefined || currentValue === '') {
				return pattern;
			}
			const newValue = PatternValueUpdates.incrementNoteValue(
				currentValue as string,
				adjustedDelta
			);
			return PatternValueUpdates.updateFieldValue(
				{
					pattern,
					selectedRow: row,
					selectedColumn: col,
					cellPositions,
					segments,
					converter,
					formatter,
					schema
				},
				fieldInfo,
				newValue
			);
		} else if (
			fieldInfo.fieldKey === 'envelopeValue' &&
			editorStateStore.envelopeAsNote &&
			tuningTable
		) {
			if (currentValue === null || currentValue === undefined || currentValue === '') {
				return pattern;
			}
			const currentPeriod = currentValue as number;
			const noteIndex = envelopePeriodToNote(currentPeriod, tuningTable);
			if (noteIndex !== null) {
				const semitonesDelta = isOctaveIncrement ? delta * 12 : delta;
				const newNoteIndex = Math.max(
					0,
					Math.min(tuningTable.length - 1, noteIndex + semitonesDelta)
				);
				const newPeriod = noteToEnvelopePeriod(newNoteIndex, tuningTable);
				return PatternValueUpdates.updateFieldValue(
					{
						pattern,
						selectedRow: row,
						selectedColumn: col,
						cellPositions,
						segments,
						converter,
						formatter,
						schema
					},
					fieldInfo,
					newPeriod
				);
			}
			return pattern;
		} else if (
			(fieldInfo.fieldType === 'hex' ||
				fieldInfo.fieldType === 'dec' ||
				fieldInfo.fieldType === 'symbol') &&
			!EffectField.isEffectField(fieldInfo.fieldKey)
		) {
			if (
				PatternValueUpdates.isDisplayedAsEmpty(
					currentValue,
					fieldInfo.fieldType,
					fieldDefinition?.length ?? 1,
					fieldDefinition?.allowZeroValue
				)
			) {
				return pattern;
			}
			const newValue = PatternValueUpdates.incrementNumericValue(
				currentValue as number,
				delta,
				fieldInfo.fieldType,
				fieldDefinition?.length
			);
			return PatternValueUpdates.updateFieldValue(
				{
					pattern,
					selectedRow: row,
					selectedColumn: col,
					cellPositions,
					segments,
					converter,
					formatter,
					schema
				},
				fieldInfo,
				newValue
			);
		} else {
			return pattern;
		}
	}

	function incrementFieldValue(
		delta: number,
		isOctaveIncrement = false,
		keyForPreview?: string
	): void {
		const patternId = patternOrder[currentPatternOrderIndex];
		const originalPattern = findOrCreatePattern(patternId);
		let pattern = originalPattern;

		if (hasSelection()) {
			const bounds = getSelectionBounds();
			if (!bounds) return;

			const { minRow, maxRow, minCol, maxCol } = bounds;

			let hasNotes = false;
			const cellsToUpdate: Array<{ row: number; col: number; fieldInfo: any }> = [];

			for (let row = minRow; row <= maxRow && row < pattern.length; row++) {
				const rowString = getPatternRowData(pattern, row);
				const cellPositions = getCellPositions(rowString, row);
				const segments = textParser ? textParser.parseRowString(rowString, row) : undefined;

				for (let col = minCol; col <= maxCol && col < cellPositions.length; col++) {
					const cell = cellPositions[col];
					if (!cell.fieldKey) continue;

					const fieldInfo = PatternFieldDetection.detectFieldAtCursor({
						pattern,
						selectedRow: row,
						selectedColumn: col,
						cellPositions,
						segments,
						converter,
						formatter,
						schema
					});
					if (!fieldInfo) continue;

					if (fieldInfo.fieldType === 'note') {
						hasNotes = true;
					}

					const shouldInclude =
						fieldInfo.fieldType === 'note' ||
						fieldInfo.fieldType === 'hex' ||
						fieldInfo.fieldType === 'dec' ||
						fieldInfo.fieldType === 'symbol';

					if (shouldInclude) {
						cellsToUpdate.push({ row, col, fieldInfo });
					}
				}
			}

			const filteredCells = hasNotes
				? cellsToUpdate.filter((c) => c.fieldInfo.fieldType === 'note')
				: cellsToUpdate;

			const genericPattern = converter.toGeneric(pattern);
			const updates: GenericFieldUpdate[] = [];

			for (const { row, col, fieldInfo } of filteredCells) {
				const currentValue = PatternValueUpdates.getValueFromGeneric(
					genericPattern,
					row,
					fieldInfo
				);
				const fieldDefinition = PatternValueUpdates.getFieldDefinition(
					{
						pattern,
						selectedRow: row,
						selectedColumn: col,
						cellPositions: [],
						converter,
						formatter,
						schema
					},
					fieldInfo.fieldKey
				);
				const newValue = PatternValueUpdates.computeIncrementValue(
					fieldInfo,
					currentValue,
					delta,
					isOctaveIncrement,
					fieldDefinition,
					tuningTable,
					editorStateStore.envelopeAsNote
				);
				if (newValue !== null) {
					updates.push({ row, fieldInfo, newValue });
				}
			}

			PatternValueUpdates.applyUpdatesToGeneric(genericPattern, updates);
			pattern = converter.fromGeneric(genericPattern);

			recordBulkPatternEdit(originalPattern, pattern);
			updatePatternInArray(pattern);
		} else {
			const rowString = getPatternRowData(pattern, selectedRow);
			const cellPositions = getCellPositions(rowString, selectedRow);
			const segments = textParser
				? textParser.parseRowString(rowString, selectedRow)
				: undefined;

			const fieldInfo = PatternFieldDetection.detectFieldAtCursor({
				pattern,
				selectedRow,
				selectedColumn,
				cellPositions,
				segments,
				converter,
				formatter,
				schema
			});

			if (!fieldInfo) return;

			const currentValue = PatternValueUpdates.getFieldValue(
				{
					pattern,
					selectedRow,
					selectedColumn,
					cellPositions,
					segments,
					converter,
					formatter,
					schema
				},
				fieldInfo
			);

			const updatedPattern = updateFieldAtPosition(
				pattern,
				selectedRow,
				selectedColumn,
				fieldInfo,
				currentValue,
				delta,
				isOctaveIncrement
			);

			recordPatternEdit(pattern, updatedPattern);
			updatePatternInArray(updatedPattern);

			const previewChannel =
				fieldInfo.fieldKey === 'envelopeValue' ? 0 : fieldInfo.channelIndex;
			const shouldPreview =
				keyForPreview === undefined &&
				!playbackStore.isPlaying &&
				previewChannel >= 0 &&
				(fieldInfo.channelIndex >= 0 || fieldInfo.fieldKey === 'envelopeValue');
			if (shouldPreview && chipProcessor && 'playPreviewRow' in chipProcessor) {
				services.audioService.setPreviewActiveForChips(songIndex);
				const processor = chipProcessor as ChipProcessor & PreviewNoteSupport;
				const isNoteField =
					fieldInfo.fieldType === 'note' || fieldInfo.fieldKey === 'envelopeValue';
				previewService.playFromContext(
					processor,
					updatedPattern,
					previewChannel,
					selectedRow,
					schema,
					isNoteField
				);
			}
		}

		clearAllCaches();
		draw();
	}

	function updateSize() {
		if (containerDiv) {
			const availableHeight = containerDiv.clientHeight;
			const gap = 8;

			canvasHeight = Math.max(
				PATTERN_EDITOR_CONSTANTS.MIN_CANVAS_HEIGHT,
				availableHeight - gap
			);
		} else {
			canvasHeight = Math.max(
				PATTERN_EDITOR_CONSTANTS.MIN_CANVAS_HEIGHT,
				window.innerHeight - PATTERN_EDITOR_CONSTANTS.CANVAS_TOP_MARGIN
			);
		}

		if (ctx && currentPattern) {
			const rowString = getPatternRowData(currentPattern, 0);
			const width = ctx.measureText(rowString).width;
			canvasWidth = width + PATTERN_EDITOR_CONSTANTS.CANVAS_PADDING;
		} else {
			canvasWidth = PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_WIDTH;
		}
	}

	let lastDrawnRow = -1;
	let lastDrawnOrderIndex = -1;
	let lastPatternOrderLength = -1;
	let lastPatternsLength = -1;
	let lastDrawnPatternLength = -1;
	let lastCanvasWidth = -1;
	let lastCanvasHeight = -1;
	let lastFontSize = -1;
	let lastFontFamily = '';
	let lastChannelSeparatorWidth = -1;
	let lastSelectionStyle: 'inverted' | 'filled' = 'inverted';
	let lastChannelCount = -1;
	let needsSetup = true;

	$effect(() => {
		if (!canvas) return;

		const currentPatternLength = currentPattern?.length ?? -1;
		const currentChannelCount = currentPattern?.channels?.length ?? -1;
		const fontSizeChanged = fontSize !== lastFontSize;
		const fontFamilyChanged = fontFamily !== lastFontFamily;
		const channelSeparatorWidthChanged = channelSeparatorWidth !== lastChannelSeparatorWidth;
		const selectionStyleChanged = selectionStyle !== lastSelectionStyle;

		if (needsSetup || !ctx) {
			ctx = canvas.getContext('2d')!;
			const ready = setupCanvas();
			needsSetup = false;
			if (ready && !document.hidden) draw();
			lastDrawnRow = selectedRow;
			lastDrawnOrderIndex = currentPatternOrderIndex;
			lastPatternOrderLength = patternOrder.length;
			lastPatternsLength = patterns.length;
			lastDrawnPatternLength = currentPatternLength;
			lastCanvasWidth = canvasWidth;
			lastCanvasHeight = canvasHeight;
			lastFontSize = fontSize;
			lastFontFamily = fontFamily;
			lastChannelSeparatorWidth = channelSeparatorWidth;
			lastSelectionStyle = selectionStyle;
			lastChannelCount = currentChannelCount;
			requestAnimationFrame(() => {
				if (ctx && canvas && !document.hidden) {
					updateSize();
					const ready = setupCanvas();
					if (ready) draw();
				}
			});
			return;
		}

		if (
			fontSizeChanged ||
			fontFamilyChanged ||
			channelSeparatorWidthChanged ||
			selectionStyleChanged
		) {
			clearAllCaches();
			const ready = setupCanvas();
			if (ready && !document.hidden) draw();
			lastFontSize = fontSize;
			lastFontFamily = fontFamily;
			lastChannelSeparatorWidth = channelSeparatorWidth;
			lastSelectionStyle = selectionStyle;
			lastCanvasWidth = canvasWidth;
			lastCanvasHeight = canvasHeight;
			return;
		}

		const patternChanged = currentPattern !== undefined;
		const patternLengthChanged = currentPatternLength !== lastDrawnPatternLength;
		const channelCountChanged = currentChannelCount !== lastChannelCount;
		const sizeChanged = canvasWidth !== lastCanvasWidth || canvasHeight !== lastCanvasHeight;
		const rowChanged = selectedRow !== lastDrawnRow;
		const orderChanged =
			currentPatternOrderIndex !== lastDrawnOrderIndex ||
			patternOrder.length !== lastPatternOrderLength ||
			patterns.length !== lastPatternsLength;

		if (sizeChanged || channelCountChanged) {
			clearAllCaches();
			updateSize();
			setupCanvas();
			lastCanvasWidth = canvasWidth;
			lastCanvasHeight = canvasHeight;
			if (channelCountChanged) {
				lastChannelCount = currentChannelCount;
				sendVirtualChannelConfigToProcessor();
			}
		}

		if (
			rowChanged ||
			orderChanged ||
			patternChanged ||
			patternLengthChanged ||
			sizeChanged ||
			channelCountChanged
		) {
			if (fontReady && !document.hidden) draw();
			lastDrawnRow = selectedRow;
			lastDrawnOrderIndex = currentPatternOrderIndex;
			lastPatternOrderLength = patternOrder.length;
			lastPatternsLength = patterns.length;
			lastDrawnPatternLength = currentPatternLength;
		}
	});

	$effect(() => {
		const handleResize = () => {
			if (document.hidden) return;
			updateSize();
			if (setupCanvas()) draw();
		};

		const handleVisibilityChange = () => {
			if (!document.hidden) {
				updateSize();
				if (setupCanvas()) draw();
			}
		};

		window.addEventListener('resize', handleResize);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	$effect(() => {
		if (!containerDiv) return;

		let rafId: number | null = null;
		const resizeObserver = new ResizeObserver(() => {
			if (containerDiv.clientHeight <= 0) return;
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				if (!document.hidden) {
					updateSize();
					if (setupCanvas()) draw();
				}
			});
		});

		resizeObserver.observe(containerDiv);

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			resizeObserver.disconnect();
		};
	});

	let pendingPlaybackPosition: {
		row: number;
		orderIndex?: number;
		timestamp: number;
	} | null = null;
	let playbackRafId: number | null = null;
	let playbackStartTime = 0;
	let lastPatternOrderIndexFromPlayback = currentPatternOrderIndex;

	$effect(() => {
		if (
			currentPatternOrderIndex !== lastPatternOrderIndexFromPlayback &&
			services.audioService.playing
		) {
			const indexToApply = currentPatternOrderIndex;
			pendingPlaybackPosition = null;
			playbackStartTime = performance.now();
			if (playbackRafId !== null) {
				cancelAnimationFrame(playbackRafId);
				playbackRafId = null;
			}
			selectedRow = 0;
			lastPatternOrderIndexFromPlayback = indexToApply;
			if (isPlaybackMaster) {
				services.audioService.stop();
				togglePlayback();
			}
		}
	});

	export function markPatternChangeFromUser(selectedIndex?: number): void {
		pendingPlaybackPosition = null;
		playbackStartTime = performance.now();
		if (playbackRafId !== null) {
			cancelAnimationFrame(playbackRafId);
			playbackRafId = null;
		}
	}

	$effect(() => {
		if (!chipProcessor) return;

		const currentPatterns = patterns;
		const currentPatternOrder = patternOrder;

		const handlePatternUpdate = (
			currentRow: number,
			currentPatternOrderIndexUpdate?: number
		) => {
			if (!services.audioService.playing) return;
			if (!isPlaybackMaster) return;

			pendingPlaybackPosition = {
				row: currentRow,
				orderIndex: currentPatternOrderIndexUpdate,
				timestamp: performance.now()
			};

			if (playbackRafId === null) {
				playbackRafId = requestAnimationFrame(() => {
					playbackRafId = null;
					const pending = pendingPlaybackPosition;
					pendingPlaybackPosition = null;
					if (!pending || !services.audioService.playing) return;
					if (pending.timestamp < playbackStartTime) {
						return;
					}

					if (settingsStore.debugMode) {
						const orderIdx =
							pending.orderIndex !== undefined
								? pending.orderIndex
								: currentPatternOrderIndex;
						const patternId = currentPatternOrder[orderIdx];
						const pattern = currentPatterns.find((p) => p.id === patternId);
						if (pattern) {
							const rowString = getPatternRowData(pattern, pending.row, {
								debug: true
							});
							console.log(`  ▶ ${rowString}`);
						}
					}

					selectedRow = pending.row;
					if (
						pending.orderIndex !== undefined &&
						services.audioService.getPlayPatternId() === null
					) {
						currentPatternOrderIndex = pending.orderIndex;
						lastPatternOrderIndexFromPlayback = pending.orderIndex;
					}
				});
			}
		};

		const handlePatternRequest = (requestedOrderIndex: number) => {
			const latestPatterns = patterns;
			const playPatternId = services.audioService.getPlayPatternId();
			const patternId =
				playPatternId !== null ? playPatternId : patternOrder[requestedOrderIndex];

			if (
				playPatternId !== null ||
				(requestedOrderIndex >= 0 && requestedOrderIndex < patternOrder.length)
			) {
				const requestedPattern =
					latestPatterns.find((p) => p.id === patternId) ||
					PatternService.createEmptyPattern(patternId);

				chipProcessor.sendRequestedPattern(
					requestedPattern,
					playPatternId !== null ? 0 : requestedOrderIndex
				);
			}
		};

		const handleSpeedUpdate = (newSpeed: number) => {
			services.audioService.updateSpeed(newSpeed);
		};

		chipProcessor.setCallbacks(handlePatternUpdate, handlePatternRequest, handleSpeedUpdate);
	});
</script>

<div bind:this={containerDiv} class="flex h-full flex-col gap-2">
	<div
		class="relative flex transition-opacity duration-150"
		class:opacity-0={!fontReady}
		class:pointer-events-none={!fontReady}
		style="max-height: {canvasHeight}px">
		<canvas
			bind:this={canvas}
			tabindex="0"
			onkeydown={handleKeyDown}
			onkeyup={handleKeyUp}
			onwheel={handleWheel}
			onmouseenter={handleMouseEnter}
			onmouseleave={handleMouseLeave}
			onmousedown={handleCanvasMouseDown}
			onmousemove={handleCanvasMouseMove}
			onmouseup={handleCanvasMouseUp}
			oncontextmenu={handleContextMenu}
			class="focus:border-opacity-50 border-pattern-empty focus:border-pattern-text block border transition-colors duration-150 focus:outline-none">
		</canvas>

		<ContextMenu
			position={contextMenuPosition}
			items={editMenuItems}
			onAction={handleContextMenuAction}
			onClose={closeContextMenu} />

		<ContextMenu
			position={channelContextMenuPosition}
			items={getChannelContextMenuItems()}
			onAction={handleChannelContextMenuAction}
			onClose={closeChannelContextMenu} />
	</div>
</div>
