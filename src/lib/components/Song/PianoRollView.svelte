<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { CSS_VAR_MAP, type ThemeColorKey } from '../../config/theme-colors';
	import type { ChipProcessor } from '../../chips/base/processor';
	import { pianoEffectGestureFor } from '../../chips/base/piano-effect-gesture';
	import { listPatternEffectStatusHints } from '../../chips/base/effect-status';
	import { getEffectFormatCharColors } from '../../chips/base/effect-format-color';
	import { parseSymbol } from '../../chips/base/field-formatters';
	import type { AudioService } from '../../services/audio/audio-service';
	import { AutoEnvService } from '../../services/pattern/auto-env-service';
	import type { EditingContext, FieldInfo } from '../../services/pattern/editing/editing-context';
	import { PatternNoteInput } from '../../services/pattern/editing/pattern-note-input';
	import { effectCommandFromFormat } from '../../services/piano-roll/piano-effect-input';
	import {
		laneShowsNote,
		pianoLaneCodec,
		type PianoFieldValue
	} from '../../services/piano-roll/piano-lane-codec';
	import {
		EMPTY_NOTE,
		gateNote,
		noteEventKind,
		notePitchIndex,
		pitchNoteText,
		RELEASE_NOTE
	} from '../../services/piano-roll/piano-note-events';
	import {
		amplitudeFields,
		listPianoRollChannels,
		listPianoRollLanes,
		pianoLaneValueFromRatio,
		pianoRollFieldKeys,
		readPianoFieldValue,
		setPianoFieldValue,
		type PianoRollLane
	} from '../../services/piano-roll/piano-roll-schema';
	import {
		blockLength,
		carryAmplitude,
		carryOrnament,
		collectPianoNotes,
		noteSpotKey,
		PIANO_ROLL_PITCH_COUNT,
		sameNoteSpot,
		type PianoNoteBlock,
		type PianoNoteSpot
	} from '../../services/piano-roll/piano-roll-notes';
	import {
		buildPianoTimeline,
		clearSpilledNoteGate,
		collectTimelineBlocks,
		isTimelineBlock,
		spanEnd,
		timelineColumnCount,
		timelineSpanAt,
		timelineSpanForOrder,
		timelineWindow,
		writeSpilledNoteTail,
		type PianoTimelineBlock,
		type PianoTimelineGate,
		type PianoTimelineLocation,
		type PianoTimelineSpan
	} from '../../services/piano-roll/piano-roll-timeline';
	import {
		pitchedBlockSpan,
		relocatePitchedNote,
		removePitchedNote,
		removePitchedNotes,
		resizePitchedNote,
		setNoteValue
	} from '../../services/piano-roll/piano-roll-editing';
	import {
		blockIntersectsMarquee,
		clampSelectionDelta,
		hitTestNoteContent,
		noteContentSize,
		pitchToY,
		xToRow,
		yToPitch,
		type ContentRect,
		type PianoRollMetrics
	} from '../../services/piano-roll/piano-roll-geometry';
	import {
		capturePianoNote,
		clipboardFromCaptures,
		pastePianoNotes,
		pianoRollClipboard,
		type CapturedPianoNote,
		type PianoPasteNote
	} from '../../services/piano-roll/piano-roll-clipboard';
	import {
		conflictNotesSignature,
		heldConflictIntents,
		overlapsAny,
		planPianoIntents,
		rangesOverlap,
		replaceChannelConflicts,
		withoutSpots,
		type PianoIntentNote
	} from '../../services/piano-roll/piano-roll-conflicts';
	import { PianoPatternSession } from '../../services/piano-roll/piano-pattern-session';
	import {
		commitPianoConflictEdits,
		commitPianoPatternEdits,
		type PianoEditCursor
	} from '../../services/piano-roll/piano-roll-history';
	import { PianoNotePreview } from '../../services/piano-roll/piano-note-preview';
	import {
		drawPianoGrid,
		drawPianoKeyboard,
		drawPianoLane,
		type PianoBlockPreview
	} from '../../ui-rendering/piano-roll-renderer';
	import { PianoBlockFades } from '../../ui-rendering/piano-roll-block-fades';
	import {
		instrumentColorsById,
		patternRowInstrumentId
	} from '../../ui-rendering/instrument-pattern-colors';
	import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { playbackStore } from '../../stores/playback.svelte';
	import { pianoRollConflictStore } from '../../stores/piano-roll-conflicts.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import { undoRedoStore } from '../../stores/undo-redo.svelte';
	import { autoEnvStore } from '../../stores/auto-env.svelte';
	import { settingsStore } from '../../stores/settings.svelte';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { themeService } from '../../services/theme/theme-service';
	import { midiService } from '../../services/midi/midi-service';
	import { getColors } from '../../utils/colors';
	import { groupBy } from '../../utils/group-by';
	import { onPointerDownOutside } from '../../utils/outside-pointer';
	import { noteToEnvelopePeriod } from '../../utils/envelope-note-conversion';
	import { midiNoteToNoteNameAndOctave, noteToTuningTableIndex } from '../../utils/note-utils';
	import { ShortcutString } from '../../utils/shortcut-string';
	import {
		ACTION_COPY,
		ACTION_CUT,
		ACTION_PASTE,
		ACTION_TOGGLE_PLAYBACK
	} from '../../config/keybindings';
	import type { Pattern } from '../../models/song';
	import type { GenericPattern, GenericRow } from '../../models/song/generic';

	const KEYBOARD_WIDTH = 76;
	const RULER_HEIGHT = 22;
	const LANE_HEIGHT = 88;
	const LANE_EDITOR_WIDTH = 176;
	const WINDOW_OVERSCAN_ROWS = 48;
	const ROW_WIDTH_RANGE = { min: 8, max: 40 };
	const KEY_HEIGHT_RANGE = { min: 8, max: 28 };
	const genericCache = new WeakMap<Pattern, GenericPattern>();
	const patternTokens = new WeakMap<Pattern, number>();
	let patternTokenSeq = 1;

	interface NoteSelection extends PianoNoteSpot {
		orderIndex: number;
		patternId: number;
		localStartRow: number;
	}

	interface MoveGroupNote extends NoteSelection {
		length: number;
		color: string | null;
		instrument: number | null;
		gestures: PianoNoteBlock['gestures'];
		level: number | null;
	}

	interface LaneCell {
		orderIndex: number;
		patternId: number;
		localRow: number;
	}

	interface LaneEditor extends LaneCell {
		kind: 'effect' | 'value';
		laneKey: string;
		absoluteRow: number;
		text: string;
		original: string;
		left: number;
	}

	interface IntentResult {
		changed: boolean;
		preview: Pattern | null;
		previewRow: number;
	}

	interface TimelineView {
		key: string;
		blocks: PianoTimelineBlock[];
		gates: PianoTimelineGate[];
		valueOrigin: number;
		laneValues: unknown[];
		patternIds: number[];
	}

	type GridPoint = { x: number; y: number; inRuler: boolean };

	const EMPTY_VIEW: TimelineView = {
		key: '',
		blocks: [],
		gates: [],
		valueOrigin: 0,
		laneValues: [],
		patternIds: []
	};

	const services: { audioService: AudioService } = getContext('container');
	const notePreview = new PianoNotePreview(services.audioService);

	let {
		chipProcessors,
		currentPatternOrderIndex = $bindable(0),
		selectedRow = $bindable(0),
		orderListPick = 0,
		onchannelchange,
		ontoggleplayback,
		onseekplayback
	}: {
		chipProcessors: ChipProcessor[];
		currentPatternOrderIndex: number;
		selectedRow: number;
		orderListPick?: number;
		onchannelchange?: (songIndex: number, channelIndex: number, fieldKey: string) => void;
		ontoggleplayback?: () => void;
		onseekplayback?: (orderIndex: number, row: number) => void;
	} = $props();

	let rowWidth = $state(16);
	let keyHeight = $state(16);
	let scrollX = $state(0);
	let scrollY = $state(0);
	let scrollBucket = $state(0);
	let gridWidth = $state(0);
	let gridHeight = $state(0);
	let laneWidth = $state(0);
	let keyboardHeight = $state(0);
	let colorVersion = $state(0);
	let focusTarget = $state<'note' | 'lane'>('note');
	let selectedBlock = $state<NoteSelection | null>(null);
	let selectedNotes = $state<NoteSelection[]>([]);
	let marquee = $state<ContentRect | null>(null);
	let placedBlockLength = $state<number | null>(null);
	let drag = $state<
		| {
				kind: 'move';
				from: NoteSelection;
				row: number;
				pitch: number;
				grabOffset: number;
				group: MoveGroupNote[];
		  }
		| {
				kind: 'resize';
				orderIndex: number;
				localStart: number;
				startRow: number;
				pitch: number;
				instrument: number | null;
				gestures: PianoNoteBlock['gestures'];
				endRow: number;
				originEnd: number;
		  }
		| { kind: 'lane'; rows: Record<number, number> }
		| null
	>(null);
	let blockFadeNow = $state(0);
	const blockFades = new PianoBlockFades((now) => (blockFadeNow = now));
	let scrollFrame = 0;
	let followedOrder = -1;
	let seenOrderListPick = 0;
	let lockOrderSync = false;
	let centered = false;
	let viewCache: TimelineView | null = null;

	let gridScroller = $state<HTMLDivElement | null>(null);
	let keyboardViewport = $state<HTMLDivElement | null>(null);
	let laneViewport = $state<HTMLDivElement | null>(null);
	let gridCanvas = $state<HTMLCanvasElement | null>(null);
	let keyboardCanvas = $state<HTMLCanvasElement | null>(null);
	let laneCanvas = $state<HTMLCanvasElement | null>(null);
	let removeDragListeners: (() => void) | null = null;
	let laneMenuOpen = $state(false);
	let laneMenuRoot: HTMLDivElement | null = null;
	let releaseLaneMenuListener: (() => void) | null = null;
	let laneEditor = $state<LaneEditor | null>(null);
	let laneEditorRoot = $state<HTMLDivElement | null>(null);
	let laneEditorInput = $state<HTMLInputElement | null>(null);
	let releaseLaneEditorListener: (() => void) | null = null;

	const channels = $derived(
		listPianoRollChannels(
			projectStore.songs,
			chipProcessors.map((processor) => processor.chip)
		)
	);
	const groups = $derived(
		[...groupBy(channels, (channel) => channel.songIndex)].map(([songIndex, items]) => ({
			songIndex,
			chipName: items[0]?.chipName ?? '',
			channels: items
		}))
	);
	const selected = $derived(
		channels.find(
			(channel) =>
				channel.songIndex === editorStateStore.pianoRollSongIndex &&
				channel.channelIndex === editorStateStore.pianoRollChannelIndex
		) ??
			channels[0] ??
			null
	);
	const chip = $derived(selected ? (chipProcessors[selected.songIndex]?.chip ?? null) : null);
	const converter = $derived(chip ? chip.createConverter() : null);
	const fieldKeys = $derived(chip ? pianoRollFieldKeys(chip.schema) : null);
	const noteKey = $derived(fieldKeys?.note ?? null);
	const instrumentKey = $derived(fieldKeys?.instrument ?? null);
	const tuningTable = $derived(projectStore.songs[selected?.songIndex ?? -1]?.tuningTable ?? []);
	const songPatterns = $derived(
		selected ? (projectStore.patterns[selected.songIndex] ?? []) : []
	);
	const patternById = $derived.by(() => {
		const map = new Map<number, Pattern>();
		for (const item of songPatterns) {
			if (!map.has(item.id)) map.set(item.id, item);
		}
		return map;
	});
	const timeline = $derived(
		buildPianoTimeline(
			projectStore.patternOrder,
			(patternId) => patternById.get(patternId)?.length
		)
	);
	const effectCount = $derived.by(() => {
		if (!selected) return 1;
		let max = 1;
		for (const item of songPatterns) {
			const count = item.channels[selected.channelIndex]?.effectColumnCount;
			if (typeof count === 'number' && count > max) max = count;
		}
		return max;
	});
	const lanes = $derived(chip ? listPianoRollLanes(chip.schema, effectCount) : []);
	const effectHints = $derived(chip ? listPatternEffectStatusHints(chip) : []);
	const activeLane = $derived(
		lanes.find((lane) => lane.key === editorStateStore.pianoRollLaneKey) ??
			lanes.find((lane) => lane.kind === 'value') ??
			lanes[0] ??
			null
	);
	const laneCodec = $derived(
		pianoLaneCodec(activeLane, {
			envelopeAsNote: editorStateStore.envelopeAsNote,
			tuningTable
		})
	);
	const effectEditorGlyphs = $derived.by(() => {
		const text =
			laneEditor?.kind === 'effect' && laneCodec ? laneCodec.clamp(laneEditor.text) : '';
		const shown = (text + '....').slice(0, 4);
		const colors = getEffectFormatCharColors(shown);
		return [...shown].map((char, index) => ({
			char,
			color: colors[index] ?? 'var(--color-app-text-muted)'
		}));
	});
	const typedLaneColor = $derived.by(() => {
		const key = activeLane?.color;
		if (key && key in CSS_VAR_MAP) return `var(${CSS_VAR_MAP[key as ThemeColorKey]})`;
		return 'var(--color-app-text-primary)';
	});
	const notes = $derived.by(buildTimelineView);
	const metrics = $derived<PianoRollMetrics>({
		rowWidth,
		keyHeight,
		columns: Math.max(1, timelineColumnCount(timeline)),
		pitchCount: noteKey ? PIANO_ROLL_PITCH_COUNT : 1
	});
	const content = $derived(noteContentSize(metrics));
	const cursorRow = $derived.by(() => {
		const span = timelineSpanForOrder(timeline, currentPatternOrderIndex);
		if (!span) return 0;
		return span.startRow + Math.min(Math.max(0, selectedRow), Math.max(0, span.length - 1));
	});
	const instrumentColorMap = $derived(
		instrumentColorsById(filterInstrumentsForChip(projectStore.instruments, chip?.type ?? ''))
	);
	const hiddenBlocks = $derived.by((): PianoNoteSpot[] => {
		if (drag?.kind === 'resize') return [{ startRow: drag.startRow, pitchIndex: drag.pitch }];
		if (drag?.kind === 'move') {
			return drag.group.map((item) => ({
				startRow: item.startRow,
				pitchIndex: item.pitchIndex
			}));
		}
		return [];
	});
	const dragPreviews = $derived.by((): PianoBlockPreview[] => {
		if (drag?.kind === 'resize') {
			const spot = { startRow: drag.startRow, pitchIndex: drag.pitch };
			return [
				{
					...spot,
					endRow: drag.endRow,
					color: null,
					instrument: drag.instrument,
					gestures: drag.gestures,
					level: findBlock(spot)?.level
				}
			];
		}
		if (drag?.kind !== 'move') return [];
		const deltaRow = drag.row - drag.from.startRow;
		const deltaPitch = drag.pitch - drag.from.pitchIndex;
		return drag.group.map((item) => ({
			startRow: item.startRow + deltaRow,
			endRow: item.startRow + deltaRow + item.length,
			pitchIndex: item.pitchIndex + deltaPitch,
			color: item.color,
			instrument: item.instrument,
			gestures: item.gestures,
			level: item.level
		}));
	});
	const laneDraft = $derived(drag?.kind === 'lane' ? drag.rows : null);
	const visibleSelection = $derived.by(() => {
		const current = selectedBlock;
		if (!current) return null;
		if (drag?.kind === 'move' || drag?.kind === 'resize') return current;
		const span = timelineSpanForOrder(timeline, current.orderIndex);
		if (!span || span.patternId !== current.patternId || !noteKey) return null;
		if (
			noteEventKind(channelRows(span.patternId)?.[current.localStartRow]?.[noteKey]) !==
			'pitched'
		) {
			return null;
		}
		const startRow = span.startRow + current.localStartRow;
		if (current.startRow === startRow) return current;
		return { ...current, startRow };
	});
	const highlightedNotes = $derived(
		visibleSelection ? [visibleSelection, ...selectedNotes] : selectedNotes
	);

	$effect(() => {
		if (!selected) return;
		const fieldKey =
			focusTarget === 'lane' && activeLane
				? activeLane.fieldKey
				: (noteKey ?? activeLane?.fieldKey ?? 'note');
		onchannelchange?.(selected.songIndex, selected.channelIndex, fieldKey);
	});

	$effect(() => themeService.onColorChange(() => (colorVersion += 1)));

	$effect(() => {
		const scroller = gridScroller;
		const keyboard = keyboardViewport;
		const lane = laneViewport;
		if (!lane && !scroller) return;
		const observer = new ResizeObserver(() => {
			if (scroller) {
				gridWidth = scroller.clientWidth;
				gridHeight = scroller.clientHeight;
			}
			if (keyboard) keyboardHeight = keyboard.clientHeight;
			if (lane) laneWidth = lane.clientWidth;
		});
		if (scroller) observer.observe(scroller);
		if (keyboard) observer.observe(keyboard);
		if (lane) observer.observe(lane);
		return () => observer.disconnect();
	});

	$effect(() => {
		const canvas = gridCanvas;
		const lane = laneCanvas;
		const scroller = gridScroller;
		if (!canvas || !scroller) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			if (event.ctrlKey || event.metaKey || event.altKey) {
				const step = event.deltaY < 0 ? 1 : -1;
				if (event.altKey) zoomPitch(step);
				else zoomTime(step);
				return;
			}
			scroller.scrollLeft += event.deltaX;
			scroller.scrollTop += event.deltaY;
		};
		canvas.addEventListener('wheel', onWheel, { passive: false });
		lane?.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			canvas.removeEventListener('wheel', onWheel);
			lane?.removeEventListener('wheel', onWheel);
		};
	});

	$effect(() => {
		if (centered || !gridScroller || gridHeight <= RULER_HEIGHT || !noteKey) return;
		centered = true;
		const y = pitchToY(36, metrics);
		gridScroller.scrollTop = Math.max(0, y - (gridHeight - RULER_HEIGHT) / 2);
	});

	$effect(() => {
		const index = currentPatternOrderIndex;
		const playing = playbackStore.isPlaying;
		const span = timelineSpanForOrder(timeline, index);
		const scroller = gridScroller;
		if (!span || !scroller || gridWidth <= 0) return;
		if (orderListPick !== seenOrderListPick) {
			seenOrderListPick = orderListPick;
			followedOrder = index;
			moveScrollLeft(scroller, span.startRow * rowWidth);
			return;
		}
		if (playing) {
			followedOrder = index;
			return;
		}
		if (followedOrder === index) return;
		followedOrder = index;
		const left = span.startRow * rowWidth;
		const right = left + span.length * rowWidth;
		const viewLeft = scroller.scrollLeft;
		const overlaps = right > viewLeft && left < viewLeft + gridWidth;
		if (!overlaps) moveScrollLeft(scroller, Math.max(0, left - rowWidth * 2));
	});

	$effect(() => {
		if (!settingsStore.midiInputDeviceId) return;
		return midiService.addNoteListener((midiNote, velocity) => {
			if (!gridCanvas || document.activeElement !== gridCanvas) return;
			if (velocity === 0) {
				notePreview.stop();
				return;
			}
			const parsed = midiNoteToNoteNameAndOctave(midiNote);
			if (!parsed) return;
			const pitch = noteToTuningTableIndex(parsed.noteName, parsed.octave);
			if (pitch === null) return;
			const span = timelineSpanForOrder(timeline, currentPatternOrderIndex);
			if (span) placePitched(span, selectedRow, pitch, true, false);
		});
	});

	$effect(() => {
		rowWidth;
		noteScrollBucket(scrollX);
	});

	$effect(() => {
		blockFades.sync(
			notes.blocks,
			notes.patternIds,
			`${selected?.songIndex ?? ''}:${selected?.channelIndex ?? ''}:${noteKey ?? ''}`
		);
	});

	$effect(() => {
		colorVersion;
		if (!keyboardCanvas || keyboardHeight <= 0) return;
		const ctx = prepareCanvas(keyboardCanvas, KEYBOARD_WIDTH, keyboardHeight);
		if (!ctx) return;
		drawPianoKeyboard(ctx, {
			colors: rollColors(),
			width: KEYBOARD_WIDTH,
			height: keyboardHeight,
			scrollY,
			metrics
		});
	});

	$effect(() => {
		colorVersion;
		if (!gridCanvas || gridWidth <= 0 || gridHeight <= 0) return;
		const ctx = prepareCanvas(gridCanvas, gridWidth, gridHeight);
		if (!ctx) return;
		const now = blockFadeNow;
		drawPianoGrid(ctx, {
			colors: rollColors(),
			width: gridWidth,
			height: gridHeight,
			rulerHeight: RULER_HEIGHT,
			scrollX,
			scrollY,
			metrics,
			blocks: notes.blocks,
			gates: notes.gates,
			spans: timeline,
			currentOrderIndex: currentPatternOrderIndex,
			cursorRow,
			selectedNotes: highlightedNotes,
			marquee,
			hiddenBlocks,
			previews: dragPreviews,
			leavingBlocks: blockFades.leaving(now),
			presenceFor: (block) => blockFades.presence(block, now),
			resolveColor: resolveNoteColor
		});
	});

	$effect(() => {
		colorVersion;
		if (!laneCanvas || !activeLane || laneWidth <= 0) return;
		const height = Math.max(1, laneViewport?.clientHeight ?? LANE_HEIGHT);
		const ctx = prepareCanvas(laneCanvas, laneWidth, height);
		if (!ctx) return;
		drawPianoLane(ctx, {
			colors: rollColors(),
			width: laneWidth,
			height,
			scrollX,
			metrics,
			lane: activeLane,
			values: notes.laneValues,
			valueOrigin: notes.valueOrigin,
			spans: timeline,
			draft: laneDraft,
			cursorRow,
			envelopeAsNote: editorStateStore.envelopeAsNote,
			tuningTable
		});
	});

	$effect(() => {
		selected?.songIndex;
		selected?.channelIndex;
		activeLane?.key;
		playbackStore.isPlaying;
		editorStateStore.envelopeAsNote;
		return () => dismissLaneEditor();
	});

	$effect(() => () => {
		removeDragListeners?.();
		notePreview.stop();
		if (scrollFrame) cancelAnimationFrame(scrollFrame);
		blockFades.dispose();
		releaseLaneMenuListener?.();
		releaseLaneEditorListener?.();
	});

	let rollPalette = getColors();
	let rollPaletteVersion = -1;

	function rollColors() {
		if (rollPaletteVersion !== colorVersion) {
			rollPaletteVersion = colorVersion;
			rollPalette = getColors();
		}
		return rollPalette;
	}

	function clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	function zoomTime(step: number): void {
		rowWidth = clamp(rowWidth + step, ROW_WIDTH_RANGE.min, ROW_WIDTH_RANGE.max);
	}

	function zoomPitch(step: number): void {
		keyHeight = clamp(keyHeight + step, KEY_HEIGHT_RANGE.min, KEY_HEIGHT_RANGE.max);
	}

	function noteScrollBucket(left: number): void {
		const next = Math.floor(left / (WINDOW_OVERSCAN_ROWS * Math.max(1, rowWidth)));
		if (next !== scrollBucket) scrollBucket = next;
	}

	function prepareCanvas(
		canvas: HTMLCanvasElement,
		width: number,
		height: number
	): CanvasRenderingContext2D | null {
		const dpr = window.devicePixelRatio || 1;
		const nextWidth = Math.max(1, Math.floor(width * dpr));
		const nextHeight = Math.max(1, Math.floor(height * dpr));
		if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
			canvas.width = nextWidth;
			canvas.height = nextHeight;
		}
		const styleWidth = `${Math.max(1, Math.floor(width))}px`;
		const styleHeight = `${Math.max(1, Math.floor(height))}px`;
		if (canvas.style.width !== styleWidth) canvas.style.width = styleWidth;
		if (canvas.style.height !== styleHeight) canvas.style.height = styleHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return ctx;
	}

	function resolveNoteColor(block: PianoNoteBlock): string | null {
		if (!block.instrument) return null;
		const id = patternRowInstrumentId(block.instrument);
		return id ? (instrumentColorMap.get(id) ?? null) : null;
	}

	function patternToken(item: Pattern): number {
		const existing = patternTokens.get(item);
		if (existing !== undefined) return existing;
		const next = patternTokenSeq++;
		patternTokens.set(item, next);
		return next;
	}

	function cachedGeneric(item: Pattern): GenericPattern {
		const hit = genericCache.get(item);
		if (hit) return hit;
		if (!converter) return { id: item.id, length: item.length, channels: [], patternRows: [] };
		const generic = converter.toGeneric(item);
		genericCache.set(item, generic);
		return generic;
	}

	function channelRows(patternId: number): GenericRow[] | undefined {
		const item = patternById.get(patternId);
		if (!item || !selected) return undefined;
		return cachedGeneric(item).channels[selected.channelIndex]?.rows;
	}

	function timelineViewKey(windowSpans: readonly PianoTimelineSpan[]): string {
		if (!selected) return '';
		let key = `${selected.songIndex}:${selected.channelIndex}:${noteKey}:${activeLane?.key ?? ''}:`;
		const keyStart = windowSpans[0]?.orderIndex ?? 0;
		for (const span of timeline) {
			if (span.orderIndex < keyStart) continue;
			const item = patternById.get(span.patternId);
			key += `${span.orderIndex}.${span.startRow}.${item ? patternToken(item) : 0}:`;
		}
		for (const table of projectStore.tables) {
			key += `${table.id}.${table.additive ? 1 : 0}.${table.rows.join(',')}|`;
		}
		return key + `conflicts.${pianoRollConflictStore.revision}`;
	}

	function buildTimelineView(): TimelineView {
		if (!selected || !chip || !converter || !noteKey || timeline.length === 0) {
			viewCache = EMPTY_VIEW;
			return EMPTY_VIEW;
		}
		const step = WINDOW_OVERSCAN_ROWS;
		const origin = Math.max(0, scrollBucket * step - step);
		const extent =
			(scrollBucket + 2) * step + Math.ceil(Math.max(gridWidth, rowWidth) / rowWidth);
		const windowSpans = timelineWindow(timeline, origin, extent);
		const key = timelineViewKey(windowSpans);
		if (viewCache && viewCache.key === key) return viewCache;
		const rowsForSpan = (span: PianoTimelineSpan) => channelRows(span.patternId);
		const amplitude = amplitudeFields(chip.schema);
		const amplitudeCarry = new Map<string, number>();
		const ornament = fieldKeys?.table
			? { lookup: ornamentTable, carry: { id: null as number | null } }
			: undefined;
		const windowStart = windowSpans[0]?.orderIndex ?? Number.POSITIVE_INFINITY;
		if (amplitude.length > 0 || ornament) {
			for (const span of timeline) {
				if (span.orderIndex >= windowStart) break;
				const rows = rowsForSpan(span);
				if (!rows) continue;
				carryAmplitude(rows, amplitude, amplitudeCarry);
				if (ornament) carryOrnament(rows, ornament.carry);
			}
		}
		const gestureFor = (effect: Parameters<typeof pianoEffectGestureFor>[0]) =>
			pianoEffectGestureFor(effect, chip);
		const { blocks, gates } = collectTimelineBlocks({
			timeline,
			spans: windowSpans,
			noteKey,
			rowsForSpan,
			collect: (rows) =>
				collectPianoNotes(rows, noteKey, {
					gestureFor,
					amplitude,
					amplitudeCarry,
					ornament
				})
		});
		const valueOrigin = windowSpans[0]?.startRow ?? 0;
		const tail = windowSpans.at(-1);
		const visibleEnd = tail ? spanEnd(tail) : 0;
		blocks.push(...conflictBlocks(valueOrigin, visibleEnd));
		viewCache = {
			key,
			blocks,
			gates,
			valueOrigin,
			laneValues: laneValuesFor(windowSpans, valueOrigin, visibleEnd),
			patternIds: windowSpans.map((span) => span.patternId)
		};
		return viewCache;
	}

	function ornamentTable(id: number) {
		const table = projectStore.tables.find((item) => item.id === id);
		return table ? { rows: table.rows, additive: table.additive } : null;
	}

	function laneValuesFor(
		windowSpans: readonly PianoTimelineSpan[],
		valueOrigin: number,
		visibleEnd: number
	): unknown[] {
		const values = new Array<unknown>(Math.max(0, visibleEnd - valueOrigin));
		const lane = activeLane;
		if (!lane || !selected) return values;
		for (const span of windowSpans) {
			const item = patternById.get(span.patternId);
			if (!item) continue;
			const generic = cachedGeneric(item);
			for (let localRow = 0; localRow < span.length; localRow++) {
				values[span.startRow - valueOrigin + localRow] = readPianoFieldValue(
					generic,
					lane,
					selected.channelIndex,
					localRow
				);
			}
		}
		return values;
	}

	function conflictBlocks(visibleStart: number, visibleEnd: number): PianoTimelineBlock[] {
		if (!selected) return [];
		const blocks: PianoTimelineBlock[] = [];
		for (const conflict of pianoRollConflictStore.forChannel(
			selected.songIndex,
			selected.channelIndex
		)) {
			if (
				conflict.startRow + conflict.length <= visibleStart ||
				conflict.startRow >= visibleEnd
			) {
				continue;
			}
			const located = timelineSpanAt(timeline, conflict.startRow);
			if (!located) continue;
			blocks.push({
				startRow: conflict.startRow,
				endRow: conflict.startRow + conflict.length,
				pitchIndex: conflict.pitchIndex,
				note: conflict.note,
				instrument: conflict.instrument,
				gestures: [],
				level: null,
				orderIndex: located.span.orderIndex,
				patternId: located.span.patternId,
				localStartRow: located.localRow,
				conflict: true
			});
		}
		return blocks;
	}

	function onGridScroll(): void {
		if (scrollFrame) return;
		scrollFrame = requestAnimationFrame(() => {
			scrollFrame = 0;
			const scroller = gridScroller;
			if (!scroller) return;
			const left = scroller.scrollLeft;
			const top = scroller.scrollTop;
			if (left !== scrollX) scrollX = left;
			if (top !== scrollY) scrollY = top;
			if (playbackStore.isPlaying) return;
			if (lockOrderSync) {
				lockOrderSync = false;
				return;
			}
			syncOrderToScroll(left);
		});
	}

	function moveScrollLeft(scroller: HTMLElement, left: number): void {
		if (scroller.scrollLeft === left) return;
		lockOrderSync = true;
		scroller.scrollLeft = left;
	}

	function syncOrderToScroll(scrollLeft: number): void {
		if (playbackStore.isPlaying || rowWidth <= 0 || timeline.length === 0) return;
		const absolute = Math.min(
			metrics.columns - 1,
			Math.max(0, Math.floor(scrollLeft / rowWidth))
		);
		const located = timelineSpanAt(timeline, absolute);
		if (!located || located.span.orderIndex === currentPatternOrderIndex) return;
		followedOrder = located.span.orderIndex;
		const row = Math.min(selectedRow, Math.max(0, located.span.length - 1));
		currentPatternOrderIndex = located.span.orderIndex;
		if (selectedRow !== row) selectedRow = row;
	}

	function focusLocation(span: PianoTimelineSpan, localRow: number, scrollIntoView = true): void {
		const row = Math.min(Math.max(0, localRow), Math.max(0, span.length - 1));
		if (currentPatternOrderIndex !== span.orderIndex)
			currentPatternOrderIndex = span.orderIndex;
		if (selectedRow !== row) selectedRow = row;
		if (scrollIntoView) reveal(span.startRow + row);
	}

	function moveCursorTo(absoluteRow: number): void {
		const located = timelineSpanAt(timeline, clamp(absoluteRow, 0, metrics.columns - 1));
		if (located) focusLocation(located.span, located.localRow);
	}

	function advanceCursor(advance: boolean, absoluteRow: number): void {
		if (advance && editorStateStore.step > 0) moveCursorTo(absoluteRow + editorStateStore.step);
	}

	function reveal(absoluteRow: number): void {
		const scroller = gridScroller;
		if (!scroller || gridWidth <= 0) return;
		const x = absoluteRow * rowWidth;
		const left = scroller.scrollLeft;
		if (x < left + rowWidth || x > left + gridWidth - rowWidth * 2) {
			moveScrollLeft(scroller, Math.max(0, x - gridWidth / 3));
		}
	}

	function contentPoint(event: MouseEvent): GridPoint | null {
		if (!gridCanvas) return null;
		const rect = gridCanvas.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		if (localY < RULER_HEIGHT) return { x: localX + scrollX, y: localY, inRuler: true };
		return { x: localX + scrollX, y: localY - RULER_HEIGHT + scrollY, inRuler: false };
	}

	function lanePoint(event: MouseEvent): { row: number; ratio: number } | null {
		if (!laneCanvas) return null;
		const rect = laneCanvas.getBoundingClientRect();
		const row = xToRow(event.clientX - rect.left + scrollX, metrics);
		if (row === null || rect.height <= 0) return null;
		return { row, ratio: 1 - (event.clientY - rect.top) / rect.height };
	}

	function trackPointer(
		onMove: (event: MouseEvent) => void,
		onUp: (event: MouseEvent) => void = () => {}
	): void {
		removeDragListeners?.();
		const up = (event: MouseEvent) => {
			removeDragListeners?.();
			removeDragListeners = null;
			onUp(event);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', up);
		removeDragListeners = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', up);
		};
	}

	function selectionFor(
		span: PianoTimelineSpan,
		localRow: number,
		pitchIndex: number
	): NoteSelection {
		return {
			orderIndex: span.orderIndex,
			patternId: span.patternId,
			localStartRow: localRow,
			startRow: span.startRow + localRow,
			pitchIndex
		};
	}

	function selectionsAt(spots: readonly PianoNoteSpot[]): NoteSelection[] {
		const selections: NoteSelection[] = [];
		for (const spot of spots) {
			const home = timelineSpanAt(timeline, spot.startRow);
			if (home) selections.push(selectionFor(home.span, home.localRow, spot.pitchIndex));
		}
		return selections;
	}

	function selectionCursor(selection: NoteSelection): PianoEditCursor {
		return { orderIndex: selection.orderIndex, row: selection.localStartRow };
	}

	function locationCursor(location: PianoTimelineLocation): PianoEditCursor {
		return { orderIndex: location.span.orderIndex, row: location.localRow };
	}

	function applySelection(next: NoteSelection[]): void {
		selectedNotes = next;
		selectedBlock = next.length === 1 ? (next[0] ?? null) : null;
	}

	function workingSelection(): NoteSelection[] {
		if (selectedNotes.length > 0) return selectedNotes;
		return selectedBlock ? [selectedBlock] : [];
	}

	function mergeSelections(current: NoteSelection[], added: NoteSelection[]): NoteSelection[] {
		const seen = new Set(current.map(noteSpotKey));
		const next = [...current];
		for (const note of added) {
			const key = noteSpotKey(note);
			if (seen.has(key)) continue;
			seen.add(key);
			next.push(note);
		}
		return next;
	}

	function toggleSelected(note: NoteSelection): void {
		const current = workingSelection();
		const next = current.some((item) => sameNoteSpot(item, note))
			? withoutSpots(current, [note])
			: [...current, note];
		applySelection(next);
	}

	function dropSelectionAt(orderIndex: number, localRow: number): void {
		const current = workingSelection();
		const next = current.filter(
			(item) => item.orderIndex !== orderIndex || item.localStartRow !== localRow
		);
		if (next.length !== current.length) applySelection(next);
	}

	function land(
		selection: NoteSelection[],
		focus: PianoTimelineLocation | null,
		scrollIntoView = true
	): void {
		applySelection(selection);
		if (focus) focusLocation(focus.span, focus.localRow, scrollIntoView);
	}

	function findBlock(spot: PianoNoteSpot): PianoTimelineBlock | undefined {
		return notes.blocks.find((block) => sameNoteSpot(block, spot));
	}

	function blockIsConflict(spot: PianoNoteSpot): boolean {
		return notes.blocks.some((block) => block.conflict === true && sameNoteSpot(block, spot));
	}

	function openSession(): PianoPatternSession | null {
		if (!converter || !selected) return null;
		return new PianoPatternSession(
			converter,
			(id) => patternById.get(id),
			selected.channelIndex
		);
	}

	function editSession(): PianoPatternSession | null {
		return playbackStore.isPlaying ? null : openSession();
	}

	function commitSession(session: PianoPatternSession, cursor: PianoEditCursor): boolean {
		const edits = session.edits();
		if (edits.size === 0 || !selected) return false;
		commitPianoPatternEdits(selected.songIndex, edits, cursor);
		return true;
	}

	function editingContext(source: Pattern, row: number): EditingContext | null {
		if (!chip || !converter) return null;
		return {
			pattern: source,
			selectedRow: row,
			selectedColumn: 0,
			cellPositions: [],
			converter,
			formatter: chip.createFormatter(),
			schema: chip.schema,
			instruments: filterInstrumentsForChip(projectStore.instruments, chip.type),
			tuningTable
		};
	}

	function withAutoEnvelope(source: Pattern, row: number): Pattern {
		if (!selected || !noteKey) return source;
		return AutoEnvService.applyAutoEnvelopeIfEligible(
			source,
			row,
			{ channelIndex: selected.channelIndex, fieldType: 'note', fieldKey: noteKey },
			tuningTable,
			autoEnvStore.currentRatio,
			autoEnvStore.enabled
		);
	}

	function noteEventAt(absoluteRow: number) {
		const located = timelineSpanAt(timeline, absoluteRow);
		if (!located || !noteKey) return 'empty';
		return noteEventKind(channelRows(located.span.patternId)?.[located.localRow]?.[noteKey]);
	}

	function releaseAt(absoluteRow: number): boolean {
		return noteEventAt(absoluteRow) === 'release';
	}

	function sealTail(
		session: PianoPatternSession,
		absoluteStart: number,
		length: number | null,
		release: boolean
	): boolean {
		const located = timelineSpanAt(timeline, absoluteStart);
		if (!noteKey || length === null || length < 1 || !located) return false;
		if (absoluteStart + length < spanEnd(located.span)) return false;
		const changed = writeSpilledNoteTail(
			timeline,
			noteKey,
			absoluteStart,
			length,
			release,
			session.rowsForSpan
		);
		session.markAll(changed);
		return changed.size > 0;
	}

	function clearOpenTail(
		session: PianoPatternSession,
		span: PianoTimelineSpan,
		localStart: number
	): void {
		if (!noteKey) return;
		const rows = session.rows(span.patternId);
		const block = rows ? pitchedBlockSpan(rows, noteKey, localStart) : null;
		if (!block || block.bounded) return;
		session.markAll(
			clearSpilledNoteGate(timeline, noteKey, spanEnd(span), session.rowsForSpan)
		);
	}

	function channelIntents(): PianoIntentNote[] {
		const key = noteKey;
		if (!selected || !key) return [];
		const { blocks } = collectTimelineBlocks({
			timeline,
			noteKey: key,
			rowsForSpan: (span) => channelRows(span.patternId),
			collect: (rows) => collectPianoNotes(rows, key)
		});
		const columns = timelineColumnCount(timeline);
		return blocks.map((block) => {
			const bounded = block.endRow < columns;
			return {
				startRow: block.startRow,
				length: blockLength(block),
				pitchIndex: block.pitchIndex,
				note: block.note,
				instrument: block.instrument,
				release: bounded && releaseAt(block.endRow),
				bounded,
				preferred: true
			};
		});
	}

	function heldIntents(): PianoIntentNote[] {
		if (!selected) return [];
		return heldConflictIntents(
			pianoRollConflictStore.forChannel(selected.songIndex, selected.channelIndex)
		);
	}

	function allIntents(): PianoIntentNote[] {
		return [...channelIntents(), ...heldIntents()];
	}

	function hitsOther(start: number, length: number, ignore: PianoNoteSpot | null): boolean {
		return allIntents().some(
			(note) =>
				!(ignore && sameNoteSpot(note, ignore)) &&
				rangesOverlap(start, length, note.startRow, note.length)
		);
	}

	function placedInstrument(): number | null {
		const field = instrumentKey ? chip?.schema.fields[instrumentKey] : undefined;
		if (!chip || !field || !settingsStore.autoEnterInstrument) return null;
		const id = editorStateStore.getCurrentInstrument(chip.schema.chipType);
		if (!id) return null;
		const value = parseSymbol(id, field.length);
		return value > 0 ? value : null;
	}

	function placementLength(span: PianoTimelineSpan, localRow: number): number {
		if (placedBlockLength !== null && placedBlockLength > 0) return placedBlockLength;
		return Math.max(1, span.length - localRow);
	}

	function writeIntentGate(session: PianoPatternSession, note: PianoIntentNote): void {
		const located = timelineSpanAt(timeline, note.startRow);
		const generic = located ? session.generic(located.span.patternId) : null;
		const rows = generic?.channels[session.channelIndex]?.rows;
		if (!noteKey || !located || !generic || !rows) return;
		const patternId = located.span.patternId;
		const { localRow } = located;
		const resize = (end: number) =>
			session.mark(
				patternId,
				resizePitchedNote(generic, session.channelIndex, noteKey, localRow, end)
			);
		if (!note.bounded) {
			resize(rows.length);
			return;
		}
		const end = localRow + note.length;
		if (end >= rows.length) {
			resize(rows.length);
			sealTail(session, note.startRow, note.length, note.release);
			return;
		}
		resize(end);
		const gate = rows[end];
		if (note.release && gate && gate[noteKey] !== RELEASE_NOTE) {
			gate[noteKey] = RELEASE_NOTE;
			session.mark(patternId);
		}
	}

	function commitIntents(
		intents: PianoIntentNote[],
		fresh: PianoNoteSpot | null,
		cursor: PianoEditCursor
	): IntentResult {
		const unchanged: IntentResult = { changed: false, preview: null, previewRow: cursor.row };
		if (playbackStore.isPlaying || undoRedoStore.isApplying || !selected || !noteKey) {
			return unchanged;
		}
		const session = openSession();
		if (!session) return unchanged;
		const { songIndex, channelIndex } = selected;
		const key = noteKey;
		const plan = planPianoIntents(intents, channelIntents());
		const beforeHeld = pianoRollConflictStore.snapshot();
		const afterHeld = replaceChannelConflicts(beforeHeld, songIndex, channelIndex, plan.silent);
		if (
			plan.remove.length === 0 &&
			plan.add.length === 0 &&
			plan.reshape.length === 0 &&
			conflictNotesSignature(beforeHeld) === conflictNotesSignature(afterHeld)
		) {
			return unchanged;
		}
		const target = (note: PianoIntentNote) => {
			const located = timelineSpanAt(timeline, note.startRow);
			const generic = located ? session.generic(located.span.patternId) : null;
			return located && generic ? { ...located, generic } : null;
		};
		for (const note of [...plan.remove].sort((left, right) => right.startRow - left.startRow)) {
			const place = target(note);
			if (!place) continue;
			clearOpenTail(session, place.span, place.localRow);
			session.mark(
				place.span.patternId,
				removePitchedNote(place.generic, channelIndex, key, place.localRow)
			);
		}
		for (const note of plan.reshape) {
			const place = target(note);
			if (!place) continue;
			clearOpenTail(session, place.span, place.localRow);
			if (note.note) {
				session.mark(
					place.span.patternId,
					setNoteValue(place.generic, channelIndex, place.localRow, key, note.note)
				);
			}
			writeIntentGate(session, note);
		}
		for (const note of plan.add) {
			const place = target(note);
			const cell = place?.generic.channels[channelIndex]?.rows[place.localRow];
			if (!place || !cell) continue;
			session.mark(
				place.span.patternId,
				setNoteValue(place.generic, channelIndex, place.localRow, key, note.note)
			);
			if (
				instrumentKey &&
				note.instrument &&
				note.instrument > 0 &&
				cell[instrumentKey] !== note.instrument
			) {
				cell[instrumentKey] = note.instrument;
				session.mark(place.span.patternId);
			}
			writeIntentGate(session, note);
		}
		const freshNote = fresh
			? plan.audible.find((note) => sameNoteSpot(note, fresh))
			: undefined;
		const freshAt = freshNote ? timelineSpanAt(timeline, freshNote.startRow) : null;
		if (freshAt) {
			session.finish(freshAt.span.patternId, (after) =>
				withAutoEnvelope(after, freshAt.localRow)
			);
		}
		const edits = session.edits();
		commitPianoConflictEdits(
			songIndex,
			edits,
			{ before: beforeHeld, after: afterHeld },
			cursor
		);
		const preview = freshAt ? (edits.get(freshAt.span.patternId)?.after ?? null) : null;
		return {
			changed: true,
			preview,
			previewRow: preview && freshAt ? freshAt.localRow : cursor.row
		};
	}

	function landIntents(
		result: IntentResult,
		selection: NoteSelection[],
		focus: PianoTimelineLocation | null,
		scrollIntoView: boolean,
		timedPreview: boolean
	): void {
		land(selection, focus, scrollIntoView);
		if (result.preview) playPreview(result.preview, result.previewRow, timedPreview);
	}

	function placePitched(
		span: PianoTimelineSpan,
		localRow: number,
		pitchIndex: number,
		advance: boolean,
		timedPreview: boolean
	): boolean {
		const source = patternById.get(span.patternId);
		const text = pitchNoteText(pitchIndex);
		if (playbackStore.isPlaying || !source || !selected || !noteKey || !text) return false;
		const length = placementLength(span, localRow);
		const start = span.startRow + localRow;
		const placed = selectionFor(span, localRow, pitchIndex);
		const cursor = { orderIndex: span.orderIndex, row: localRow };
		if (hitsOther(start, length, null)) {
			const fresh: PianoIntentNote = {
				startRow: start,
				length,
				pitchIndex,
				note: text,
				instrument: placedInstrument(),
				release: false,
				bounded: true,
				preferred: false
			};
			const result = commitIntents([...allIntents(), fresh], placed, cursor);
			if (!result.changed) return false;
			placedBlockLength = length;
			landIntents(result, [placed], { span, localRow }, true, timedPreview);
			advanceCursor(advance, start);
			return true;
		}
		const context = editingContext(source, localRow);
		const session = openSession();
		if (!context || !session || !converter) return false;
		const fieldInfo: FieldInfo = {
			fieldKey: noteKey,
			fieldType: 'note',
			isGlobal: false,
			channelIndex: selected.channelIndex,
			charOffset: 0
		};
		const result = PatternNoteInput.applyNoteString(context, fieldInfo, text);
		land([placed], { span, localRow });
		if (!result || result.didChange === false) return false;
		const updated = withAutoEnvelope(result.updatedPattern, localRow);
		const generic = session.adopt(source, converter.toGeneric(updated));
		const rows = generic.channels[selected.channelIndex]?.rows;
		if (rows && placedBlockLength !== null) {
			if (localRow + placedBlockLength < rows.length) {
				session.mark(
					source.id,
					resizePitchedNote(
						generic,
						selected.channelIndex,
						noteKey,
						localRow,
						localRow + placedBlockLength
					)
				);
			} else {
				sealTail(session, start, placedBlockLength, false);
			}
		}
		const blockSpan = rows ? pitchedBlockSpan(rows, noteKey, localRow) : null;
		if (placedBlockLength === null && blockSpan?.bounded) placedBlockLength = blockSpan.length;
		const edits = session.edits();
		const after = edits.get(source.id)?.after ?? updated;
		edits.set(source.id, { before: source, after });
		commitPianoPatternEdits(selected.songIndex, edits, cursor);
		playPreview(after, localRow, timedPreview);
		advanceCursor(advance, start);
		return true;
	}

	function placeGate(span: PianoTimelineSpan, localRow: number, kind: 'off' | 'release'): void {
		const session = editSession();
		const generic = session?.generic(span.patternId);
		if (!session || !generic || !noteKey) return;
		const gate = gateNote(kind === 'release');
		session.mark(
			span.patternId,
			setNoteValue(generic, session.channelIndex, localRow, noteKey, gate)
		);
		if (!commitSession(session, { orderIndex: span.orderIndex, row: localRow })) return;
		focusLocation(span, localRow);
		applySelection([]);
	}

	function clearNote(span: PianoTimelineSpan, localRow: number): void {
		const session = editSession();
		const generic = session?.generic(span.patternId);
		if (!session || !generic || !noteKey) return;
		const value = generic.channels[session.channelIndex]?.rows[localRow]?.[noteKey];
		const kind = noteEventKind(value);
		const cursor = { orderIndex: span.orderIndex, row: localRow };
		if (kind === 'pitched' && heldIntents().length > 0) {
			const pitchIndex = notePitchIndex(value);
			if (pitchIndex !== null) {
				const spot = { startRow: span.startRow + localRow, pitchIndex };
				commitIntents(withoutSpots(allIntents(), [spot]), null, cursor);
				dropSelectionAt(span.orderIndex, localRow);
				return;
			}
		}
		if (kind === 'pitched') {
			clearOpenTail(session, span, localRow);
			session.mark(
				span.patternId,
				removePitchedNote(generic, session.channelIndex, noteKey, localRow)
			);
		} else {
			session.mark(
				span.patternId,
				setNoteValue(generic, session.channelIndex, localRow, noteKey, EMPTY_NOTE)
			);
		}
		if (commitSession(session, cursor)) dropSelectionAt(span.orderIndex, localRow);
	}

	function moveGroupThroughOverlaps(
		group: readonly MoveGroupNote[],
		deltaRow: number,
		deltaPitch: number,
		anchor: NoteSelection,
		scrollIntoView: boolean
	): boolean {
		const all = allIntents();
		const staying = withoutSpots(all, group);
		const moved: PianoIntentNote[] = [];
		for (const item of group) {
			const pitchIndex = item.pitchIndex + deltaPitch;
			const text = pitchNoteText(pitchIndex);
			const source = all.find((note) => sameNoteSpot(note, item));
			if (!text || !source) return false;
			moved.push({
				...source,
				startRow: item.startRow + deltaRow,
				pitchIndex,
				note: text,
				preferred: false
			});
		}
		if (!overlapsAny(moved, staying) && !group.some((item) => blockIsConflict(item)))
			return false;
		const focusSpot = {
			startRow: anchor.startRow + deltaRow,
			pitchIndex: anchor.pitchIndex + deltaPitch
		};
		const focus = timelineSpanAt(timeline, focusSpot.startRow);
		const result = commitIntents([...staying, ...moved], focusSpot, {
			orderIndex: focus?.span.orderIndex ?? anchor.orderIndex,
			row: focus?.localRow ?? 0
		});
		if (result.changed) landIntents(result, selectionsAt(moved), focus, scrollIntoView, true);
		return true;
	}

	function commitSelectionMove(
		group: readonly MoveGroupNote[],
		deltaRow: number,
		deltaPitch: number,
		anchor: NoteSelection,
		scrollIntoView = false
	): void {
		if (
			playbackStore.isPlaying ||
			!selected ||
			!noteKey ||
			(deltaRow === 0 && deltaPitch === 0)
		) {
			return;
		}
		if (moveGroupThroughOverlaps(group, deltaRow, deltaPitch, anchor, scrollIntoView)) return;
		const session = openSession();
		if (!session) return;
		const key = noteKey;
		const channelIndex = session.channelIndex;
		const columns = timelineColumnCount(timeline);
		const moved: Array<{
			source: MoveGroupNote;
			target: PianoTimelineLocation;
			pitchIndex: number;
			note: PianoPasteNote;
		}> = [];
		for (const item of group) {
			const rows = session.rows(item.patternId);
			const captured = rows
				? capturePianoNote(rows, key, item.localStartRow, item.startRow)
				: null;
			const pitchIndex = item.pitchIndex + deltaPitch;
			const text = pitchNoteText(pitchIndex);
			const target = timelineSpanAt(timeline, item.startRow + deltaRow);
			if (!captured || !text || !target) continue;
			session.generic(target.span.patternId);
			const instrument = instrumentKey ? captured.fields[instrumentKey] : undefined;
			const length = Math.max(1, item.length);
			const bounded = item.startRow + length < columns;
			moved.push({
				source: item,
				target,
				pitchIndex,
				note: {
					rowOffset: captured.rowOffset,
					note: text,
					length,
					bounded,
					release: bounded && releaseAt(item.startRow + length),
					fields:
						instrumentKey && typeof instrument === 'number' && instrument > 0
							? { [instrumentKey]: instrument }
							: {},
					localRow: target.localRow
				}
			});
		}
		if (moved.length === 0) return;
		for (const item of group) {
			const span = timelineSpanForOrder(timeline, item.orderIndex);
			if (span && session.generic(item.patternId))
				clearOpenTail(session, span, item.localStartRow);
		}
		const removals = groupBy(
			moved,
			(item) => item.source.patternId,
			(item) => item.source.localStartRow
		);
		for (const [patternId, localRows] of removals) {
			const generic = session.generic(patternId);
			const rows = generic?.channels[channelIndex]?.rows;
			if (!generic || !rows) continue;
			removePitchedNotes(generic, channelIndex, key, localRows);
			if (!instrumentKey) continue;
			for (const localRow of localRows) {
				const cell = rows[localRow];
				const instrument = cell?.[instrumentKey];
				if (cell && typeof instrument === 'number' && instrument > 0)
					cell[instrumentKey] = 0;
			}
		}
		const pastes = groupBy(
			moved,
			(item) => item.target.span.patternId,
			(item) => item.note
		);
		for (const [patternId, notesForPattern] of pastes) {
			const rows = session.rows(patternId);
			if (rows) pastePianoNotes(rows, key, notesForPattern);
		}
		for (const item of moved) {
			session.mark(item.source.patternId);
			session.mark(item.target.span.patternId);
			const { span, localRow } = item.target;
			if (item.note.bounded && localRow + item.note.length >= span.length) {
				sealTail(session, span.startRow + localRow, item.note.length, item.note.release);
			}
		}
		const focus =
			moved.find(
				(item) =>
					item.source.patternId === anchor.patternId &&
					item.source.localStartRow === anchor.localStartRow
			) ?? moved[0];
		if (!focus) return;
		const edits = session.edits();
		commitPianoPatternEdits(selected.songIndex, edits, locationCursor(focus.target));
		land(
			moved.map((item) =>
				selectionFor(item.target.span, item.target.localRow, item.pitchIndex)
			),
			focus.target,
			scrollIntoView
		);
		const after = edits.get(focus.target.span.patternId)?.after;
		if (after) playPreview(after, focus.target.localRow, true);
	}

	function commitMove(
		from: NoteSelection,
		toAbsolute: number,
		pitchIndex: number,
		scrollIntoView = true
	): void {
		const fromSpan = timelineSpanForOrder(timeline, from.orderIndex);
		const dest = timelineSpanAt(timeline, toAbsolute);
		const note = pitchNoteText(pitchIndex);
		if (playbackStore.isPlaying || !fromSpan || !dest || !selected || !noteKey || !note) return;
		const length = draggedBlockLength(from);
		const landing = selectionFor(dest.span, dest.localRow, pitchIndex);
		const cursor = locationCursor(dest);
		const sourceIntent = allIntents().find((item) => sameNoteSpot(item, from));
		if (
			sourceIntent &&
			(blockIsConflict(from) || hitsOther(toAbsolute, sourceIntent.length, from))
		) {
			const next = withoutSpots(allIntents(), [from]);
			next.push({
				...sourceIntent,
				startRow: toAbsolute,
				pitchIndex,
				note,
				preferred: false
			});
			const result = commitIntents(next, landing, cursor);
			if (result.changed) landIntents(result, [landing], dest, scrollIntoView, true);
			return;
		}
		const session = openSession();
		const sourceGeneric = session?.generic(fromSpan.patternId);
		const destGeneric = session?.generic(dest.span.patternId);
		if (!session || !sourceGeneric || !destGeneric) return;
		const release = length === null ? false : releaseAt(from.startRow + length);
		clearOpenTail(session, fromSpan, from.localStartRow);
		const moved = relocatePitchedNote(
			sourceGeneric,
			destGeneric,
			session.channelIndex,
			noteKey,
			instrumentKey,
			from.localStartRow,
			dest.localRow,
			note,
			length
		);
		if (!moved) return;
		session.mark(fromSpan.patternId);
		session.mark(dest.span.patternId);
		sealTail(session, toAbsolute, length, release);
		session.finish(dest.span.patternId, (after) => withAutoEnvelope(after, dest.localRow));
		const edits = session.edits();
		commitPianoPatternEdits(selected.songIndex, edits, cursor);
		land([landing], dest, scrollIntoView);
		const after = edits.get(dest.span.patternId)?.after;
		if (after) playPreview(after, dest.localRow, true);
	}

	function draggedBlockLength(from: NoteSelection): number | null {
		const block = notes.blocks.find(
			(item) =>
				item.orderIndex === from.orderIndex &&
				item.localStartRow === from.localStartRow &&
				item.pitchIndex === from.pitchIndex
		);
		return block ? blockLength(block) : null;
	}

	function commitResize(orderIndex: number, localStart: number, localEnd: number): void {
		const span = timelineSpanForOrder(timeline, orderIndex);
		const session = span ? editSession() : null;
		const generic = span ? session?.generic(span.patternId) : null;
		if (!span || !session || !generic || !noteKey) return;
		const drawn = notes.blocks.find(
			(block) => block.orderIndex === orderIndex && block.localStartRow === localStart
		);
		const release = drawn ? releaseAt(drawn.endRow) : false;
		const target = Math.max(localStart + 1, localEnd);
		const absoluteStart = span.startRow + localStart;
		const resizedLength = Math.max(1, target - localStart);
		const cursor = { orderIndex, row: localStart };
		const existing = allIntents().find(
			(item) =>
				item.startRow === absoluteStart &&
				(drawn ? item.pitchIndex === drawn.pitchIndex : true)
		);
		if (
			existing &&
			(blockIsConflict(existing) || hitsOther(absoluteStart, resizedLength, existing))
		) {
			const next = allIntents().map((item) =>
				sameNoteSpot(item, existing)
					? { ...item, length: resizedLength, bounded: true, release, preferred: false }
					: item
			);
			commitIntents(next, existing, cursor);
			placedBlockLength = resizedLength;
			return;
		}
		const resizeTo = (end: number) =>
			session.mark(
				span.patternId,
				resizePitchedNote(generic, session.channelIndex, noteKey, localStart, end)
			);
		clearOpenTail(session, span, localStart);
		if (target > span.length && span.startRow + target >= timelineColumnCount(timeline)) {
			resizeTo(Math.max(localStart + 1, span.length - 1));
		} else if (target >= span.length) {
			resizeTo(span.length);
			sealTail(session, absoluteStart, target - localStart, release);
		} else {
			resizeTo(target);
		}
		if (commitSession(session, cursor)) placedBlockLength = target - localStart;
	}

	function laneCellAt(location: PianoTimelineLocation): LaneCell {
		return {
			orderIndex: location.span.orderIndex,
			patternId: location.span.patternId,
			localRow: location.localRow
		};
	}

	function setLaneCell(
		session: PianoPatternSession,
		lane: PianoRollLane,
		cell: LaneCell,
		value: PianoFieldValue
	): boolean {
		const generic = session.generic(cell.patternId);
		if (!generic) return false;
		return session.mark(
			cell.patternId,
			setPianoFieldValue(generic, lane, session.channelIndex, cell.localRow, value)
		);
	}

	function writeLaneCell(cell: LaneCell, value: PianoFieldValue): boolean {
		const lane = activeLane;
		const session = editSession();
		if (!lane || !session || !setLaneCell(session, lane, cell, value)) return false;
		return commitSession(session, { orderIndex: cell.orderIndex, row: cell.localRow });
	}

	function commitLaneDraft(rows: Record<number, number>): void {
		const lane = activeLane;
		const session = editSession();
		if (!session || lane?.kind !== 'value') return;
		for (const [rowText, value] of Object.entries(rows)) {
			const located = timelineSpanAt(timeline, Number(rowText));
			if (located) setLaneCell(session, lane, laneCellAt(located), value);
		}
		const first = Object.keys(rows)[0];
		const located = first === undefined ? null : timelineSpanAt(timeline, Number(first));
		commitSession(session, {
			orderIndex: located?.span.orderIndex ?? currentPatternOrderIndex,
			row: located?.localRow ?? selectedRow
		});
	}

	function clearLane(absoluteRow: number): void {
		const located = timelineSpanAt(timeline, absoluteRow);
		if (!located || !activeLane) return;
		const value = activeLane.kind === 'effect' ? null : 0;
		if (writeLaneCell(laneCellAt(located), value))
			focusLocation(located.span, located.localRow);
	}

	function playPreview(source: Pattern, row: number, timed: boolean): void {
		if (playbackStore.isPlaying || !chip || !converter || !selected) return;
		notePreview.play({
			processor: chipProcessors[selected.songIndex],
			songIndex: selected.songIndex,
			pattern: source,
			channelIndex: selected.channelIndex,
			row,
			schema: chip.schema,
			converter,
			previewFullRow: settingsStore.previewFullRow,
			timed
		});
	}

	function locateRow(absoluteRow: number): PianoTimelineLocation | null {
		const gate = notes.gates.find((item) => item.row === absoluteRow);
		const gateSpan = gate ? timelineSpanForOrder(timeline, gate.orderIndex) : null;
		if (gate && gateSpan) return { span: gateSpan, localRow: gate.localRow };
		return timelineSpanAt(timeline, absoluteRow);
	}

	function toggleGateAt(
		row: number,
		located: PianoTimelineLocation,
		kind: 'off' | 'release'
	): void {
		if (notes.gates.some((item) => item.row === row)) clearNote(located.span, located.localRow);
		else placeGate(located.span, located.localRow, kind);
	}

	function eraseBlockAt(point: GridPoint): boolean {
		if (point.inRuler || !noteKey) return false;
		const hit = hitTestNoteContent(point.x, point.y, notes.blocks, metrics);
		if (!hit || hit.type === 'grid' || !isTimelineBlock(hit.block)) return false;
		const block = hit.block;
		const span = timelineSpanForOrder(timeline, block.orderIndex);
		if (!span) return false;
		if (block.conflict) {
			commitIntents(withoutSpots(allIntents(), [block]), null, {
				orderIndex: block.orderIndex,
				row: block.localStartRow
			});
			dropSelectionAt(block.orderIndex, block.localStartRow);
			return true;
		}
		clearNote(span, block.localStartRow);
		return true;
	}

	function onGridContextMenu(event: MouseEvent): void {
		event.preventDefault();
		if (playbackStore.isPlaying) return;
		const point = contentPoint(event);
		if (point) eraseBlockAt(point);
	}

	function onGridMouseDown(event: MouseEvent): void {
		gridCanvas?.focus({ preventScroll: true });
		focusTarget = 'note';
		const point = contentPoint(event);
		if (playbackStore.isPlaying) {
			seekFromRuler(event, point);
			return;
		}
		if (!point || !noteKey) return;
		if (point.inRuler) {
			const row = xToRow(point.x, metrics);
			const located = row === null ? null : locateRow(row);
			if (row === null || !located) return;
			focusLocation(located.span, located.localRow);
			if (event.button === 2) toggleGateAt(row, located, event.shiftKey ? 'release' : 'off');
			return;
		}
		const hit = hitTestNoteContent(point.x, point.y, notes.blocks, metrics);
		if (!hit) return;
		if (event.button === 2) {
			if (eraseBlockAt(point)) {
				trackPointer((move) => {
					if ((move.buttons & 2) === 0) return;
					const next = contentPoint(move);
					if (next) eraseBlockAt(next);
				});
				return;
			}
			const located = hit.type === 'grid' ? locateRow(hit.row) : null;
			if (hit.type === 'grid' && located) toggleGateAt(hit.row, located, 'off');
			return;
		}
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey) {
			event.preventDefault();
			gridCanvas?.focus({ preventScroll: true });
			const block = hit.type !== 'grid' && isTimelineBlock(hit.block) ? hit.block : null;
			startMarquee(point, event.shiftKey, block);
			return;
		}
		if (hit.type === 'grid') {
			placeOnGrid(event, hit.row, hit.pitchIndex);
			return;
		}
		if (!isTimelineBlock(hit.block)) return;
		const block = hit.block;
		const span = timelineSpanForOrder(timeline, block.orderIndex);
		if (!span) return;
		const grabbed = selectionFor(span, block.localStartRow, block.pitchIndex);
		const current = workingSelection();
		const inSelection = current.some((item) => sameNoteSpot(item, grabbed));
		const moveGroup = inSelection && current.length > 1 ? current : [grabbed];
		if (hit.type === 'resize' || moveGroup.length === 1) applySelection([grabbed]);
		focusLocation(span, block.localStartRow, false);
		if (hit.type === 'resize') {
			startResizeDrag(span, block);
			return;
		}
		const pointerRow = xToRow(point.x, metrics);
		const grabOffset = pointerRow === null ? 0 : Math.max(0, pointerRow - block.startRow);
		startMoveDrag(grabbed, moveGroup, grabOffset);
	}

	function seekFromRuler(event: MouseEvent, point: GridPoint | null): void {
		if (event.button !== 0 || !point?.inRuler) return;
		const row = xToRow(point.x, metrics);
		const located = row === null ? null : locateRow(row);
		if (!located) return;
		focusLocation(located.span, located.localRow, false);
		onseekplayback?.(located.span.orderIndex, located.localRow);
	}

	function placeOnGrid(event: MouseEvent, row: number, pitchIndex: number): void {
		const located = locateRow(row);
		if (!located) return;
		if (event.shiftKey) placeGate(located.span, located.localRow, 'release');
		else if (event.altKey) placeGate(located.span, located.localRow, 'off');
		else if (
			placePitched(located.span, located.localRow, pitchIndex, false, true) &&
			selectedBlock
		) {
			startMoveDrag(selectedBlock, [selectedBlock], 0, placedBlockLength ?? 1);
		}
	}

	function startResizeDrag(span: PianoTimelineSpan, block: PianoTimelineBlock): void {
		drag = {
			kind: 'resize',
			orderIndex: span.orderIndex,
			localStart: block.localStartRow,
			startRow: block.startRow,
			pitch: block.pitchIndex,
			instrument: block.instrument,
			gestures: block.gestures,
			endRow: block.endRow,
			originEnd: block.endRow
		};
		trackPointer(
			(move) => {
				if (drag?.kind !== 'resize') return;
				const next = contentPoint(move);
				if (!next) return;
				const maxX = Math.max(0, metrics.columns * metrics.rowWidth - 1);
				const row = xToRow(clamp(next.x, 0, maxX), metrics);
				if (row === null) return;
				const limit = Math.max(drag.startRow + 1, metrics.columns);
				drag = { ...drag, endRow: Math.max(drag.startRow + 1, Math.min(limit, row + 1)) };
			},
			() => {
				if (drag?.kind === 'resize' && drag.endRow !== drag.originEnd) {
					commitResize(
						drag.orderIndex,
						drag.localStart,
						drag.endRow - (drag.startRow - drag.localStart)
					);
				}
				drag = null;
			}
		);
	}

	function moveGroupNote(selection: NoteSelection, fallbackLength = 1): MoveGroupNote {
		const block = findBlock(selection);
		return {
			...selection,
			length: block ? blockLength(block) : Math.max(1, fallbackLength),
			color: block ? resolveNoteColor(block) : null,
			instrument: block?.instrument ?? null,
			gestures: block?.gestures ?? [],
			level: block?.level ?? null
		};
	}

	function startMoveDrag(
		from: NoteSelection,
		selections: NoteSelection[],
		grabOffset: number,
		fallbackLength = 1
	): void {
		const group = selections.map((item) =>
			moveGroupNote(item, sameNoteSpot(item, from) ? fallbackLength : 1)
		);
		drag = {
			kind: 'move',
			from,
			row: from.startRow,
			pitch: from.pitchIndex,
			grabOffset: Math.max(0, grabOffset),
			group
		};
		trackPointer(
			(move) => {
				if (drag?.kind !== 'move') return;
				const next = contentPoint(move);
				if (!next || next.inRuler) return;
				const row = xToRow(next.x, metrics);
				const pitch = yToPitch(next.y, metrics);
				if (row === null || pitch === null) return;
				const clamped = clampSelectionDelta(
					drag.group,
					row - drag.grabOffset - drag.from.startRow,
					pitch - drag.from.pitchIndex,
					metrics.columns,
					metrics.pitchCount
				);
				drag = {
					...drag,
					row: drag.from.startRow + clamped.deltaRow,
					pitch: drag.from.pitchIndex + clamped.deltaPitch
				};
			},
			() => {
				if (drag?.kind === 'move')
					finishMoveDrag(drag.from, drag.group, drag.row, drag.pitch);
				drag = null;
			}
		);
	}

	function finishMoveDrag(
		from: NoteSelection,
		group: MoveGroupNote[],
		row: number,
		pitch: number
	): void {
		const deltaRow = row - from.startRow;
		const deltaPitch = pitch - from.pitchIndex;
		if (deltaRow === 0 && deltaPitch === 0) return;
		blockFades.holdMoved(group);
		if (group.length > 1) commitSelectionMove(group, deltaRow, deltaPitch, from);
		else commitMove(from, row, pitch, false);
	}

	function onGridMouseMove(event: MouseEvent): void {
		if (!gridCanvas || drag) return;
		const point = contentPoint(event);
		if (!point) return;
		if (point.inRuler) {
			gridCanvas.style.cursor = playbackStore.isPlaying ? 'pointer' : 'text';
			return;
		}
		const hit = hitTestNoteContent(point.x, point.y, notes.blocks, metrics);
		gridCanvas.style.cursor =
			hit?.type === 'resize' ? 'ew-resize' : hit?.type === 'block' ? 'grab' : 'crosshair';
	}

	function onLaneMouseDown(event: MouseEvent): void {
		if (playbackStore.isPlaying || !activeLane) return;
		laneCanvas?.focus({ preventScroll: true });
		focusTarget = 'lane';
		const point = lanePoint(event);
		if (!point) return;
		const located = locateRow(point.row);
		if (located) focusLocation(located.span, located.localRow);
		if (event.button === 2) {
			dismissLaneEditor();
			clearLane(point.row);
			return;
		}
		if (laneCodec) {
			event.preventDefault();
			openLaneEditor(point.row);
			return;
		}
		if (event.button !== 0) return;
		const rows: Record<number, number> = {};
		const paint = (move: MouseEvent) => {
			if (!activeLane || activeLane.kind !== 'value') return;
			const next = lanePoint(move);
			if (!next) return;
			rows[next.row] = pianoLaneValueFromRatio(next.ratio, activeLane);
			const painted = locateRow(next.row);
			if (painted) {
				if (currentPatternOrderIndex !== painted.span.orderIndex) {
					currentPatternOrderIndex = painted.span.orderIndex;
				}
				selectedRow = painted.localRow;
			}
			drag = { kind: 'lane', rows: { ...rows } };
		};
		paint(event);
		trackPointer(paint, () => {
			drag = null;
			commitLaneDraft(rows);
		});
	}

	function startMarquee(
		origin: { x: number; y: number },
		additive: boolean,
		hitBlock: PianoTimelineBlock | null
	): void {
		let moved = false;
		let current: ContentRect = { x0: origin.x, y0: origin.y, x1: origin.x, y1: origin.y };
		trackPointer(
			(move) => {
				const next = contentPoint(move);
				if (!next || next.inRuler) return;
				if (Math.abs(next.x - origin.x) + Math.abs(next.y - origin.y) < 4) return;
				moved = true;
				current = { x0: origin.x, y0: origin.y, x1: next.x, y1: next.y };
				marquee = current;
			},
			() => {
				marquee = null;
				if (!moved) {
					const span = hitBlock
						? timelineSpanForOrder(timeline, hitBlock.orderIndex)
						: null;
					if (hitBlock && span) {
						toggleSelected(
							selectionFor(span, hitBlock.localStartRow, hitBlock.pitchIndex)
						);
					} else if (!hitBlock && !additive) {
						applySelection([]);
					}
					return;
				}
				const picked: NoteSelection[] = [];
				for (const block of notes.blocks) {
					if (!blockIntersectsMarquee(block, current, metrics)) continue;
					const span = timelineSpanForOrder(timeline, block.orderIndex);
					if (span)
						picked.push(selectionFor(span, block.localStartRow, block.pitchIndex));
				}
				applySelection(additive ? mergeSelections(workingSelection(), picked) : picked);
			}
		);
	}

	function copySelection(): void {
		if (!selected || !noteKey) return;
		const captured: CapturedPianoNote[] = [];
		for (const target of workingSelection()) {
			const block = findBlock(target);
			if (block?.conflict) {
				captured.push({
					absoluteRow: target.startRow,
					rowOffset: 0,
					note: block.note,
					length: blockLength(block),
					bounded: true,
					release: false,
					fields:
						instrumentKey && block.instrument && block.instrument > 0
							? { [instrumentKey]: block.instrument }
							: {}
				});
				continue;
			}
			const rows = channelRows(target.patternId);
			const note = rows
				? capturePianoNote(rows, noteKey, target.localStartRow, target.startRow)
				: null;
			if (note) captured.push(note);
		}
		const clipboard = clipboardFromCaptures(captured);
		if (clipboard.length > 0) pianoRollClipboard.set(clipboard);
	}

	function removeTargets(targets: NoteSelection[]): boolean {
		const first = targets[0];
		if (playbackStore.isPlaying || !selected || !noteKey || !first) return false;
		if (targets.some((target) => blockIsConflict(target)) || heldIntents().length > 0) {
			return commitIntents(withoutSpots(allIntents(), targets), null, selectionCursor(first))
				.changed;
		}
		const session = openSession();
		if (!session) return false;
		const rowsByPattern = groupBy(
			targets,
			(target) => target.patternId,
			(target) => target.localStartRow
		);
		for (const target of targets) {
			const span = timelineSpanForOrder(timeline, target.orderIndex);
			if (span && rowsByPattern.has(span.patternId)) {
				clearOpenTail(session, span, target.localStartRow);
			}
		}
		for (const [patternId, localRows] of rowsByPattern) {
			const generic = session.generic(patternId);
			if (!generic) continue;
			session.mark(
				patternId,
				removePitchedNotes(generic, session.channelIndex, noteKey, localRows)
			);
		}
		return commitSession(session, selectionCursor(first));
	}

	function cutSelection(): void {
		if (playbackStore.isPlaying) return;
		const targets = workingSelection();
		copySelection();
		if (removeTargets(targets)) applySelection([]);
	}

	function pasteClipboard(): void {
		const clips = pianoRollClipboard.get();
		if (!clips || clips.length === 0 || playbackStore.isPlaying || !selected || !noteKey)
			return;
		const session = openSession();
		if (!session) return;
		const placed: NoteSelection[] = [];
		const incoming: PianoIntentNote[] = [];
		const pastes: Array<{ patternId: number; note: PianoPasteNote }> = [];
		for (const clip of clips) {
			const located = timelineSpanAt(timeline, cursorRow + clip.rowOffset);
			const pitchIndex = notePitchIndex(clip.note);
			if (!located || pitchIndex === null || !patternById.has(located.span.patternId))
				continue;
			pastes.push({
				patternId: located.span.patternId,
				note: { ...clip, localRow: located.localRow }
			});
			placed.push(selectionFor(located.span, located.localRow, pitchIndex));
			const instrument = instrumentKey ? clip.fields[instrumentKey] : undefined;
			incoming.push({
				startRow: located.span.startRow + located.localRow,
				length: clip.bounded
					? Math.max(1, clip.length)
					: Math.max(1, located.span.length - located.localRow),
				pitchIndex,
				note: clip.note,
				instrument: typeof instrument === 'number' && instrument > 0 ? instrument : null,
				release: clip.release,
				bounded: true,
				preferred: false
			});
		}
		const existing = allIntents();
		if (overlapsAny(incoming, existing)) {
			const first = incoming[0];
			const home = first ? timelineSpanAt(timeline, first.startRow) : null;
			if (first && home) {
				commitIntents([...existing, ...incoming], first, locationCursor(home));
				applySelection(placed);
			}
			return;
		}
		const grouped = groupBy(
			pastes,
			(item) => item.patternId,
			(item) => item.note
		);
		for (const [patternId, notesForPattern] of grouped) {
			const rows = session.rows(patternId);
			if (rows) session.mark(patternId, pastePianoNotes(rows, noteKey, notesForPattern));
		}
		const first = placed[0];
		if (first && commitSession(session, selectionCursor(first))) applySelection(placed);
	}

	function handleClipboardShortcut(event: KeyboardEvent): boolean {
		const action = keybindingsStore.getActionForShortcut(ShortcutString.fromEvent(event));
		if (action !== ACTION_COPY && action !== ACTION_CUT && action !== ACTION_PASTE)
			return false;
		event.preventDefault();
		if (action === ACTION_COPY) copySelection();
		else if (action === ACTION_CUT) cutSelection();
		else pasteClipboard();
		return true;
	}

	function onGridKeyDown(event: KeyboardEvent): void {
		if (handleClipboardShortcut(event)) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const action = keybindingsStore.getActionForShortcut(ShortcutString.fromEvent(event));
		if (action === ACTION_TOGGLE_PLAYBACK) {
			event.preventDefault();
			ontoggleplayback?.();
			return;
		}
		if (playbackStore.isPlaying) return;
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			deleteAtCursor();
			return;
		}
		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			event.preventDefault();
			nudge(event.key, event.shiftKey);
			return;
		}
		if (event.repeat || !noteKey) return;
		const cursor = timelineSpanForOrder(timeline, currentPatternOrderIndex);
		const mapped = PatternNoteInput.mapKeyboardCodeToNote(event.code);
		if (!mapped || !cursor) return;
		const pitch = noteToTuningTableIndex(mapped.noteName, mapped.octave);
		if (pitch === null) return;
		event.preventDefault();
		placePitched(cursor, selectedRow, pitch, true, false);
	}

	function deleteAtCursor(): void {
		if (selectedNotes.length > 0) {
			if (removeTargets(selectedNotes)) applySelection([]);
			return;
		}
		const selection = visibleSelection;
		const span = timelineSpanForOrder(
			timeline,
			selection?.orderIndex ?? currentPatternOrderIndex
		);
		if (span) clearNote(span, selection ? selection.localStartRow : selectedRow);
	}

	function clampedMove(selection: NoteSelection, deltaRow: number, deltaPitch: number): void {
		commitMove(
			selection,
			clamp(selection.startRow + deltaRow, 0, metrics.columns - 1),
			clamp(selection.pitchIndex + deltaPitch, 0, PIANO_ROLL_PITCH_COUNT - 1)
		);
	}

	function nudge(key: string, shift: boolean): void {
		const deltaRow = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
		const octave = shift ? 12 : 1;
		const deltaPitch = key === 'ArrowUp' ? octave : key === 'ArrowDown' ? -octave : 0;
		const group = workingSelection();
		if (group.length > 1) {
			const live = group.filter((item) => findBlock(item));
			if (live.length > 1) {
				const moving = live.map((item) => moveGroupNote(item));
				const clamped = clampSelectionDelta(
					moving,
					deltaRow,
					deltaPitch,
					metrics.columns,
					metrics.pitchCount
				);
				const anchor = live.reduce((best, item) =>
					Math.abs(item.startRow - cursorRow) < Math.abs(best.startRow - cursorRow)
						? item
						: best
				);
				commitSelectionMove(moving, clamped.deltaRow, clamped.deltaPitch, anchor, true);
				return;
			}
			const only = live[0];
			if (only) {
				clampedMove(only, deltaRow, deltaPitch);
				return;
			}
		}
		const selection = visibleSelection;
		if (!selection) {
			moveCursorTo(cursorRow + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1));
			return;
		}
		clampedMove(selection, deltaRow, deltaPitch);
	}

	function selectChannel(songIndex: number, channelIndex: number): void {
		editorStateStore.setPianoRollChannel(songIndex, channelIndex);
		applySelection([]);
		gridCanvas?.focus({ preventScroll: true });
	}

	function selectLane(lane: PianoRollLane): void {
		editorStateStore.setPianoRollLaneKey(lane.key);
		focusTarget = 'lane';
		closeLaneMenu();
		dismissLaneEditor();
	}

	function laneEditorLeft(absoluteRow: number): number {
		const x = absoluteRow * rowWidth - scrollX;
		const max = Math.max(
			0,
			(laneViewport?.clientWidth ?? LANE_EDITOR_WIDTH) - LANE_EDITOR_WIDTH
		);
		return clamp(x, 0, max);
	}

	function dismissLaneEditor(): void {
		laneEditor = null;
		releaseLaneEditorListener?.();
		releaseLaneEditorListener = null;
	}

	function commitLaneEditor(editor: LaneEditor): void {
		const codec = laneCodec;
		if (!codec || editor.laneKey !== activeLane?.key) return;
		const text = codec.clamp(editor.text);
		if (text === codec.clamp(editor.original)) return;
		const value = codec.parse(text);
		if (value === undefined || !writeLaneCell(editor, value)) return;
		const formatted = codec.format(value);
		editor.text = formatted;
		editor.original = formatted;
	}

	function openLaneEditor(absoluteRow: number): void {
		const lane = activeLane;
		const codec = laneCodec;
		if (playbackStore.isPlaying || !lane || !codec || !selected) return;
		const current = laneEditor;
		if (current && current.absoluteRow !== absoluteRow) commitLaneEditor(current);
		const located = timelineSpanAt(timeline, absoluteRow);
		const item = located ? patternById.get(located.span.patternId) : undefined;
		if (!located || !item) return;
		const text = codec.format(
			readPianoFieldValue(cachedGeneric(item), lane, selected.channelIndex, located.localRow)
		);
		focusLocation(located.span, located.localRow);
		laneEditor = {
			kind: lane.kind === 'effect' ? 'effect' : 'value',
			laneKey: lane.key,
			absoluteRow,
			...laneCellAt(located),
			text,
			original: text,
			left: laneEditorLeft(absoluteRow)
		};
		releaseLaneEditorListener ??= onPointerDownOutside(
			() => laneEditorRoot,
			() => {
				const editor = laneEditor;
				if (editor) commitLaneEditor(editor);
				dismissLaneEditor();
			}
		);
		void tick().then(() => laneEditorInput?.select());
	}

	function applyEffectFormat(format: string): void {
		const current = laneEditor;
		if (!current) return;
		current.text = effectCommandFromFormat(format);
		commitLaneEditor(current);
		void tick().then(() => laneEditorInput?.select());
	}

	function onLaneEditorInput(event: Event): void {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement) || !laneEditor || !laneCodec) return;
		const next = laneCodec.clamp(input.value);
		if (input.value !== next) {
			const caret = Math.min(input.selectionStart ?? next.length, next.length);
			input.value = next;
			input.setSelectionRange(caret, caret);
		}
		if (laneEditor.text !== next) laneEditor.text = next;
	}

	function onLaneEditorKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			dismissLaneEditor();
			return;
		}
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const current = laneEditor;
		if (!current) return;
		commitLaneEditor(current);
		const nextRow = current.absoluteRow + 1;
		if (timelineSpanAt(timeline, nextRow)) openLaneEditor(nextRow);
		else dismissLaneEditor();
	}

	function onLaneKeyDown(event: KeyboardEvent): void {
		if (handleClipboardShortcut(event)) return;
		if (
			!laneShowsNote(activeLane, editorStateStore.envelopeAsNote) ||
			playbackStore.isPlaying ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			event.repeat ||
			!selected
		) {
			return;
		}
		const mapped = PatternNoteInput.mapKeyboardCodeToNote(event.code);
		if (!mapped || tuningTable.length === 0) return;
		const pitch = noteToTuningTableIndex(mapped.noteName, mapped.octave);
		const located = timelineSpanAt(timeline, cursorRow);
		if (pitch === null || !located) return;
		event.preventDefault();
		dismissLaneEditor();
		writeLaneCell(laneCellAt(located), noteToEnvelopePeriod(pitch, tuningTable));
	}

	function closeLaneMenu(): void {
		laneMenuOpen = false;
		releaseLaneMenuListener?.();
		releaseLaneMenuListener = null;
	}

	function toggleLaneMenu(): void {
		if (laneMenuOpen) {
			closeLaneMenu();
			return;
		}
		laneMenuOpen = true;
		releaseLaneMenuListener = onPointerDownOutside(() => laneMenuRoot, closeLaneMenu);
	}

	function laneLabel(lane: PianoRollLane | null): string {
		if (!lane) return '';
		return lane.isGlobal ? `Chip · ${lane.label}` : lane.label;
	}
</script>

{#snippet zoomControl(label: string, zoom: (step: number) => void)}
	<span>{label}</span>
	<button
		type="button"
		class="cursor-pointer rounded-sm border border-[var(--color-app-border)] px-1"
		onclick={() => zoom(-2)}>−</button>
	<button
		type="button"
		class="cursor-pointer rounded-sm border border-[var(--color-app-border)] px-1"
		onclick={() => zoom(2)}>+</button>
{/snippet}

<div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden overscroll-x-none">
	<div
		class="flex shrink-0 items-center gap-3 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] py-1 pr-10"
		style:padding-left="calc(var(--view-switch-width, 0px) + 0.25rem)">
		<div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
			{#each groups as group (group.songIndex)}
				<div class="flex items-center gap-1">
					<span
						class="max-w-36 truncate text-[10px] text-[var(--color-app-text-tertiary)]"
						title={group.chipName}>
						{group.chipName} ({group.songIndex + 1})
					</span>
					{#each group.channels as channel (channel.channelIndex)}
						<button
							type="button"
							class="cursor-pointer rounded-sm border px-1.5 py-0.5 font-mono text-[11px] {selected?.songIndex ===
								channel.songIndex && selected?.channelIndex === channel.channelIndex
								? 'border-[var(--color-app-primary)] bg-[var(--color-app-surface-active)] text-[var(--color-app-text-primary)]'
								: 'border-[var(--color-app-border)] text-[var(--color-app-text-secondary)] hover:bg-[var(--color-app-surface-hover)]'}"
							onclick={() => selectChannel(channel.songIndex, channel.channelIndex)}>
							{channel.label}
						</button>
					{/each}
				</div>
			{/each}
		</div>
		<div
			class="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-app-text-tertiary)]">
			{@render zoomControl('Time', zoomTime)}
			{@render zoomControl('Pitch', zoomPitch)}
		</div>
	</div>
	{#if timeline.length === 0}
		<div
			class="flex flex-1 items-center justify-center text-xs text-[var(--color-app-text-tertiary)]">
			This order step has no pattern yet.
		</div>
	{:else if !noteKey}
		<div
			class="flex flex-1 items-center justify-center text-xs text-[var(--color-app-text-tertiary)]">
			This chip has no note column. Use the lane to edit the other fields.
		</div>
	{:else}
		<div class="flex min-h-0 flex-1">
			<div
				class="flex shrink-0 flex-col border-r border-[var(--color-app-border)]"
				style:width="{KEYBOARD_WIDTH}px">
				<div
					class="shrink-0 border-b border-[var(--color-app-border)]"
					style:height="{RULER_HEIGHT}px">
				</div>
				<div class="min-h-0 flex-1 overflow-hidden" bind:this={keyboardViewport}>
					<canvas bind:this={keyboardCanvas} class="block"></canvas>
				</div>
			</div>
			<div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
				<div
					class="absolute inset-0 overflow-auto overscroll-x-none"
					bind:this={gridScroller}
					onscroll={onGridScroll}>
					<div
						class="pointer-events-none"
						style:width="{content.width}px"
						style:height="{content.height + RULER_HEIGHT}px">
					</div>
				</div>
				<canvas
					bind:this={gridCanvas}
					tabindex="0"
					aria-label="Piano roll"
					class="absolute top-0 left-0 z-10 block outline-none"
					style:width="{gridWidth}px"
					style:height="{gridHeight}px"
					onmousedown={onGridMouseDown}
					onmousemove={onGridMouseMove}
					onkeydown={onGridKeyDown}
					onkeyup={() => notePreview.stop()}
					oncontextmenu={onGridContextMenu}>
				</canvas>
			</div>
		</div>
	{/if}
	<div
		class="relative z-20 flex shrink-0 border-t border-[var(--color-app-border)]"
		style:height="{LANE_HEIGHT}px">
		{#if laneEditor?.kind === 'effect'}
			<div
				bind:this={laneEditorRoot}
				class="absolute z-40 mb-1 flex max-h-64 w-44 flex-col overflow-hidden rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] shadow-lg"
				style:left="{KEYBOARD_WIDTH + laneEditor.left}px"
				style:bottom="100%">
				{#key laneEditor.absoluteRow}
					<div
						class="relative m-1 w-fit rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-bg)]">
						<div
							class="pointer-events-none flex px-1.5 py-1 font-mono text-[13px] leading-none"
							aria-hidden="true">
							{#each effectEditorGlyphs as glyph, index (index)}
								<span
									class="inline-block w-[1ch] text-center"
									style:color={glyph.color}>{glyph.char}</span>
							{/each}
						</div>
						<input
							bind:this={laneEditorInput}
							bind:value={laneEditor.text}
							maxlength={laneCodec?.maxLength}
							class="absolute inset-0 w-full bg-transparent px-1.5 py-1 font-mono text-[13px] leading-none text-transparent uppercase caret-[var(--color-app-text-primary)] outline-none"
							aria-label="Effect command"
							spellcheck="false"
							autocomplete="off"
							oninput={onLaneEditorInput}
							onkeydown={onLaneEditorKeydown} />
					</div>
				{/key}
				<div class="min-h-0 overflow-auto py-1">
					{#each effectHints as hint (`${hint.format}:${hint.name}`)}
						{@const command = effectCommandFromFormat(hint.format)}
						{@const commandColors = getEffectFormatCharColors(command)}
						<button
							type="button"
							class="flex w-full cursor-pointer items-baseline gap-2 px-2 py-1 text-left hover:bg-[var(--color-app-surface-hover)]"
							onmousedown={(event) => event.preventDefault()}
							onclick={() => applyEffectFormat(hint.format)}>
							<span
								class="min-w-0 flex-1 truncate text-[11px] text-[var(--color-app-text-primary)]">
								{hint.name}
							</span>
							<span class="font-mono text-[10px]">
								{#each [...command] as char, index (index)}
									<span style:color={commandColors[index]}>{char}</span>
								{/each}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{:else if laneEditor}
			<div
				bind:this={laneEditorRoot}
				class="absolute z-40 mb-1 rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] p-1 shadow-lg"
				style:left="{KEYBOARD_WIDTH + laneEditor.left}px"
				style:bottom="100%">
				<input
					bind:this={laneEditorInput}
					bind:value={laneEditor.text}
					maxlength={laneCodec?.maxLength}
					class="rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-bg)] px-1.5 py-1 text-center font-mono text-[13px] uppercase outline-none {(laneCodec?.maxLength ??
						2) <= 1
						? 'w-8'
						: 'w-12'}"
					style:color={typedLaneColor}
					aria-label={activeLane?.label ?? 'Value'}
					spellcheck="false"
					autocomplete="off"
					oninput={onLaneEditorInput}
					onkeydown={onLaneEditorKeydown} />
			</div>
		{/if}
		<div
			class="relative flex shrink-0 flex-col border-r border-[var(--color-app-border)] bg-[var(--color-app-surface)]"
			style:width="{KEYBOARD_WIDTH}px"
			bind:this={laneMenuRoot}>
			<button
				type="button"
				class="flex w-full cursor-pointer items-center gap-1 px-1.5 py-1 text-left text-[11px] text-[var(--color-app-text-secondary)] hover:bg-[var(--color-app-surface-hover)]"
				aria-label="Lane"
				aria-expanded={laneMenuOpen}
				onclick={toggleLaneMenu}>
				<span class="min-w-0 flex-1 truncate">Lane</span>
				<span
					class="inline-block h-0 w-0 shrink-0 border-y-[3px] border-l-[4px] border-y-transparent border-l-current"
				></span>
			</button>
			<span class="truncate px-1.5 text-[11px] text-[var(--color-app-text-muted)]">
				{laneLabel(activeLane)}
			</span>
			{#if laneMenuOpen}
				<div
					class="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-44 overflow-auto rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] py-1 shadow-lg">
					{#each lanes as lane (lane.key)}
						<button
							type="button"
							class="block w-full cursor-pointer px-2 py-1 text-left text-[11px] {lane.key ===
							activeLane?.key
								? 'bg-[var(--color-app-surface-active)] text-[var(--color-app-text-primary)]'
								: 'text-[var(--color-app-text-secondary)] hover:bg-[var(--color-app-surface-hover)]'}"
							onclick={() => selectLane(lane)}>
							{laneLabel(lane)}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="relative min-w-0 flex-1 overflow-hidden" bind:this={laneViewport}>
			<canvas
				bind:this={laneCanvas}
				tabindex="0"
				aria-label={activeLane?.label ?? 'Event lane'}
				class="block outline-none {laneCodec ? 'cursor-text' : ''}"
				onmousedown={onLaneMouseDown}
				onkeydown={onLaneKeyDown}
				oncontextmenu={(event) => event.preventDefault()}>
			</canvas>
		</div>
	</div>
</div>
