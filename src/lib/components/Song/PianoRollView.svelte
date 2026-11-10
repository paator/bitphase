<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { CSS_VAR_MAP, type ThemeColorKey } from '../../config/theme-colors';
	import type { ChipProcessor, PreviewNoteSupport } from '../../chips/base/processor';
	import type { AudioService } from '../../services/audio/audio-service';
	import { PreviewService } from '../../services/audio/preview-service';
	import { AutoEnvService } from '../../services/pattern/auto-env-service';
	import type { EditingContext, FieldInfo } from '../../services/pattern/editing/editing-context';
	import { PatternNoteInput } from '../../services/pattern/editing/pattern-note-input';
	import { PatternService } from '../../services/pattern/pattern-service';
	import {
		amplitudeFields,
		buildPianoTimeline,
		carryAmplitude,
		carryOrnament,
		clearSpilledNoteGate,
		collectPianoNotes,
		continueOpenNoteBlocks,
		findNoteFieldKey,
		listPianoRollChannels,
		listPianoRollLanes,
		movePitchedNote,
		noteEventKind,
		pitchedBlockSpan,
		PIANO_ROLL_PITCH_COUNT,
		relocatePitchedNote,
		removePitchedNote,
		removePitchedNotes,
		pianoLaneValueFromRatio,
		readPianoFieldValue,
		resizePitchedNote,
		setNoteValue,
		setPianoFieldValue,
		shiftPianoNotes,
		timelineColumnCount,
		timelineSpanAt,
		timelineWindow,
		writeSpilledNoteTail,
		type PianoNoteBlock,
		type PianoRollLane,
		type PianoTimelineBlock,
		type PianoTimelineSpan
	} from '../../services/piano-roll/piano-roll-model';
	import { pianoEffectGestureFor, type PianoEffectGesture } from '../../chips/base/piano-effect-gesture';
	import { listPatternEffectStatusHints } from '../../chips/base/effect-status';
	import { getEffectFormatCharColors } from '../../chips/base/effect-format-color';
	import {
		clampPianoEffectInput,
		effectCommandFromFormat,
		formatPianoEffectInput,
		pianoEffectInputValue
	} from '../../services/piano-roll/piano-effect-input';
	import {
		clampPianoSymbolInput,
		laneValueIsTyped,
		pianoSymbolInputValue
	} from '../../services/piano-roll/piano-symbol-input';
	import {
		clampPianoHexInput,
		clampPianoNoteInput,
		formatPianoTypedLabel,
		laneShowsNote,
		pianoHexInputValue,
		pianoNoteInputPeriod
	} from '../../services/piano-roll/piano-hex-input';
	import { noteToEnvelopePeriod } from '../../utils/envelope-note-conversion';
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
		drawPianoGrid,
		drawPianoKeyboard,
		drawPianoLane
	} from '../../ui-rendering/piano-roll-renderer';
	import {
		instrumentColorsById,
		patternRowInstrumentId
	} from '../../ui-rendering/instrument-pattern-colors';
	import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
	import { rangesOverlap, silencedIndexes } from '../../services/piano-roll/piano-roll-conflicts';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { playbackStore } from '../../stores/playback.svelte';
	import {
		pianoRollConflictStore,
		type PianoConflictNote
	} from '../../stores/piano-roll-conflicts.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import { undoRedoStore } from '../../stores/undo-redo.svelte';
	import { autoEnvStore } from '../../stores/auto-env.svelte';
	import { settingsStore } from '../../stores/settings.svelte';
	import { themeService } from '../../services/theme/theme-service';
	import { midiService } from '../../services/midi/midi-service';
	import { getColors } from '../../utils/colors';
	import { parseSymbol } from '../../chips/base/field-formatters';
	import {
		formatNoteFromEnum,
		midiNoteToNoteNameAndOctave,
		noteToTuningTableIndex,
		parseNoteFromString,
		tuningTableIndexToNote
	} from '../../utils/note-utils';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
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
	const WINDOW_OVERSCAN_ROWS = 48;
	const genericCache = new WeakMap<Pattern, GenericPattern>();
	const patternTokens = new WeakMap<Pattern, number>();
	let patternTokenSeq = 1;

	interface IntentNote {
		startRow: number;
		length: number;
		pitchIndex: number;
		note: string;
		instrument: number | null;
		release: boolean;
		bounded: boolean;
		preferred: boolean;
	}

	interface NoteSelection {
		orderIndex: number;
		patternId: number;
		localStartRow: number;
		startRow: number;
		pitchIndex: number;
	}

	interface MoveGroupNote extends NoteSelection {
		length: number;
		color: string | null;
		instrument: number | null;
		gestures: PianoEffectGesture[];
		level: number | null;
	}
	const services: { audioService: AudioService } = getContext('container');
	const previewService = new PreviewService();

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
				fromOrder: number;
				fromPatternId: number;
				fromLocal: number;
				fromRow: number;
				fromPitch: number;
				row: number;
				pitch: number;
				length: number;
				grabOffset: number;
				color: string | null;
				instrument: number | null;
				gestures: PianoEffectGesture[];
				group: MoveGroupNote[];
		  }
		| {
				kind: 'resize';
				orderIndex: number;
				patternId: number;
				localStart: number;
				startRow: number;
				pitch: number;
				instrument: number | null;
				gestures: PianoEffectGesture[];
				endRow: number;
				originEnd: number;
				spanEnd: number;
		  }
		| { kind: 'lane'; rows: Record<number, number> }
		| null
	>(null);
	let scrollFrame = 0;
	let blockFadeFrame = 0;
	let blockFadeNow = $state(0);
	let blockFadeScope = '';
	let blockFadeKeys = new Set<string>();
	const blockFadePatterns = new Set<number>();
	const blockFadeLive = new Map<string, PianoTimelineBlock>();
	const blockFades = new Map<string, { block: PianoTimelineBlock; mode: 'in' | 'out'; started: number }>();
	const blockFadeHold = new Set<string>();
	let blockFadeSkipIn = false;
	let followedOrder = -1;
	let seenOrderListPick = 0;
	let lockOrderSync = false;
	let viewCache: {
		key: string;
		blocks: PianoTimelineBlock[];
		gates: ReturnType<typeof shiftPianoNotes>['gates'];
		valueOrigin: number;
		laneValues: unknown[];
		patternIds: number[];
	} | null = null;

	let gridScroller = $state<HTMLDivElement | null>(null);
	let keyboardViewport = $state<HTMLDivElement | null>(null);
	let laneViewport = $state<HTMLDivElement | null>(null);
	let gridCanvas = $state<HTMLCanvasElement | null>(null);
	let keyboardCanvas = $state<HTMLCanvasElement | null>(null);
	let laneCanvas = $state<HTMLCanvasElement | null>(null);
	let removeDragListeners: (() => void) | null = null;
	let previewChannel: number | null = null;
	let previewTimer: number | null = null;
	let laneMenuOpen = $state(false);
	let laneMenuRoot: HTMLDivElement | null = null;
	let closeLaneMenuListener: (() => void) | null = null;
	let effectEditor = $state<{
		absoluteRow: number;
		orderIndex: number;
		patternId: number;
		localRow: number;
		text: string;
		original: string;
		left: number;
	} | null>(null);
	let effectEditorRoot = $state<HTMLDivElement | null>(null);
	let effectInput = $state<HTMLInputElement | null>(null);
	let effectEditorListener: (() => void) | null = null;
	let valueEditor = $state<{
		absoluteRow: number;
		orderIndex: number;
		patternId: number;
		localRow: number;
		text: string;
		original: string;
		left: number;
	} | null>(null);
	let valueEditorRoot = $state<HTMLDivElement | null>(null);
	let valueInput = $state<HTMLInputElement | null>(null);
	let valueEditorListener: (() => void) | null = null;
	let centered = false;

	const channels = $derived(
		listPianoRollChannels(
			projectStore.songs,
			chipProcessors.map((processor) => processor.chip)
		)
	);
	const groups = $derived.by(() => {
		const grouped: Array<{
			songIndex: number;
			chipName: string;
			channels: typeof channels;
		}> = [];
		for (const channel of channels) {
			const group = grouped.find((item) => item.songIndex === channel.songIndex);
			if (group) group.channels.push(channel);
			else
				grouped.push({
					songIndex: channel.songIndex,
					chipName: channel.chipName,
					channels: [channel]
				});
		}
		return grouped;
	});
	const selected = $derived(
		channels.find(
			(channel) =>
				channel.songIndex === editorStateStore.pianoRollSongIndex &&
				channel.channelIndex === editorStateStore.pianoRollChannelIndex
		) ??
			channels[0] ??
			null
	);
	const chip = $derived(
		selected ? (chipProcessors[selected.songIndex]?.chip ?? null) : null
	);
	const converter = $derived(chip ? chip.createConverter() : null);
	const noteKey = $derived(chip ? findNoteFieldKey(chip.schema) : null);
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
		buildPianoTimeline(projectStore.patternOrder, (patternId) => patternById.get(patternId)?.length)
	);
	const pattern = $derived.by(() => {
		const span = timeline.find((item) => item.orderIndex === currentPatternOrderIndex);
		if (!span) return null;
		return patternById.get(span.patternId) ?? null;
	});
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
	const effectEditorGlyphs = $derived.by(() => {
		const text = clampPianoEffectInput(effectEditor?.text ?? '');
		const shown = (text + '....').slice(0, 4);
		const colors = getEffectFormatCharColors(shown);
		return [...shown].map((char, index) => ({
			char,
			color: colors[index] ?? 'var(--color-app-text-muted)'
		}));
	});
	const activeLane = $derived(
		lanes.find((lane) => lane.key === editorStateStore.pianoRollLaneKey) ??
			lanes.find((lane) => lane.kind === 'value') ??
			lanes[0] ??
			null
	);
	const typedInputMaxLength = $derived(
		laneShowsNote(activeLane, editorStateStore.envelopeAsNote) ? 3 : (activeLane?.length ?? 2)
	);
	const typedLaneColor = $derived.by(() => {
		const key = activeLane?.color;
		if (key && key in CSS_VAR_MAP) return `var(${CSS_VAR_MAP[key as ThemeColorKey]})`;
		return 'var(--color-app-text-primary)';
	});
	const timelineView = $derived.by(() => {
		const empty = {
			key: '',
			blocks: [] as PianoTimelineBlock[],
			gates: [] as ReturnType<typeof shiftPianoNotes>['gates'],
			valueOrigin: 0,
			laneValues: [] as unknown[],
			patternIds: [] as number[]
		};
		if (!selected || !converter || !noteKey || timeline.length === 0) {
			viewCache = empty;
			return empty;
		}
		const step = WINDOW_OVERSCAN_ROWS;
		const origin = Math.max(0, scrollBucket * step - step);
		const extent = (scrollBucket + 2) * step + Math.ceil(Math.max(gridWidth, rowWidth) / rowWidth);
		const windowSpans = timelineWindow(timeline, origin, extent);
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
		key += `conflicts.${pianoRollConflictStore.revision}`;
		if (viewCache && viewCache.key === key) return viewCache;
		const blocks: PianoTimelineBlock[] = [];
		const gates: ReturnType<typeof shiftPianoNotes>['gates'] = [];
		const valueOrigin = windowSpans[0]?.startRow ?? 0;
		const tail = windowSpans[windowSpans.length - 1];
		const laneValues = new Array<unknown>(tail ? tail.startRow + tail.length - valueOrigin : 0);
		const seen = new Map<number, GenericPattern>();
		const amplitudes = chip ? amplitudeFields(chip.schema) : [];
		const amplitudeCarry = new Map<string, number>();
		const ornamentCarry = { id: null as number | null };
		const hasTable = Boolean(chip?.schema.fields.table);
		const ornamentLookup = (id: number) => {
			const table = projectStore.tables.find((item) => item.id === id);
			return table ? { rows: table.rows, additive: table.additive } : null;
		};
		const windowStart = windowSpans[0]?.orderIndex ?? Number.POSITIVE_INFINITY;
		if (amplitudes.length > 0 || hasTable) {
			for (const span of timeline) {
				if (span.orderIndex >= windowStart) break;
				const item = patternById.get(span.patternId);
				if (!item) continue;
				let generic = seen.get(item.id);
				if (!generic) {
					generic = cachedGeneric(item);
					seen.set(item.id, generic);
				}
				const earlierRows = generic.channels[selected.channelIndex]?.rows ?? [];
				if (amplitudes.length > 0) carryAmplitude(earlierRows, amplitudes, amplitudeCarry);
				if (hasTable) carryOrnament(earlierRows, ornamentCarry);
			}
		}
		for (const span of windowSpans) {
			const item = patternById.get(span.patternId);
			if (!item) continue;
			let generic = seen.get(item.id);
			if (!generic) {
				generic = cachedGeneric(item);
				seen.set(item.id, generic);
			}
			const shifted = shiftPianoNotes(
				collectPianoNotes(
					generic.channels[selected.channelIndex]?.rows ?? [],
					noteKey,
					(effect) => pianoEffectGestureFor(effect, chip),
					amplitudes,
					amplitudeCarry,
					hasTable ? { lookup: ornamentLookup, carry: ornamentCarry } : undefined
				),
				span
			);
			blocks.push(...shifted.blocks);
			gates.push(...shifted.gates);
			if (!activeLane) continue;
			for (let localRow = 0; localRow < span.length; localRow++) {
				laneValues[span.startRow - valueOrigin + localRow] = readPianoFieldValue(
					generic,
					activeLane,
					selected.channelIndex,
					localRow
				);
			}
		}
		continueOpenNoteBlocks(blocks, timeline, noteKey, (later) => {
			const laterItem = patternById.get(later.patternId);
			if (!laterItem) return undefined;
			let laterGeneric = seen.get(laterItem.id);
			if (!laterGeneric) {
				laterGeneric = cachedGeneric(laterItem);
				seen.set(laterItem.id, laterGeneric);
			}
			return laterGeneric.channels[selected.channelIndex]?.rows;
		});
		const visibleStart = windowSpans[0]?.startRow ?? 0;
		const visibleEnd = tail ? tail.startRow + tail.length : 0;
		for (const conflict of pianoRollConflictStore.forChannel(
			selected.songIndex,
			selected.channelIndex
		)) {
			if (conflict.startRow + conflict.length <= visibleStart || conflict.startRow >= visibleEnd) continue;
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
		viewCache = {
			key,
			blocks,
			gates,
			valueOrigin,
			laneValues,
			patternIds: windowSpans.map((span) => span.patternId)
		};
		return viewCache;
	});
	const notes = $derived(timelineView);
	const metrics = $derived<PianoRollMetrics>({
		rowWidth,
		keyHeight,
		columns: Math.max(1, timelineColumnCount(timeline)),
		pitchCount: noteKey ? PIANO_ROLL_PITCH_COUNT : 1
	});
	const content = $derived(noteContentSize(metrics));
	const cursorRow = $derived.by(() => {
		const span = timeline.find((item) => item.orderIndex === currentPatternOrderIndex);
		if (!span) return 0;
		return span.startRow + Math.min(Math.max(0, selectedRow), Math.max(0, span.length - 1));
	});
	const instrumentColorMap = $derived(
		instrumentColorsById(filterInstrumentsForChip(projectStore.instruments, chip?.type ?? ''))
	);
	const hiddenBlock = $derived.by(() => {
		if (drag?.kind !== 'resize') return null;
		return { startRow: drag.startRow, pitchIndex: drag.pitch };
	});
	const hiddenBlocks = $derived.by(() => {
		if (drag?.kind !== 'move') return [];
		return drag.group.map((item) => ({ startRow: item.startRow, pitchIndex: item.pitchIndex }));
	});
	const preview = $derived.by(() => {
		if (drag?.kind !== 'resize') return null;
		const startRow = drag.startRow;
		const pitch = drag.pitch;
		const source = notes.blocks.find(
			(block) => block.startRow === startRow && block.pitchIndex === pitch
		);
		return {
			startRow: drag.startRow,
			endRow: drag.endRow,
			pitchIndex: drag.pitch,
			color: null,
			instrument: drag.instrument,
			gestures: drag.gestures,
			level: source?.level
		};
	});
	const movePreviews = $derived.by(() => {
		if (drag?.kind !== 'move') return [];
		const deltaRow = drag.row - drag.fromRow;
		const deltaPitch = drag.pitch - drag.fromPitch;
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
		const span = timeline.find((item) => item.orderIndex === current.orderIndex);
		if (!span || span.patternId !== current.patternId || !converter || !noteKey || !selected) {
			return null;
		}
		const item = patternById.get(span.patternId);
		if (!item) return null;
		const value = cachedGeneric(item).channels[selected.channelIndex]?.rows[current.localStartRow]?.[
			noteKey
		];
		if (noteEventKind(value) !== 'pitched') return null;
		const startRow = span.startRow + current.localStartRow;
		if (current.startRow === startRow) return current;
		return { ...current, startRow };
	});

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
				if (event.altKey) keyHeight = clamp(keyHeight + (event.deltaY < 0 ? 1 : -1), 8, 28);
				else rowWidth = clamp(rowWidth + (event.deltaY < 0 ? 1 : -1), 8, 40);
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
		const span = timeline.find((item) => item.orderIndex === index);
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
				stopPreview();
				return;
			}
			const parsed = midiNoteToNoteNameAndOctave(midiNote);
			if (!parsed) return;
			const pitch = noteToTuningTableIndex(parsed.noteName, parsed.octave);
			if (pitch === null) return;
			const span = spanForOrder(currentPatternOrderIndex);
			if (span) placePitched(span, selectedRow, pitch, true, false);
		});
	});

	$effect(() => {
		rowWidth;
		noteScrollBucket(scrollX);
	});

	$effect(() => {
		syncBlockFades(
			notes.blocks,
			notes.patternIds,
			`${selected?.songIndex ?? ''}:${selected?.channelIndex ?? ''}:${noteKey ?? ''}`
		);
	});

	$effect(() => {
		colorVersion;
		scrollY;
		keyboardHeight;
		keyHeight;
		metrics.pitchCount;
		if (!keyboardCanvas || keyboardHeight <= 0) return;
		const keyCtx = prepareCanvas(keyboardCanvas, KEYBOARD_WIDTH, keyboardHeight);
		if (!keyCtx) return;
		drawPianoKeyboard(keyCtx, {
			colors: rollColors(),
			width: KEYBOARD_WIDTH,
			height: keyboardHeight,
			scrollY,
			metrics
		});
	});

	$effect(() => {
		scrollX;
		scrollY;
		gridWidth;
		gridHeight;
		notes;
		metrics;
		cursorRow;
		currentPatternOrderIndex;
		timeline;
		visibleSelection;
		preview;
		movePreviews;
		hiddenBlock;
		hiddenBlocks;
		instrumentColorMap;
		blockFadeNow;
		if (!gridCanvas || gridWidth <= 0 || gridHeight <= 0) return;
		const gridCtx = prepareCanvas(gridCanvas, gridWidth, gridHeight);
		if (!gridCtx) return;
		drawPianoGrid(gridCtx, {
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
			selectedBlock: visibleSelection,
			selectedNotes,
			marquee,
			hiddenBlock,
			hiddenBlocks,
			preview,
			previews: movePreviews,
			leavingBlocks: leavingBlockFades(),
			presenceFor: blockPresence,
			resolveColor: resolveNoteColor
		});
	});

	$effect(() => {
		scrollX;
		laneWidth;
		notes;
		metrics;
		cursorRow;
		laneDraft;
		activeLane;
		timeline;
		const envelopeAsNote = editorStateStore.envelopeAsNote;
		const tuningTable = projectStore.songs[selected?.songIndex ?? -1]?.tuningTable;
		if (!laneCanvas || !activeLane || laneWidth <= 0) return;
		const laneHeight = Math.max(1, laneViewport?.clientHeight ?? LANE_HEIGHT);
		const laneCtx = prepareCanvas(laneCanvas, laneWidth, laneHeight);
		if (!laneCtx) return;
		drawPianoLane(laneCtx, {
			colors: rollColors(),
			width: laneWidth,
			height: laneHeight,
			scrollX,
			metrics,
			lane: activeLane,
			values: notes.laneValues,
			valueOrigin: notes.valueOrigin,
			spans: timeline,
			draft: laneDraft,
			cursorRow,
			envelopeAsNote,
			tuningTable
		});
	});

	$effect(() => {
		selected?.songIndex;
		selected?.channelIndex;
		activeLane?.key;
		playbackStore.isPlaying;
		editorStateStore.envelopeAsNote;
		return () => {
			dismissEffectEditor();
			dismissValueEditor();
		};
	});

	$effect(() => () => {
		removeDragListeners?.();
		stopPreview();
		if (scrollFrame) cancelAnimationFrame(scrollFrame);
		if (blockFadeFrame) cancelAnimationFrame(blockFadeFrame);
		closeLaneMenuListener?.();
		effectEditorListener?.();
		valueEditorListener?.();
	});

	let rollPalette = getColors();
	let rollPaletteVersion = -1;

	function noteScrollBucket(left: number): void {
		const next = Math.floor(left / (WINDOW_OVERSCAN_ROWS * Math.max(1, rowWidth)));
		if (next !== scrollBucket) scrollBucket = next;
	}

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

	const BLOCK_FADE_MS = 160;

	function blockFadeKey(block: PianoTimelineBlock): string {
		return `${block.orderIndex}:${block.patternId}:${block.localStartRow}:${block.pitchIndex}`;
	}

	function blockFadePresence(started: number): number {
		const t = Math.min(1, Math.max(0, (blockFadeNow - started) / BLOCK_FADE_MS));
		return 1 - (1 - t) ** 3;
	}

	function syncBlockFades(blocks: PianoTimelineBlock[], patternIds: number[], scope: string): void {
		const now = performance.now();
		if (scope !== blockFadeScope) {
			blockFadeScope = scope;
			blockFadePatterns.clear();
			blockFadeLive.clear();
			blockFadeKeys = new Set();
			blockFades.clear();
			blockFadeHold.clear();
			blockFadeSkipIn = false;
		}
		const inWindow = new Set(patternIds);
		const fresh = new Set<number>();
		for (const id of inWindow) {
			if (!blockFadePatterns.has(id)) fresh.add(id);
		}
		for (const [key, block] of blockFadeLive) {
			if (!inWindow.has(block.patternId)) {
				blockFadeLive.delete(key);
				blockFades.delete(key);
			}
		}
		const next = new Set<string>();
		for (const block of blocks) {
			const key = blockFadeKey(block);
			next.add(key);
			const known = blockFadeLive.has(key);
			blockFadeLive.set(key, block);
			if (!fresh.has(block.patternId) && !known && !blockFadeSkipIn) {
				blockFades.set(key, { block, mode: 'in', started: now });
			} else {
				const fade = blockFades.get(key);
				if (fade?.mode === 'in') fade.block = block;
			}
		}
		for (const key of blockFadeKeys) {
			if (next.has(key)) continue;
			const block = blockFadeLive.get(key);
			blockFadeLive.delete(key);
			const held = blockFadeHold.delete(key);
			if (held || !block || fresh.has(block.patternId) || !inWindow.has(block.patternId)) continue;
			blockFades.set(key, { block, mode: 'out', started: now });
		}
		for (const key of blockFadeHold) {
			if (next.has(key)) blockFadeHold.delete(key);
		}
		blockFadeSkipIn = false;
		for (const id of blockFadePatterns) {
			if (!inWindow.has(id)) blockFadePatterns.delete(id);
		}
		for (const id of inWindow) blockFadePatterns.add(id);
		blockFadeKeys = next;
		if ([...blockFades.values()].some((fade) => now - fade.started < BLOCK_FADE_MS)) startBlockFadeLoop();
	}

	function startBlockFadeLoop(): void {
		if (blockFadeFrame) return;
		const tick = () => {
			blockFadeFrame = 0;
			const now = performance.now();
			let active = false;
			for (const [key, fade] of blockFades) {
				if (now - fade.started >= BLOCK_FADE_MS) blockFades.delete(key);
				else active = true;
			}
			blockFadeNow = now;
			if (active) blockFadeFrame = requestAnimationFrame(tick);
		};
		blockFadeFrame = requestAnimationFrame(tick);
	}

	function blockPresence(block: PianoNoteBlock): number {
		if (!('orderIndex' in block) || !('patternId' in block) || !('localStartRow' in block)) return 1;
		const fade = blockFades.get(blockFadeKey(block as PianoTimelineBlock));
		if (!fade || fade.mode !== 'in') return 1;
		return blockFadePresence(fade.started);
	}

	function leavingBlockFades(): { block: PianoTimelineBlock; presence: number }[] {
		const leaving: { block: PianoTimelineBlock; presence: number }[] = [];
		for (const fade of blockFades.values()) {
			if (fade.mode !== 'out') continue;
			leaving.push({ block: fade.block, presence: 1 - blockFadePresence(fade.started) });
		}
		return leaving;
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
		const absolute = Math.min(metrics.columns - 1, Math.max(0, Math.floor(scrollLeft / rowWidth)));
		const located = timelineSpanAt(timeline, absolute);
		if (!located || located.span.orderIndex === currentPatternOrderIndex) return;
		followedOrder = located.span.orderIndex;
		const row = Math.min(selectedRow, Math.max(0, located.span.length - 1));
		currentPatternOrderIndex = located.span.orderIndex;
		if (selectedRow !== row) selectedRow = row;
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

	function spanForOrder(orderIndex: number): PianoTimelineSpan | null {
		return timeline.find((item) => item.orderIndex === orderIndex) ?? null;
	}

	function focusLocation(span: PianoTimelineSpan, localRow: number, scrollIntoView = true): void {
		const row = Math.min(Math.max(0, localRow), Math.max(0, span.length - 1));
		if (currentPatternOrderIndex !== span.orderIndex) currentPatternOrderIndex = span.orderIndex;
		if (selectedRow !== row) selectedRow = row;
		if (scrollIntoView) reveal(span.startRow + row);
	}

	function moveCursorTo(absoluteRow: number): void {
		const located = timelineSpanAt(timeline, Math.min(Math.max(0, absoluteRow), metrics.columns - 1));
		if (!located) return;
		focusLocation(located.span, located.localRow);
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

	function contentPoint(event: MouseEvent): { x: number; y: number; inRuler: boolean } | null {
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

	function trackPointer(onMove: (event: MouseEvent) => void, onUp: (event: MouseEvent) => void): void {
		removeDragListeners?.();
		const move = (event: MouseEvent) => onMove(event);
		const up = (event: MouseEvent) => {
			removeDragListeners?.();
			removeDragListeners = null;
			onUp(event);
		};
		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', up);
		removeDragListeners = () => {
			window.removeEventListener('mousemove', move);
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

	function selectionKey(note: { startRow: number; pitchIndex: number }): string {
		return `${note.startRow}:${note.pitchIndex}`;
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
		const seen = new Set(current.map(selectionKey));
		const next = [...current];
		for (const note of added) {
			const key = selectionKey(note);
			if (seen.has(key)) continue;
			seen.add(key);
			next.push(note);
		}
		return next;
	}

	function toggleSelected(note: NoteSelection): void {
		const current = workingSelection();
		const key = selectionKey(note);
		const next = current.some((item) => selectionKey(item) === key)
			? current.filter((item) => selectionKey(item) !== key)
			: [...current, note];
		applySelection(next);
	}

	function dropSelectionAt(orderIndex: number, localRow: number): void {
		const next = workingSelection().filter(
			(item) => item.orderIndex !== orderIndex || item.localStartRow !== localRow
		);
		if (next.length !== workingSelection().length) applySelection(next);
	}

	function commitEdits(
		songIndex: number,
		edits: Map<number, { before: Pattern; after: Pattern }>,
		orderIndex: number,
		row: number
	): void {
		if (edits.size === 0) return;
		let patterns = projectStore.patterns[songIndex] ?? [];
		const diffs = [];
		for (const { before, after } of edits.values()) {
			if (before === after) continue;
			const patternIndex = patterns.findIndex((item) => item.id === before.id);
			if (patternIndex < 0) continue;
			diffs.push(
				projectStore.createSetDiff(['patterns', songIndex, patternIndex], before, after)
			);
			patterns = PatternService.updatePatternInArray(patterns, after);
		}
		if (diffs.length === 0) return;
		const only = edits.size === 1 ? edits.values().next().value : undefined;
		projectStore.recordHistory(
			{
				type: 'pattern.edit',
				label: only ? `Edit pattern ${only.before.id}` : 'Edit patterns',
				affectedDomains: ['patterns'],
				beforeSelection: {
					songIndex,
					row,
					column: 0,
					patternOrderIndex: orderIndex
				},
				afterSelection: {
					songIndex,
					row,
					column: 0,
					patternOrderIndex: orderIndex
				}
			},
			diffs
		);
		projectStore.updatePatterns(songIndex, patterns);
	}

	function editingContext(source: Pattern, row: number, channelIndex: number): EditingContext | null {
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
			tuningTable: projectStore.songs[selected?.songIndex ?? 0]?.tuningTable ?? []
		};
	}

	function channelRowsFor(
		generics: Map<number, { before: Pattern; generic: GenericPattern }>
	): (span: PianoTimelineSpan) => GenericRow[] | undefined {
		return (span) => {
			if (!converter || !selected) return undefined;
			let entry = generics.get(span.patternId);
			if (!entry) {
				const item = patternById.get(span.patternId);
				if (!item) return undefined;
				entry = { before: item, generic: converter.toGeneric(item) };
				generics.set(item.id, entry);
			}
			return entry.generic.channels[selected.channelIndex]?.rows;
		};
	}

	function releaseAt(absoluteRow: number): boolean {
		if (!noteKey || !selected) return false;
		const located = timelineSpanAt(timeline, absoluteRow);
		if (!located) return false;
		const item = patternById.get(located.span.patternId);
		if (!item) return false;
		const value =
			cachedGeneric(item).channels[selected.channelIndex]?.rows[located.localRow]?.[noteKey];
		return noteEventKind(value) === 'release';
	}

	function sealTail(
		generics: Map<number, { before: Pattern; generic: GenericPattern }>,
		absoluteStart: number,
		length: number | null,
		release: boolean
	): Set<number> {
		const located = timelineSpanAt(timeline, absoluteStart);
		if (!noteKey || length === null || length < 1 || !located) return new Set();
		if (absoluteStart + length < located.span.startRow + located.span.length) return new Set();
		return writeSpilledNoteTail(
			timeline,
			noteKey,
			absoluteStart,
			length,
			release,
			channelRowsFor(generics)
		);
	}

	function clearOpenTail(
		generics: Map<number, { before: Pattern; generic: GenericPattern }>,
		span: PianoTimelineSpan,
		localStart: number
	): Set<number> {
		if (!noteKey || !selected) return new Set();
		const rows = generics.get(span.patternId)?.generic.channels[selected.channelIndex]?.rows;
		const block = rows ? pitchedBlockSpan(rows, noteKey, localStart) : null;
		if (!block || block.bounded) return new Set();
		return clearSpilledNoteGate(
			timeline,
			noteKey,
			span.startRow + span.length,
			channelRowsFor(generics)
		);
	}

	function channelIntents(): IntentNote[] {
		if (!selected || !noteKey) return [];
		const blocks: PianoTimelineBlock[] = [];
		const seen = new Map<number, GenericPattern>();
		for (const span of timeline) {
			const item = patternById.get(span.patternId);
			if (!item) continue;
			let generic = seen.get(item.id);
			if (!generic) {
				generic = cachedGeneric(item);
				seen.set(item.id, generic);
			}
			blocks.push(
				...shiftPianoNotes(
					collectPianoNotes(generic.channels[selected.channelIndex]?.rows ?? [], noteKey),
					span
				).blocks
			);
		}
		continueOpenNoteBlocks(blocks, timeline, noteKey, (later) => {
			const laterItem = patternById.get(later.patternId);
			if (!laterItem) return undefined;
			let laterGeneric = seen.get(laterItem.id);
			if (!laterGeneric) {
				laterGeneric = cachedGeneric(laterItem);
				seen.set(laterItem.id, laterGeneric);
			}
			return laterGeneric.channels[selected.channelIndex]?.rows;
		});
		const columns = timelineColumnCount(timeline);
		return blocks.map((block) => {
			const bounded = block.endRow < columns;
			return {
				startRow: block.startRow,
				length: Math.max(1, block.endRow - block.startRow),
				pitchIndex: block.pitchIndex,
				note: block.note,
				instrument: block.instrument,
				release: bounded && releaseAt(block.endRow),
				bounded,
				preferred: true
			};
		});
	}

	function heldIntents(): IntentNote[] {
		if (!selected) return [];
		return pianoRollConflictStore
			.forChannel(selected.songIndex, selected.channelIndex)
			.map((note) => ({
				startRow: note.startRow,
				length: note.length,
				pitchIndex: note.pitchIndex,
				note: note.note,
				instrument: note.instrument,
				release: note.release,
				bounded: true,
				preferred: false
			}));
	}

	function allIntents(): IntentNote[] {
		return [...channelIntents(), ...heldIntents()];
	}

	function hitsOther(
		start: number,
		length: number,
		ignoreStart: number | null,
		ignorePitch: number | null
	): boolean {
		return allIntents().some((note) => {
			if (note.startRow === ignoreStart && note.pitchIndex === ignorePitch) return false;
			return rangesOverlap(start, length, note.startRow, note.length);
		});
	}

	function blockIsConflict(note: { startRow: number; pitchIndex: number }): boolean {
		return notes.blocks.some(
			(block) =>
				block.conflict === true &&
				block.startRow === note.startRow &&
				block.pitchIndex === note.pitchIndex
		);
	}

	function placedInstrument(): number | null {
		if (!chip || !settingsStore.autoEnterInstrument) return null;
		const field = chip.schema.fields.instrument;
		if (!field) return null;
		const id = editorStateStore.getCurrentInstrument(chip.schema.chipType);
		if (!id) return null;
		const value = parseSymbol(id, field.length);
		return value > 0 ? value : null;
	}

	function placementLength(span: PianoTimelineSpan, localRow: number): number {
		if (placedBlockLength !== null && placedBlockLength > 0) return placedBlockLength;
		return Math.max(1, span.length - localRow);
	}

	function noteText(pitchIndex: number): string | null {
		const parsed = tuningTableIndexToNote(pitchIndex);
		if (!parsed) return null;
		return formatNoteFromEnum(parsed.noteName, parsed.octave);
	}

	function heldSignature(notes: readonly PianoConflictNote[]): string {
		return notes
			.map(
				(note) =>
					`${note.songIndex}:${note.channelIndex}:${note.startRow}:${note.length}:${note.pitchIndex}:${note.note}:${note.instrument ?? ''}:${note.release ? 1 : 0}`
			)
			.sort()
			.join('|');
	}

	function commitIntents(
		intents: IntentNote[],
		freshStart: number | null,
		freshPitch: number | null,
		orderIndex: number,
		row: number
	): { changed: boolean; preview: Pattern | null; previewRow: number } {
		const unchanged = { changed: false, preview: null, previewRow: row };
		if (
			playbackStore.isPlaying ||
			undoRedoStore.isApplying ||
			!selected ||
			!converter ||
			!noteKey ||
			!chip
		) {
			return unchanged;
		}
		const songIndex = selected.songIndex;
		const channelIndex = selected.channelIndex;
		const silent = silencedIndexes(intents);
		const audible = intents.filter((_, index) => !silent.has(index));
		const current = channelIntents();
		const samePlace = (left: IntentNote, right: IntentNote) =>
			left.startRow === right.startRow && left.pitchIndex === right.pitchIndex;
		const sameShape = (left: IntentNote, right: IntentNote) =>
			samePlace(left, right) &&
			left.length === right.length &&
			left.bounded === right.bounded &&
			left.release === right.release &&
			left.note === right.note;
		const remove = current.filter((note) => !audible.some((item) => samePlace(item, note)));
		const add = audible.filter((note) => !current.some((item) => samePlace(item, note)));
		const reshape = audible.filter((note) => {
			const existing = current.find((item) => samePlace(item, note));
			return !!existing && !sameShape(existing, note);
		});
		const beforeHeld = pianoRollConflictStore.snapshot();
		const held = intents.flatMap((note, index) =>
			silent.has(index)
				? [
						{
							songIndex,
							channelIndex,
							startRow: note.startRow,
							length: note.length,
							pitchIndex: note.pitchIndex,
							note: note.note,
							instrument: note.instrument,
							release: note.release
						}
					]
				: []
		);
		const afterHeld = beforeHeld
			.filter((note) => note.songIndex !== songIndex || note.channelIndex !== channelIndex)
			.concat(held);
		if (
			remove.length === 0 &&
			add.length === 0 &&
			reshape.length === 0 &&
			heldSignature(beforeHeld) === heldSignature(afterHeld)
		) {
			return unchanged;
		}
		const patternConverter = converter;
		const generics = new Map<number, { before: Pattern; generic: GenericPattern }>();
		const dirty = new Set<number>();
		const ensure = (patternId: number) => {
			const existing = generics.get(patternId);
			if (existing) return existing;
			const item = patternById.get(patternId);
			if (!item) return null;
			const entry = { before: item, generic: patternConverter.toGeneric(item) };
			generics.set(item.id, entry);
			return entry;
		};
		const writeGate = (note: IntentNote) => {
			const located = timelineSpanAt(timeline, note.startRow);
			if (!located) return;
			const entry = ensure(located.span.patternId);
			const rows = entry?.generic.channels[channelIndex]?.rows;
			if (!entry || !rows) return;
			if (!note.bounded) {
				if (
					resizePitchedNote(entry.generic, channelIndex, noteKey, located.localRow, rows.length)
				) {
					dirty.add(located.span.patternId);
				}
				return;
			}
			if (located.localRow + note.length < rows.length) {
				if (
					resizePitchedNote(
						entry.generic,
						channelIndex,
						noteKey,
						located.localRow,
						located.localRow + note.length
					)
				) {
					dirty.add(located.span.patternId);
				}
				const gate = rows[located.localRow + note.length];
				if (note.release && gate && gate[noteKey] !== '===') {
					gate[noteKey] = '===';
					dirty.add(located.span.patternId);
				}
				return;
			}
			resizePitchedNote(entry.generic, channelIndex, noteKey, located.localRow, rows.length);
			for (const id of sealTail(generics, note.startRow, note.length, note.release)) dirty.add(id);
		};
		for (const note of [...remove].sort((left, right) => right.startRow - left.startRow)) {
			const located = timelineSpanAt(timeline, note.startRow);
			if (!located) continue;
			const entry = ensure(located.span.patternId);
			if (!entry) continue;
			for (const id of clearOpenTail(generics, located.span, located.localRow)) dirty.add(id);
			if (removePitchedNote(entry.generic, channelIndex, noteKey, located.localRow)) {
				dirty.add(located.span.patternId);
			}
		}
		for (const note of reshape) {
			const located = timelineSpanAt(timeline, note.startRow);
			if (!located) continue;
			ensure(located.span.patternId);
			for (const id of clearOpenTail(generics, located.span, located.localRow)) dirty.add(id);
			if (note.note) {
				const entry = generics.get(located.span.patternId);
				if (
					entry &&
					setNoteValue(entry.generic, channelIndex, located.localRow, noteKey, note.note)
				) {
					dirty.add(located.span.patternId);
				}
			}
			writeGate(note);
		}
		const instrumentKey = chip.schema.fields.instrument ? 'instrument' : null;
		for (const note of add) {
			const located = timelineSpanAt(timeline, note.startRow);
			if (!located) continue;
			const entry = ensure(located.span.patternId);
			const cell = entry?.generic.channels[channelIndex]?.rows[located.localRow];
			if (!entry || !cell) continue;
			if (setNoteValue(entry.generic, channelIndex, located.localRow, noteKey, note.note)) {
				dirty.add(located.span.patternId);
			}
			if (instrumentKey && note.instrument && note.instrument > 0 && cell[instrumentKey] !== note.instrument) {
				cell[instrumentKey] = note.instrument;
				dirty.add(located.span.patternId);
			}
			writeGate(note);
		}
		const edits = new Map<number, { before: Pattern; after: Pattern }>();
		let preview: Pattern | null = null;
		let previewRow = row;
		const fresh = audible.find(
			(note) => note.startRow === freshStart && note.pitchIndex === freshPitch
		);
		const freshLocated = fresh ? timelineSpanAt(timeline, fresh.startRow) : null;
		for (const id of dirty) {
			const entry = generics.get(id);
			if (!entry) continue;
			let after = patternConverter.fromGeneric(entry.generic);
			if (fresh && freshLocated && freshLocated.span.patternId === id) {
				after = AutoEnvService.applyAutoEnvelopeIfEligible(
					after,
					freshLocated.localRow,
					{
						channelIndex,
						fieldType: 'note',
						fieldKey: noteKey
					},
					projectStore.songs[songIndex]?.tuningTable ?? [],
					autoEnvStore.currentRatio,
					autoEnvStore.enabled
				);
				preview = after;
				previewRow = freshLocated.localRow;
			}
			edits.set(id, { before: entry.before, after });
		}
		let patterns = projectStore.patterns[songIndex] ?? [];
		for (const { before, after } of edits.values()) {
			patterns = PatternService.updatePatternInArray(patterns, after);
		}
		if (edits.size > 0) projectStore.updatePatterns(songIndex, patterns);
		pianoRollConflictStore.replaceAll(afterHeld);
		const patternEdits = [...edits.values()];
		const cursor = { row, column: 0, patternOrderIndex: orderIndex };
		undoRedoStore.pushAction({
			execute() {
				let next = projectStore.patterns[songIndex] ?? [];
				for (const edit of patternEdits) {
					next = PatternService.updatePatternInArray(next, edit.after);
				}
				if (patternEdits.length > 0) projectStore.updatePatterns(songIndex, next);
				pianoRollConflictStore.replaceAll(afterHeld);
			},
			undo() {
				let next = projectStore.patterns[songIndex] ?? [];
				for (const edit of patternEdits) {
					next = PatternService.updatePatternInArray(next, edit.before);
				}
				if (patternEdits.length > 0) projectStore.updatePatterns(songIndex, next);
				pianoRollConflictStore.replaceAll(beforeHeld);
			},
			getCursorPosition() {
				return cursor;
			}
		});
		return { changed: true, preview, previewRow };
	}

	function placePitched(
		span: PianoTimelineSpan,
		localRow: number,
		pitchIndex: number,
		advance: boolean,
		timedPreview: boolean
	): boolean {
		const source = patternById.get(span.patternId);
		if (playbackStore.isPlaying || !source || !selected || !noteKey || !chip) return false;
		const parsed = tuningTableIndexToNote(pitchIndex);
		if (!parsed) return false;
		const length = placementLength(span, localRow);
		const start = span.startRow + localRow;
		if (hitsOther(start, length, null, null)) {
			const text = formatNoteFromEnum(parsed.noteName, parsed.octave);
			const fresh: IntentNote = {
				startRow: start,
				length,
				pitchIndex,
				note: text,
				instrument: placedInstrument(),
				release: false,
				bounded: true,
				preferred: false
			};
			const result = commitIntents(
				[...channelIntents(), ...heldIntents(), fresh],
				start,
				pitchIndex,
				span.orderIndex,
				localRow
			);
			if (!result.changed) return false;
			placedBlockLength = length;
			applySelection([selectionFor(span, localRow, pitchIndex)]);
			focusLocation(span, localRow);
			if (result.preview) {
				playPreview(
					result.preview,
					selected.songIndex,
					selected.channelIndex,
					result.previewRow,
					timedPreview
				);
			}
			if (advance && editorStateStore.step > 0) {
				moveCursorTo(span.startRow + localRow + editorStateStore.step);
			}
			return true;
		}
		const context = editingContext(source, localRow, selected.channelIndex);
		if (!context) return false;
		const fieldInfo: FieldInfo = {
			fieldKey: noteKey,
			fieldType: 'note',
			isGlobal: false,
			channelIndex: selected.channelIndex,
			charOffset: 0
		};
		const result = PatternNoteInput.applyNoteString(
			context,
			fieldInfo,
			formatNoteFromEnum(parsed.noteName, parsed.octave)
		);
		applySelection([selectionFor(span, localRow, pitchIndex)]);
		focusLocation(span, localRow);
		if (!result || result.didChange === false) return false;
		let updated = AutoEnvService.applyAutoEnvelopeIfEligible(
			result.updatedPattern,
			localRow,
			fieldInfo,
			context.tuningTable ?? [],
			autoEnvStore.currentRatio,
			autoEnvStore.enabled
		);
		const edits = new Map<number, { before: Pattern; after: Pattern }>();
		if (converter) {
			const generic = converter.toGeneric(updated);
			const generics = new Map([[source.id, { before: source, generic }]]);
			const rows = generic.channels[selected.channelIndex]?.rows;
			const touched = new Set<number>();
			if (rows && placedBlockLength !== null) {
				if (localRow + placedBlockLength < rows.length) {
					if (
						resizePitchedNote(
							generic,
							selected.channelIndex,
							noteKey,
							localRow,
							localRow + placedBlockLength
						)
					) {
						touched.add(source.id);
					}
				} else {
					for (const id of sealTail(generics, span.startRow + localRow, placedBlockLength, false)) {
						touched.add(id);
					}
				}
			}
			const blockSpan = rows ? pitchedBlockSpan(rows, noteKey, localRow) : null;
			if (placedBlockLength === null && blockSpan?.bounded) placedBlockLength = blockSpan.length;
			if (touched.has(source.id)) updated = converter.fromGeneric(generic);
			for (const id of touched) {
				if (id === source.id) continue;
				const entry = generics.get(id);
				if (!entry) continue;
				edits.set(id, { before: entry.before, after: converter.fromGeneric(entry.generic) });
			}
		}
		edits.set(source.id, { before: source, after: updated });
		commitEdits(selected.songIndex, edits, span.orderIndex, localRow);
		playPreview(updated, selected.songIndex, selected.channelIndex, localRow, timedPreview);
		if (advance && editorStateStore.step > 0) moveCursorTo(span.startRow + localRow + editorStateStore.step);
		return true;
	}

	function placeGate(span: PianoTimelineSpan, localRow: number, kind: 'off' | 'release'): void {
		const source = patternById.get(span.patternId);
		if (playbackStore.isPlaying || !source || !converter || !selected || !noteKey) return;
		const genericPattern = converter.toGeneric(source);
		if (
			!setNoteValue(
				genericPattern,
				selected.channelIndex,
				localRow,
				noteKey,
				kind === 'off' ? 'OFF' : '==='
			)
		) {
			return;
		}
		commitEdits(
			selected.songIndex,
			new Map([[source.id, { before: source, after: converter.fromGeneric(genericPattern) }]]),
			span.orderIndex,
			localRow
		);
		focusLocation(span, localRow);
		applySelection([]);
	}

	function clearNote(span: PianoTimelineSpan, localRow: number): void {
		const source = patternById.get(span.patternId);
		if (playbackStore.isPlaying || !source || !converter || !selected || !noteKey) return;
		const genericPattern = converter.toGeneric(source);
		const generics = new Map([[source.id, { before: source, generic: genericPattern }]]);
		const kind = noteEventKind(
			genericPattern.channels[selected.channelIndex]?.rows[localRow]?.[noteKey]
		);
		if (kind === 'pitched' && heldIntents().length > 0) {
			const start = span.startRow + localRow;
			const raw = genericPattern.channels[selected.channelIndex]?.rows[localRow]?.[noteKey];
			const parsed = typeof raw === 'string' ? parseNoteFromString(raw) : null;
			const pitch = parsed ? noteToTuningTableIndex(parsed.noteName, parsed.octave) : null;
			if (pitch !== null) {
				const next = allIntents().filter(
					(note) => !(note.startRow === start && note.pitchIndex === pitch)
				);
				commitIntents(next, null, null, span.orderIndex, localRow);
				dropSelectionAt(span.orderIndex, localRow);
				return;
			}
		}
		const tail = kind === 'pitched' ? clearOpenTail(generics, span, localRow) : new Set<number>();
		const cleared =
			kind === 'pitched'
				? removePitchedNote(genericPattern, selected.channelIndex, noteKey, localRow)
				: setNoteValue(genericPattern, selected.channelIndex, localRow, noteKey, '---');
		if (!cleared && tail.size === 0) return;
		const edits = new Map<number, { before: Pattern; after: Pattern }>([
			[source.id, { before: source, after: converter.fromGeneric(genericPattern) }]
		]);
		for (const id of tail) {
			if (id === source.id) continue;
			const entry = generics.get(id);
			if (!entry) continue;
			edits.set(id, { before: entry.before, after: converter.fromGeneric(entry.generic) });
		}
		commitEdits(selected.songIndex, edits, span.orderIndex, localRow);
		dropSelectionAt(span.orderIndex, localRow);
	}

	function moveGroupThroughOverlaps(
		group: readonly MoveGroupNote[],
		deltaRow: number,
		deltaPitch: number,
		anchor: NoteSelection,
		scrollIntoView: boolean
	): boolean {
		const keys = new Set(group.map((item) => selectionKey(item)));
		const all = allIntents();
		const staying = all.filter((note) => !keys.has(`${note.startRow}:${note.pitchIndex}`));
		const moved: IntentNote[] = [];
		for (const item of group) {
			const pitchIndex = item.pitchIndex + deltaPitch;
			const text = noteText(pitchIndex);
			const source = all.find(
				(note) => note.startRow === item.startRow && note.pitchIndex === item.pitchIndex
			);
			if (!text || !source) return false;
			moved.push({
				...source,
				startRow: item.startRow + deltaRow,
				pitchIndex,
				note: text,
				preferred: false
			});
		}
		const overlaps = moved.some(
			(note) =>
				staying.some((other) =>
					rangesOverlap(note.startRow, note.length, other.startRow, other.length)
				) ||
				moved.some(
					(other) =>
						other !== note &&
						rangesOverlap(note.startRow, note.length, other.startRow, other.length)
				)
		);
		if (!overlaps && !group.some((item) => blockIsConflict(item))) return false;
		const focusStart = anchor.startRow + deltaRow;
		const focusPitch = anchor.pitchIndex + deltaPitch;
		const located = timelineSpanAt(timeline, focusStart);
		const result = commitIntents(
			[...staying, ...moved],
			focusStart,
			focusPitch,
			located?.span.orderIndex ?? anchor.orderIndex,
			located?.localRow ?? 0
		);
		if (!result.changed) return true;
		const placed: NoteSelection[] = [];
		for (const item of moved) {
			const home = timelineSpanAt(timeline, item.startRow);
			if (!home) continue;
			placed.push(selectionFor(home.span, home.localRow, item.pitchIndex));
		}
		applySelection(placed);
		if (located) focusLocation(located.span, located.localRow, scrollIntoView);
		if (result.preview && selected) {
			playPreview(
				result.preview,
				selected.songIndex,
				selected.channelIndex,
				result.previewRow,
				true
			);
		}
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
			!converter ||
			!selected ||
			!noteKey ||
			!chip ||
			(deltaRow === 0 && deltaPitch === 0)
		) {
			return;
		}
		const overlapMove = moveGroupThroughOverlaps(group, deltaRow, deltaPitch, anchor, scrollIntoView);
		if (overlapMove) return;
		const patternConverter = converter;
		const channelIndex = selected.channelIndex;
		const instrumentKey = chip.schema.fields.instrument ? 'instrument' : null;
		const generics = new Map<number, { before: Pattern; generic: GenericPattern }>();
		const ensure = (patternId: number) => {
			const existing = generics.get(patternId);
			if (existing) return existing;
			const item = patternById.get(patternId);
			if (!item) return null;
			const entry = { before: item, generic: patternConverter.toGeneric(item) };
			generics.set(item.id, entry);
			return entry;
		};
		const moved: Array<{
			patternId: number;
			orderIndex: number;
			localRow: number;
			pitchIndex: number;
			sourcePatternId: number;
			sourceLocalRow: number;
			note: PianoPasteNote;
		}> = [];
		for (const item of group) {
			const source = ensure(item.patternId);
			const rows = source?.generic.channels[channelIndex]?.rows;
			if (!source || !rows) continue;
			const captured = capturePianoNote(rows, noteKey, item.localStartRow, item.startRow);
			if (!captured) continue;
			const pitchIndex = item.pitchIndex + deltaPitch;
			const parsed = tuningTableIndexToNote(pitchIndex);
			if (!parsed) continue;
			const located = timelineSpanAt(timeline, item.startRow + deltaRow);
			if (!located) continue;
			ensure(located.span.patternId);
			const fields: Record<string, unknown> = {};
			const instrument = instrumentKey ? captured.fields[instrumentKey] : undefined;
			if (instrumentKey && typeof instrument === 'number' && instrument > 0) fields[instrumentKey] = instrument;
			const length = Math.max(1, item.length);
			const bounded = item.startRow + length < timelineColumnCount(timeline);
			moved.push({
				patternId: located.span.patternId,
				orderIndex: located.span.orderIndex,
				localRow: located.localRow,
				pitchIndex,
				sourcePatternId: item.patternId,
				sourceLocalRow: item.localStartRow,
				note: {
					rowOffset: captured.rowOffset,
					note: formatNoteFromEnum(parsed.noteName, parsed.octave),
					length,
					bounded,
					release: bounded && releaseAt(item.startRow + length),
					fields,
					localRow: located.localRow
				}
			});
		}
		if (moved.length === 0) return;
		const clearedTails = new Set<number>();
		for (const item of group) {
			const span = spanForOrder(item.orderIndex);
			if (!span || !ensure(item.patternId)) continue;
			for (const id of clearOpenTail(generics, span, item.localStartRow)) clearedTails.add(id);
		}
		const removals = new Map<number, number[]>();
		for (const item of moved) {
			const rows = removals.get(item.sourcePatternId) ?? [];
			rows.push(item.sourceLocalRow);
			removals.set(item.sourcePatternId, rows);
		}
		for (const [patternId, localRows] of removals) {
			const entry = generics.get(patternId);
			const channelRows = entry?.generic.channels[channelIndex]?.rows;
			if (!entry || !channelRows) continue;
			removePitchedNotes(entry.generic, channelIndex, noteKey, localRows);
			if (!instrumentKey) continue;
			for (const localRow of localRows) {
				const cell = channelRows[localRow];
				const instrument = cell?.[instrumentKey];
				if (typeof instrument === 'number' && instrument > 0 && cell) cell[instrumentKey] = 0;
			}
		}
		const pasteGroups = new Map<number, PianoPasteNote[]>();
		for (const item of moved) {
			const notesForPattern = pasteGroups.get(item.patternId) ?? [];
			notesForPattern.push(item.note);
			pasteGroups.set(item.patternId, notesForPattern);
		}
		const edited = new Set<number>(clearedTails);
		for (const item of moved) {
			edited.add(item.sourcePatternId);
			edited.add(item.patternId);
		}
		for (const [patternId, notesForPattern] of pasteGroups) {
			const entry = generics.get(patternId);
			const rows = entry?.generic.channels[channelIndex]?.rows;
			if (!entry || !rows) continue;
			pastePianoNotes(rows, noteKey, notesForPattern);
		}
		for (const item of moved) {
			if (!item.note.bounded) continue;
			const span = timeline.find((entry) => entry.orderIndex === item.orderIndex);
			if (!span || item.localRow + item.note.length < span.length) continue;
			for (const id of sealTail(
				generics,
				span.startRow + item.localRow,
				item.note.length,
				item.note.release
			)) {
				edited.add(id);
			}
		}
		const edits = new Map<number, { before: Pattern; after: Pattern }>();
		for (const id of edited) {
			const entry = generics.get(id);
			if (!entry) continue;
			edits.set(entry.before.id, {
				before: entry.before,
				after: converter.fromGeneric(entry.generic)
			});
		}
		const focus = moved.find(
			(item) => item.sourcePatternId === anchor.patternId && item.sourceLocalRow === anchor.localStartRow
		) ?? moved[0];
		if (!focus) return;
		commitEdits(selected.songIndex, edits, focus.orderIndex, focus.localRow);
		const placed: NoteSelection[] = [];
		for (const item of moved) {
			const span = timeline.find((entry) => entry.orderIndex === item.orderIndex);
			if (!span) continue;
			placed.push(selectionFor(span, item.localRow, item.pitchIndex));
		}
		applySelection(placed);
		const focusSpan = timeline.find((entry) => entry.orderIndex === focus.orderIndex);
		if (focusSpan) focusLocation(focusSpan, focus.localRow, scrollIntoView);
		const after = edits.get(focus.patternId)?.after;
		if (after) playPreview(after, selected.songIndex, selected.channelIndex, focus.localRow, true);
	}

	function commitMove(
		from: NoteSelection,
		toAbsolute: number,
		pitchIndex: number,
		scrollIntoView = true
	): void {
		const fromSpan = spanForOrder(from.orderIndex);
		const dest = timelineSpanAt(timeline, toAbsolute);
		const source = fromSpan ? patternById.get(fromSpan.patternId) : undefined;
		const destination = dest ? patternById.get(dest.span.patternId) : undefined;
		if (
			playbackStore.isPlaying ||
			!fromSpan ||
			!dest ||
			!source ||
			!destination ||
			!converter ||
			!selected ||
			!noteKey ||
			!chip
		) {
			return;
		}
		const parsed = tuningTableIndexToNote(pitchIndex);
		if (!parsed) return;
		const note = formatNoteFromEnum(parsed.noteName, parsed.octave);
		const instrumentKey = chip.schema.fields.instrument ? 'instrument' : null;
		const length = draggedBlockLength(from);
		const sourceIntent = allIntents().find(
			(item) => item.startRow === from.startRow && item.pitchIndex === from.pitchIndex
		);
		if (
			sourceIntent &&
			(blockIsConflict(from) ||
				hitsOther(toAbsolute, sourceIntent.length, from.startRow, from.pitchIndex))
		) {
			const next = allIntents().filter(
				(item) => !(item.startRow === from.startRow && item.pitchIndex === from.pitchIndex)
			);
			next.push({
				...sourceIntent,
				startRow: toAbsolute,
				pitchIndex,
				note,
				preferred: false
			});
			const result = commitIntents(next, toAbsolute, pitchIndex, dest.span.orderIndex, dest.localRow);
			if (!result.changed) return;
			applySelection([selectionFor(dest.span, dest.localRow, pitchIndex)]);
			focusLocation(dest.span, dest.localRow, scrollIntoView);
			if (result.preview) {
				playPreview(
					result.preview,
					selected.songIndex,
					selected.channelIndex,
					result.previewRow,
					true
				);
			}
			return;
		}
		const release = length === null ? false : releaseAt(from.startRow + length);
		const field = {
			channelIndex: selected.channelIndex,
			fieldType: 'note' as const,
			fieldKey: noteKey
		};
		const tuning = projectStore.songs[selected.songIndex]?.tuningTable ?? [];
		const sourceGeneric = converter.toGeneric(source);
		const destGeneric = source.id === destination.id ? sourceGeneric : converter.toGeneric(destination);
		const generics = new Map<number, { before: Pattern; generic: GenericPattern }>([
			[source.id, { before: source, generic: sourceGeneric }]
		]);
		if (source.id !== destination.id) {
			generics.set(destination.id, { before: destination, generic: destGeneric });
		}
		const cleared = clearOpenTail(generics, fromSpan, from.localStartRow);
		const moved =
			source.id === destination.id
				? movePitchedNote(
						sourceGeneric,
						selected.channelIndex,
						noteKey,
						instrumentKey,
						from.localStartRow,
						dest.localRow,
						note,
						length
					)
				: relocatePitchedNote(
						sourceGeneric,
						destGeneric,
						selected.channelIndex,
						noteKey,
						instrumentKey,
						from.localStartRow,
						dest.localRow,
						note,
						length
					);
		if (!moved) return;
		const spilled = sealTail(generics, dest.span.startRow + dest.localRow, length, release);
		let destAfter = converter.fromGeneric(destGeneric);
		destAfter = AutoEnvService.applyAutoEnvelopeIfEligible(
			destAfter,
			dest.localRow,
			field,
			tuning,
			autoEnvStore.currentRatio,
			autoEnvStore.enabled
		);
		const edits = new Map<number, { before: Pattern; after: Pattern }>([
			[destination.id, { before: destination, after: destAfter }]
		]);
		if (source.id !== destination.id) {
			edits.set(source.id, { before: source, after: converter.fromGeneric(sourceGeneric) });
		}
		for (const id of [...cleared, ...spilled]) {
			if (edits.has(id)) continue;
			const entry = generics.get(id);
			if (!entry) continue;
			edits.set(id, { before: entry.before, after: converter.fromGeneric(entry.generic) });
		}
		commitEdits(selected.songIndex, edits, dest.span.orderIndex, dest.localRow);
		applySelection([selectionFor(dest.span, dest.localRow, pitchIndex)]);
		focusLocation(dest.span, dest.localRow, scrollIntoView);
		playPreview(destAfter, selected.songIndex, selected.channelIndex, dest.localRow, true);
	}

	function draggedBlockLength(from: NoteSelection): number | null {
		for (const block of notes.blocks) {
			const item = noteBlock(block);
			if (
				!item ||
				item.orderIndex !== from.orderIndex ||
				item.localStartRow !== from.localStartRow ||
				item.pitchIndex !== from.pitchIndex
			) {
				continue;
			}
			return Math.max(1, item.endRow - item.startRow);
		}
		return null;
	}

	function commitResize(orderIndex: number, localStart: number, localEnd: number): void {
		const span = spanForOrder(orderIndex);
		const source = span ? patternById.get(span.patternId) : undefined;
		if (playbackStore.isPlaying || !span || !source || !converter || !selected || !noteKey) return;
		const genericPattern = converter.toGeneric(source);
		const generics = new Map([[source.id, { before: source, generic: genericPattern }]]);
		const drawn = notes.blocks.find(
			(block) => block.orderIndex === orderIndex && block.localStartRow === localStart
		);
		const release = drawn ? releaseAt(drawn.endRow) : false;
		const target = Math.max(localStart + 1, localEnd);
		const absoluteStart = span.startRow + localStart;
		const resizedLength = Math.max(1, target - localStart);
		const existing = allIntents().find(
			(item) =>
				item.startRow === absoluteStart &&
				(drawn ? item.pitchIndex === drawn.pitchIndex : true)
		);
		if (
			existing &&
			(blockIsConflict(existing) ||
				hitsOther(absoluteStart, resizedLength, existing.startRow, existing.pitchIndex))
		) {
			const next = allIntents().map((item) =>
				item.startRow === existing.startRow && item.pitchIndex === existing.pitchIndex
					? { ...item, length: resizedLength, bounded: true, release, preferred: false }
					: item
			);
			commitIntents(next, absoluteStart, existing.pitchIndex, orderIndex, localStart);
			placedBlockLength = resizedLength;
			return;
		}
		const absoluteEnd = span.startRow + target;
		const songEnd = timelineColumnCount(timeline);
		const spilled = new Set<number>();
		const cleared = new Set<number>();
		let changed = false;
		if (target > span.length && absoluteEnd >= songEnd) {
			for (const id of clearOpenTail(generics, span, localStart)) cleared.add(id);
			changed =
				resizePitchedNote(
					genericPattern,
					selected.channelIndex,
					noteKey,
					localStart,
					Math.max(localStart + 1, span.length - 1)
				) || cleared.size > 0;
		} else if (target >= span.length) {
			for (const id of clearOpenTail(generics, span, localStart)) cleared.add(id);
			changed =
				resizePitchedNote(genericPattern, selected.channelIndex, noteKey, localStart, span.length) ||
				changed;
			for (const id of sealTail(generics, span.startRow + localStart, target - localStart, release)) {
				spilled.add(id);
				changed = true;
			}
		} else {
			for (const id of clearOpenTail(generics, span, localStart)) cleared.add(id);
			changed =
				resizePitchedNote(genericPattern, selected.channelIndex, noteKey, localStart, target) ||
				cleared.size > 0;
		}
		if (!changed) return;
		placedBlockLength = target - localStart;
		const edits = new Map<number, { before: Pattern; after: Pattern }>([
			[source.id, { before: source, after: converter.fromGeneric(genericPattern) }]
		]);
		for (const id of [...cleared, ...spilled]) {
			if (id === source.id) continue;
			const entry = generics.get(id);
			if (!entry) continue;
			edits.set(id, { before: entry.before, after: converter.fromGeneric(entry.generic) });
		}
		commitEdits(selected.songIndex, edits, orderIndex, localStart);
	}

	function commitLaneDraft(rows: Record<number, number>): void {
		if (playbackStore.isPlaying || !converter || !selected || !activeLane) return;
		if (activeLane.kind !== 'value') return;
		const generics = new Map<number, { before: Pattern; generic: GenericPattern }>();
		let changed = false;
		for (const [rowText, value] of Object.entries(rows)) {
			const located = timelineSpanAt(timeline, Number(rowText));
			if (!located) continue;
			const item = patternById.get(located.span.patternId);
			if (!item) continue;
			let entry = generics.get(item.id);
			if (!entry) {
				entry = { before: item, generic: converter.toGeneric(item) };
				generics.set(item.id, entry);
			}
			changed =
				setPianoFieldValue(
					entry.generic,
					activeLane,
					selected.channelIndex,
					located.localRow,
					value
				) || changed;
		}
		if (!changed) return;
		const edits = new Map<number, { before: Pattern; after: Pattern }>();
		for (const [id, entry] of generics) {
			edits.set(id, { before: entry.before, after: converter.fromGeneric(entry.generic) });
		}
		const first = Object.keys(rows)[0];
		const located = first === undefined ? null : timelineSpanAt(timeline, Number(first));
		commitEdits(
			selected.songIndex,
			edits,
			located?.span.orderIndex ?? currentPatternOrderIndex,
			located?.localRow ?? selectedRow
		);
	}

	function clearLane(absoluteRow: number): void {
		const located = timelineSpanAt(timeline, absoluteRow);
		const source = located ? patternById.get(located.span.patternId) : undefined;
		if (playbackStore.isPlaying || !located || !source || !converter || !selected || !activeLane) {
			return;
		}
		const genericPattern = converter.toGeneric(source);
		const value = activeLane.kind === 'effect' ? null : 0;
		if (
			!setPianoFieldValue(
				genericPattern,
				activeLane,
				selected.channelIndex,
				located.localRow,
				value
			)
		) {
			return;
		}
		commitEdits(
			selected.songIndex,
			new Map([[source.id, { before: source, after: converter.fromGeneric(genericPattern) }]]),
			located.span.orderIndex,
			located.localRow
		);
		focusLocation(located.span, located.localRow);
	}

	function playPreview(
		source: Pattern,
		songIndex: number,
		channelIndex: number,
		row: number,
		timed: boolean
	): void {
		if (playbackStore.isPlaying || !chip || !converter) return;
		const processor = chipProcessors[songIndex];
		if (!processor || !('playPreviewRow' in processor)) return;
		services.audioService.setPreviewActiveForChips(songIndex);
		const played = previewService.playFromContext(
			processor as ChipProcessor & PreviewNoteSupport,
			source,
			channelIndex,
			row,
			chip.schema,
			converter,
			{ previewFullRow: settingsStore.previewFullRow, isGlobalField: false }
		);
		if (played !== undefined) previewChannel = played;
		if (timed) schedulePreviewStop();
		else if (previewTimer !== null) {
			window.clearTimeout(previewTimer);
			previewTimer = null;
		}
	}

	function schedulePreviewStop(): void {
		if (previewTimer !== null) window.clearTimeout(previewTimer);
		previewTimer = window.setTimeout(() => {
			previewTimer = null;
			stopPreview();
		}, 450);
	}

	function stopPreview(): void {
		if (previewTimer !== null) {
			window.clearTimeout(previewTimer);
			previewTimer = null;
		}
		if (previewChannel === null || !selected) return;
		const processor = chipProcessors[selected.songIndex];
		if (processor && 'stopPreviewNote' in processor) {
			previewService.stopNote(
				processor as ChipProcessor & PreviewNoteSupport,
				previewChannel === -1 ? undefined : previewChannel
			);
		}
		services.audioService.setPreviewActiveForChips(null);
		previewChannel = null;
	}

	function locateRow(absoluteRow: number): { span: PianoTimelineSpan; localRow: number } | null {
		const gate = notes.gates.find((item) => item.row === absoluteRow);
		if (gate) {
			const span = spanForOrder(gate.orderIndex);
			if (span) return { span, localRow: gate.localRow };
		}
		return timelineSpanAt(timeline, absoluteRow);
	}

	function eraseBlockAt(point: { x: number; y: number; inRuler: boolean }): boolean {
		if (point.inRuler || !noteKey) return false;
		const hit = hitTestNoteContent(point.x, point.y, notes.blocks, metrics);
		if (!hit || hit.type === 'grid') return false;
		const block = noteBlock(hit.block);
		const span = block ? spanForOrder(block.orderIndex) : null;
		if (!block || !span) return false;
		if (block.conflict) {
			const next = allIntents().filter(
				(note) => !(note.startRow === block.startRow && note.pitchIndex === block.pitchIndex)
			);
			commitIntents(next, null, null, block.orderIndex, block.localStartRow);
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

	function noteBlock(block: PianoNoteBlock): PianoTimelineBlock | null {
		if (!('orderIndex' in block) || !('patternId' in block) || !('localStartRow' in block)) return null;
		return block as PianoTimelineBlock;
	}

	function resizeLimit(dragState: { startRow: number }): number {
		return Math.max(dragState.startRow + 1, metrics.columns);
	}

	function onGridMouseDown(event: MouseEvent): void {
		gridCanvas?.focus({ preventScroll: true });
		focusTarget = 'note';
		const point = contentPoint(event);
		if (playbackStore.isPlaying) {
			if (event.button !== 0 || !point?.inRuler) return;
			const row = xToRow(point.x, metrics);
			const located = row === null ? null : locateRow(row);
			if (!located) return;
			focusLocation(located.span, located.localRow, false);
			onseekplayback?.(located.span.orderIndex, located.localRow);
			return;
		}
		if (!point || !noteKey) return;
		if (point.inRuler) {
			const row = xToRow(point.x, metrics);
			const located = row === null ? null : locateRow(row);
			if (!located) return;
			focusLocation(located.span, located.localRow);
			if (event.button === 2) {
				const gate = notes.gates.find((item) => item.row === row);
				if (gate) clearNote(located.span, located.localRow);
				else placeGate(located.span, located.localRow, event.shiftKey ? 'release' : 'off');
			}
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
				}, () => {});
				return;
			}
			if (hit.type === 'grid') {
				const located = locateRow(hit.row);
				if (!located) return;
				const gate = notes.gates.find((item) => item.row === hit.row);
				if (gate) clearNote(located.span, located.localRow);
				else placeGate(located.span, located.localRow, 'off');
			}
			return;
		}
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey) {
			event.preventDefault();
			gridCanvas?.focus({ preventScroll: true });
			startMarquee(point, event.shiftKey, hit.type === 'grid' ? null : noteBlock(hit.block));
			return;
		}
		if (hit.type === 'grid') {
			const located = locateRow(hit.row);
			if (!located) return;
			if (event.shiftKey) placeGate(located.span, located.localRow, 'release');
			else if (event.altKey) placeGate(located.span, located.localRow, 'off');
			else if (placePitched(located.span, located.localRow, hit.pitchIndex, false, true)) {
				const from = selectedBlock;
				if (from) startMoveDrag(from, draggedBlockLength(from) ?? placedBlockLength ?? 1);
			}
			return;
		}
		const block = noteBlock(hit.block);
		const span = block ? spanForOrder(block.orderIndex) : null;
		if (!block || !span) return;
		const grabbed = selectionFor(span, block.localStartRow, block.pitchIndex);
		const current = workingSelection();
		const inSelection = current.some((item) => selectionKey(item) === selectionKey(grabbed));
		const moveGroup = inSelection && current.length > 1 ? current : [grabbed];
		if (hit.type === 'resize' || moveGroup.length === 1) applySelection([grabbed]);
		focusLocation(span, block.localStartRow, false);
		if (hit.type === 'resize') {
			drag = {
				kind: 'resize',
				orderIndex: span.orderIndex,
				patternId: span.patternId,
				localStart: block.localStartRow,
				startRow: block.startRow,
				pitch: block.pitchIndex,
				instrument: block.instrument,
				gestures: block.gestures,
				endRow: block.endRow,
				originEnd: block.endRow,
				spanEnd: span.startRow + span.length
			};
			trackPointer(
				(move) => {
					if (drag?.kind !== 'resize') return;
					const next = contentPoint(move);
					if (!next) return;
					const maxX = Math.max(0, metrics.columns * metrics.rowWidth - 1);
					const row = xToRow(Math.max(0, Math.min(maxX, next.x)), metrics);
					if (row === null) return;
					drag = {
						...drag,
						endRow: Math.max(drag.startRow + 1, Math.min(resizeLimit(drag), row + 1))
					};
				},
				() => {
					if (drag?.kind === 'resize' && drag.endRow !== drag.originEnd) {
						commitResize(drag.orderIndex, drag.localStart, drag.endRow - (drag.startRow - drag.localStart));
					}
					drag = null;
				}
			);
			return;
		}
		const pointerRow = xToRow(point.x, metrics);
		const grabOffset = pointerRow === null ? 0 : Math.max(0, pointerRow - block.startRow);
		startMoveDrag(
			grabbed,
			Math.max(1, block.endRow - block.startRow),
			resolveNoteColor(block),
			block.instrument,
			grabOffset,
			moveGroup
		);
	}

	function moveGroupNote(selection: NoteSelection, fallbackLength = 1): MoveGroupNote {
		const block = notes.blocks.find(
			(item) => item.startRow === selection.startRow && item.pitchIndex === selection.pitchIndex
		);
		return {
			...selection,
			length: block ? Math.max(1, block.endRow - block.startRow) : Math.max(1, fallbackLength),
			color: block ? resolveNoteColor(block) : null,
			instrument: block?.instrument ?? null,
			gestures: block?.gestures ?? [],
			level: block?.level ?? null
		};
	}

	function startMoveDrag(
		from: NoteSelection,
		length: number,
		color: string | null = null,
		instrument: number | null = null,
		grabOffset = 0,
		selections: NoteSelection[] = [from]
	): void {
		const group = selections.map((item) => {
			const note = moveGroupNote(item, selectionKey(item) === selectionKey(from) ? length : 1);
			if (selectionKey(item) !== selectionKey(from)) return note;
			return {
				...note,
				color: color ?? note.color,
				instrument: instrument ?? note.instrument
			};
		});
		const anchor = group.find((item) => selectionKey(item) === selectionKey(from)) ?? group[0];
		if (!anchor) return;
		drag = {
			kind: 'move',
			fromOrder: from.orderIndex,
			fromPatternId: from.patternId,
			fromLocal: from.localStartRow,
			fromRow: from.startRow,
			fromPitch: from.pitchIndex,
			row: from.startRow,
			pitch: from.pitchIndex,
			length: anchor.length,
			grabOffset: Math.max(0, grabOffset),
			color: anchor.color,
			instrument: anchor.instrument,
			gestures: anchor.gestures,
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
				const desiredRow = row - drag.grabOffset - drag.fromRow;
				const desiredPitch = pitch - drag.fromPitch;
				const clamped = clampSelectionDelta(
					drag.group,
					desiredRow,
					desiredPitch,
					metrics.columns,
					metrics.pitchCount
				);
				drag = {
					...drag,
					row: drag.fromRow + clamped.deltaRow,
					pitch: drag.fromPitch + clamped.deltaPitch
				};
			},
			() => {
				if (drag?.kind === 'move') {
					const deltaRow = drag.row - drag.fromRow;
					const deltaPitch = drag.pitch - drag.fromPitch;
					if (deltaRow !== 0 || deltaPitch !== 0) {
						for (const item of drag.group) {
							blockFadeHold.add(
								`${item.orderIndex}:${item.patternId}:${item.localStartRow}:${item.pitchIndex}`
							);
						}
						blockFadeSkipIn = true;
						if (drag.group.length > 1) {
							commitSelectionMove(drag.group, deltaRow, deltaPitch, {
								orderIndex: drag.fromOrder,
								patternId: drag.fromPatternId,
								localStartRow: drag.fromLocal,
								startRow: drag.fromRow,
								pitchIndex: drag.fromPitch
							});
						}
						else {
							commitMove(
								{
									orderIndex: drag.fromOrder,
									patternId: drag.fromPatternId,
									localStartRow: drag.fromLocal,
									startRow: drag.fromRow,
									pitchIndex: drag.fromPitch
								},
								drag.row,
								drag.pitch,
								false
							);
						}
					}
				}
				drag = null;
			}
		);
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
			dismissEffectEditor();
			dismissValueEditor();
			clearLane(point.row);
			return;
		}
		if (activeLane.kind === 'effect') {
			event.preventDefault();
			openEffectEditor(point.row);
			return;
		}
		if (laneValueIsTyped(activeLane)) {
			event.preventDefault();
			openValueEditor(point.row);
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
					if (hitBlock) {
						const span = spanForOrder(hitBlock.orderIndex);
						if (span) {
							toggleSelected(selectionFor(span, hitBlock.localStartRow, hitBlock.pitchIndex));
						}
					} else if (!additive) {
						applySelection([]);
					}
					return;
				}
				const picked: NoteSelection[] = [];
				for (const block of notes.blocks) {
					if (!blockIntersectsMarquee(block, current, metrics)) continue;
					const item = noteBlock(block);
					const span = item ? spanForOrder(item.orderIndex) : null;
					if (!item || !span) continue;
					picked.push(selectionFor(span, item.localStartRow, item.pitchIndex));
				}
				applySelection(additive ? mergeSelections(workingSelection(), picked) : picked);
			}
		);
	}

	function copySelection(): void {
		if (!selected || !noteKey) return;
		const captured: CapturedPianoNote[] = [];
		for (const target of workingSelection()) {
			const block = notes.blocks.find(
				(item) => item.startRow === target.startRow && item.pitchIndex === target.pitchIndex
			);
			if (block?.conflict) {
				captured.push({
					absoluteRow: target.startRow,
					rowOffset: 0,
					note: block.note,
					length: Math.max(1, block.endRow - block.startRow),
					bounded: true,
					release: false,
					fields:
						block.instrument && block.instrument > 0 ? { instrument: block.instrument } : {}
				});
				continue;
			}
			const source = patternById.get(target.patternId);
			if (!source) continue;
			const rows = cachedGeneric(source).channels[selected.channelIndex]?.rows;
			if (!rows) continue;
			const note = capturePianoNote(rows, noteKey, target.localStartRow, target.startRow);
			if (note) captured.push(note);
		}
		const clipboard = clipboardFromCaptures(captured);
		if (clipboard.length > 0) pianoRollClipboard.set(clipboard);
	}

	function removeTargets(targets: NoteSelection[]): boolean {
		if (playbackStore.isPlaying || !converter || !selected || !noteKey || targets.length === 0) {
			return false;
		}
		if (targets.some((target) => blockIsConflict(target)) || heldIntents().length > 0) {
			const keys = new Set(targets.map((target) => selectionKey(target)));
			const next = allIntents().filter((note) => !keys.has(`${note.startRow}:${note.pitchIndex}`));
			const first = targets[0];
			if (!first) return false;
			return commitIntents(next, null, null, first.orderIndex, first.localStartRow).changed;
		}
		const groups = new Map<number, { before: Pattern; generic: GenericPattern; rows: number[] }>();
		for (const target of targets) {
			const item = patternById.get(target.patternId);
			if (!item) continue;
			let entry = groups.get(item.id);
			if (!entry) {
				entry = { before: item, generic: converter.toGeneric(item), rows: [] };
				groups.set(item.id, entry);
			}
			entry.rows.push(target.localStartRow);
		}
		const generics = new Map<number, { before: Pattern; generic: GenericPattern }>();
		for (const entry of groups.values()) {
			generics.set(entry.before.id, { before: entry.before, generic: entry.generic });
		}
		const tails = new Set<number>();
		for (const target of targets) {
			const span = spanForOrder(target.orderIndex);
			if (!span || !generics.has(span.patternId)) continue;
			for (const id of clearOpenTail(generics, span, target.localStartRow)) tails.add(id);
		}
		const edits = new Map<number, { before: Pattern; after: Pattern }>();
		for (const entry of groups.values()) {
			if (!removePitchedNotes(entry.generic, selected.channelIndex, noteKey, entry.rows)) continue;
			edits.set(entry.before.id, {
				before: entry.before,
				after: converter.fromGeneric(entry.generic)
			});
		}
		for (const id of tails) {
			if (edits.has(id)) continue;
			const entry = generics.get(id);
			if (!entry) continue;
			edits.set(id, { before: entry.before, after: converter.fromGeneric(entry.generic) });
		}
		if (edits.size === 0) return false;
		const first = targets[0];
		if (!first) return false;
		commitEdits(selected.songIndex, edits, first.orderIndex, first.localStartRow);
		return true;
	}

	function cutSelection(): void {
		if (playbackStore.isPlaying) return;
		const targets = workingSelection();
		copySelection();
		if (removeTargets(targets)) applySelection([]);
	}

	function pasteClipboard(): void {
		const clips = pianoRollClipboard.get();
		if (
			!clips ||
			clips.length === 0 ||
			playbackStore.isPlaying ||
			!converter ||
			!selected ||
			!noteKey
		) {
			return;
		}
		const groups = new Map<
			number,
			{
				before: Pattern;
				generic: GenericPattern;
				notes: PianoPasteNote[];
				orderIndex: number;
				localRow: number;
			}
		>();
		const placed: NoteSelection[] = [];
		const incoming: IntentNote[] = [];
		for (const clip of clips) {
			const located = timelineSpanAt(timeline, cursorRow + clip.rowOffset);
			if (!located) continue;
			const parsed = parseNoteFromString(clip.note);
			const pitchIndex = noteToTuningTableIndex(parsed.noteName, parsed.octave);
			if (pitchIndex === null) continue;
			const item = patternById.get(located.span.patternId);
			if (!item) continue;
			let entry = groups.get(item.id);
			if (!entry) {
				entry = {
					before: item,
					generic: converter.toGeneric(item),
					notes: [],
					orderIndex: located.span.orderIndex,
					localRow: located.localRow
				};
				groups.set(item.id, entry);
			}
			entry.notes.push({ ...clip, localRow: located.localRow });
			placed.push(selectionFor(located.span, located.localRow, pitchIndex));
			const instrument = clip.fields.instrument;
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
		const overlaps = incoming.some(
			(note) =>
				existing.some((other) =>
					rangesOverlap(note.startRow, note.length, other.startRow, other.length)
				) ||
				incoming.some(
					(other) =>
						other !== note &&
						rangesOverlap(note.startRow, note.length, other.startRow, other.length)
				)
		);
		if (overlaps) {
			const first = incoming[0];
			const home = first ? timelineSpanAt(timeline, first.startRow) : null;
			if (first && home) {
				commitIntents(
					[...existing, ...incoming],
					first.startRow,
					first.pitchIndex,
					home.span.orderIndex,
					home.localRow
				);
				applySelection(placed);
			}
			return;
		}
		const edits = new Map<number, { before: Pattern; after: Pattern }>();
		for (const entry of groups.values()) {
			const rows = entry.generic.channels[selected.channelIndex]?.rows;
			if (!rows || !pastePianoNotes(rows, noteKey, entry.notes)) continue;
			edits.set(entry.before.id, {
				before: entry.before,
				after: converter.fromGeneric(entry.generic)
			});
		}
		if (edits.size === 0) return;
		const first = placed[0];
		if (!first) return;
		commitEdits(selected.songIndex, edits, first.orderIndex, first.localStartRow);
		applySelection(placed);
	}

	function handleClipboardShortcut(event: KeyboardEvent): boolean {
		const action = keybindingsStore.getActionForShortcut(ShortcutString.fromEvent(event));
		if (action !== ACTION_COPY && action !== ACTION_CUT && action !== ACTION_PASTE) return false;
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
			if (selectedNotes.length > 0) {
				if (removeTargets(selectedNotes)) applySelection([]);
				return;
			}
			const selection = visibleSelection;
			const span = selection
				? spanForOrder(selection.orderIndex)
				: spanForOrder(currentPatternOrderIndex);
			const localRow = selection ? selection.localStartRow : selectedRow;
			if (span) clearNote(span, localRow);
			return;
		}
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			nudge(event.key, event.shiftKey);
			return;
		}
		if (event.repeat || !noteKey) return;
		const cursor = spanForOrder(currentPatternOrderIndex);
		const mapped = PatternNoteInput.mapKeyboardCodeToNote(event.code);
		if (!mapped || !cursor) return;
		const pitch = noteToTuningTableIndex(mapped.noteName, mapped.octave);
		if (pitch === null) return;
		event.preventDefault();
		placePitched(cursor, selectedRow, pitch, true, false);
	}

	function nudge(key: string, shift: boolean): void {
		const deltaRow = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
		const deltaPitch =
			key === 'ArrowUp' ? (shift ? 12 : 1) : key === 'ArrowDown' ? (shift ? -12 : -1) : 0;
		const group = workingSelection();
		if (group.length > 1) {
			const live = group.filter((item) =>
				notes.blocks.some(
					(block) => block.startRow === item.startRow && block.pitchIndex === item.pitchIndex
				)
			);
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
					Math.abs(item.startRow - cursorRow) < Math.abs(best.startRow - cursorRow) ? item : best
				);
				commitSelectionMove(moving, clamped.deltaRow, clamped.deltaPitch, anchor, true);
				return;
			}
			const only = live[0];
			if (only) {
				commitMove(
					only,
					clamp(only.startRow + deltaRow, 0, metrics.columns - 1),
					clamp(only.pitchIndex + deltaPitch, 0, PIANO_ROLL_PITCH_COUNT - 1)
				);
				return;
			}
		}
		const selection = visibleSelection;
		if (!selection) {
			const delta = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
			moveCursorTo(cursorRow + delta);
			return;
		}
		commitMove(
			selection,
			clamp(selection.startRow + deltaRow, 0, metrics.columns - 1),
			clamp(selection.pitchIndex + deltaPitch, 0, PIANO_ROLL_PITCH_COUNT - 1)
		);
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
		dismissEffectEditor();
		dismissValueEditor();
	}

	function effectEditorLeft(absoluteRow: number): number {
		const width = 176;
		const x = absoluteRow * rowWidth - scrollX;
		const max = Math.max(0, (laneViewport?.clientWidth ?? width) - width);
		return Math.max(0, Math.min(x, max));
	}

	function dismissEffectEditor(): void {
		effectEditor = null;
		effectEditorListener?.();
		effectEditorListener = null;
	}

	function ensureEffectEditorListener(): void {
		if (effectEditorListener) return;
		const close = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && effectEditorRoot?.contains(target)) return;
			const current = effectEditor;
			if (current) writeEffect(current);
			dismissEffectEditor();
		};
		window.addEventListener('pointerdown', close);
		effectEditorListener = () => window.removeEventListener('pointerdown', close);
	}

	function writeEffect(editor: {
		patternId: number;
		localRow: number;
		orderIndex: number;
		text: string;
		original: string;
	}): void {
		if (!converter || !selected || !activeLane || activeLane.kind !== 'effect') return;
		const text = clampPianoEffectInput(editor.text);
		if (text === clampPianoEffectInput(editor.original)) return;
		const value = pianoEffectInputValue(text);
		if (value === undefined) return;
		const source = patternById.get(editor.patternId);
		if (!source) return;
		const generic = converter.toGeneric(source);
		const stored = value
			? {
					effect: value.effect,
					delay: value.delay,
					parameter: value.parameter,
					tableIndex: value.tableIndex
				}
			: null;
		if (!setPianoFieldValue(generic, activeLane, selected.channelIndex, editor.localRow, stored)) {
			return;
		}
		commitEdits(
			selected.songIndex,
			new Map([[source.id, { before: source, after: converter.fromGeneric(generic) }]]),
			editor.orderIndex,
			editor.localRow
		);
		const formatted = formatPianoEffectInput(value);
		editor.text = formatted;
		editor.original = formatted;
	}

	function dismissValueEditor(): void {
		valueEditor = null;
		valueEditorListener?.();
		valueEditorListener = null;
	}

	function ensureValueEditorListener(): void {
		if (valueEditorListener) return;
		const close = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && valueEditorRoot?.contains(target)) return;
			const current = valueEditor;
			if (current) writeValue(current);
			dismissValueEditor();
		};
		window.addEventListener('pointerdown', close);
		valueEditorListener = () => window.removeEventListener('pointerdown', close);
	}

	function songTuning(): number[] {
		return projectStore.songs[selected?.songIndex ?? -1]?.tuningTable ?? [];
	}

	function clampTypedText(text: string): string {
		if (!activeLane) return text;
		if (laneShowsNote(activeLane, editorStateStore.envelopeAsNote)) return clampPianoNoteInput(text);
		if (activeLane.fieldType === 'hex') return clampPianoHexInput(text, activeLane.length);
		return clampPianoSymbolInput(text, activeLane.length);
	}

	function parseTypedText(text: string): number | undefined {
		if (!activeLane) return undefined;
		if (laneShowsNote(activeLane, editorStateStore.envelopeAsNote)) {
			return pianoNoteInputPeriod(text, songTuning());
		}
		if (activeLane.fieldType === 'hex') {
			return pianoHexInputValue(text, activeLane.length, activeLane.allowZeroValue);
		}
		return pianoSymbolInputValue(text, activeLane.length, activeLane.allowZeroValue);
	}

	function formatTypedValue(value: unknown): string {
		if (!activeLane) return '';
		return formatPianoTypedLabel(value, activeLane, editorStateStore.envelopeAsNote, songTuning());
	}

	function writeTypedNumber(
		patternId: number,
		localRow: number,
		orderIndex: number,
		value: number
	): boolean {
		if (!converter || !selected || !activeLane) return false;
		const source = patternById.get(patternId);
		if (!source) return false;
		const generic = converter.toGeneric(source);
		if (!setPianoFieldValue(generic, activeLane, selected.channelIndex, localRow, value)) {
			return false;
		}
		commitEdits(
			selected.songIndex,
			new Map([[source.id, { before: source, after: converter.fromGeneric(generic) }]]),
			orderIndex,
			localRow
		);
		return true;
	}

	function writeValue(editor: {
		patternId: number;
		localRow: number;
		orderIndex: number;
		text: string;
		original: string;
	}): void {
		if (!laneValueIsTyped(activeLane)) return;
		const text = clampTypedText(editor.text);
		if (text === clampTypedText(editor.original)) return;
		const value = parseTypedText(text);
		if (value === undefined) return;
		if (!writeTypedNumber(editor.patternId, editor.localRow, editor.orderIndex, value)) return;
		const formatted = formatTypedValue(value);
		editor.text = formatted;
		editor.original = formatted;
	}

	function openValueEditor(absoluteRow: number): void {
		if (playbackStore.isPlaying || !laneValueIsTyped(activeLane) || !activeLane || !converter || !selected) {
			return;
		}
		const current = valueEditor;
		if (current && current.absoluteRow !== absoluteRow) writeValue(current);
		dismissEffectEditor();
		const located = timelineSpanAt(timeline, absoluteRow);
		if (!located) return;
		const item = patternById.get(located.span.patternId);
		if (!item) return;
		const raw = readPianoFieldValue(
			converter.toGeneric(item),
			activeLane,
			selected.channelIndex,
			located.localRow
		);
		const text = formatTypedValue(raw);
		focusLocation(located.span, located.localRow);
		valueEditor = {
			absoluteRow,
			orderIndex: located.span.orderIndex,
			patternId: located.span.patternId,
			localRow: located.localRow,
			text,
			original: text,
			left: effectEditorLeft(absoluteRow)
		};
		ensureValueEditorListener();
		void tick().then(() => valueInput?.select());
	}

	function onValueEditorInput(event: Event): void {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement) || !valueEditor || !activeLane) return;
		const next = clampTypedText(input.value);
		if (input.value !== next) {
			const caret = input.selectionStart ?? next.length;
			input.value = next;
			const pos = Math.min(caret, next.length);
			input.setSelectionRange(pos, pos);
		}
		if (valueEditor.text !== next) valueEditor.text = next;
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
		const tuning = songTuning();
		if (!mapped || tuning.length === 0) return;
		const pitch = noteToTuningTableIndex(mapped.noteName, mapped.octave);
		if (pitch === null) return;
		const located = timelineSpanAt(timeline, cursorRow);
		if (!located) return;
		event.preventDefault();
		dismissValueEditor();
		writeTypedNumber(
			located.span.patternId,
			located.localRow,
			located.span.orderIndex,
			noteToEnvelopePeriod(pitch, tuning)
		);
	}

	function onValueEditorKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			dismissValueEditor();
			return;
		}
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const current = valueEditor;
		if (!current) return;
		writeValue(current);
		const next = timelineSpanAt(timeline, current.absoluteRow + 1);
		if (!next) {
			dismissValueEditor();
			return;
		}
		openValueEditor(current.absoluteRow + 1);
	}

	function openEffectEditor(absoluteRow: number): void {
		if (playbackStore.isPlaying || !activeLane || activeLane.kind !== 'effect' || !converter || !selected) {
			return;
		}
		dismissValueEditor();
		const current = effectEditor;
		if (current && current.absoluteRow !== absoluteRow) writeEffect(current);
		const located = timelineSpanAt(timeline, absoluteRow);
		if (!located) return;
		const item = patternById.get(located.span.patternId);
		if (!item) return;
		const raw = readPianoFieldValue(
			converter.toGeneric(item),
			activeLane,
			selected.channelIndex,
			located.localRow
		);
		const text = formatPianoEffectInput(raw);
		focusLocation(located.span, located.localRow);
		effectEditor = {
			absoluteRow,
			orderIndex: located.span.orderIndex,
			patternId: located.span.patternId,
			localRow: located.localRow,
			text,
			original: text,
			left: effectEditorLeft(absoluteRow)
		};
		ensureEffectEditorListener();
		void tick().then(() => effectInput?.select());
	}

	function applyEffectFormat(format: string): void {
		const current = effectEditor;
		if (!current) return;
		current.text = effectCommandFromFormat(format);
		writeEffect(current);
		void tick().then(() => effectInput?.select());
	}

	function onEffectEditorInput(event: Event): void {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement) || !effectEditor) return;
		const next = clampPianoEffectInput(input.value);
		if (input.value !== next) {
			const caret = input.selectionStart ?? next.length;
			input.value = next;
			const pos = Math.min(caret, next.length);
			input.setSelectionRange(pos, pos);
		}
		if (effectEditor.text !== next) effectEditor.text = next;
	}

	function onEffectEditorKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			dismissEffectEditor();
			return;
		}
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const current = effectEditor;
		if (!current) return;
		writeEffect(current);
		const next = timelineSpanAt(timeline, current.absoluteRow + 1);
		if (!next) {
			dismissEffectEditor();
			return;
		}
		openEffectEditor(current.absoluteRow + 1);
	}

	function closeLaneMenu(): void {
		laneMenuOpen = false;
		closeLaneMenuListener?.();
		closeLaneMenuListener = null;
	}

	function toggleLaneMenu(): void {
		if (laneMenuOpen) {
			closeLaneMenu();
			return;
		}
		laneMenuOpen = true;
		const close = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && laneMenuRoot?.contains(target)) return;
			closeLaneMenu();
		};
		window.addEventListener('pointerdown', close);
		closeLaneMenuListener = () => window.removeEventListener('pointerdown', close);
	}
</script>

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
		<div class="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-app-text-tertiary)]">
				<span>Time</span>
				<button
					type="button"
					class="cursor-pointer rounded-sm border border-[var(--color-app-border)] px-1"
					onclick={() => (rowWidth = clamp(rowWidth - 2, 8, 40))}>−</button>
				<button
					type="button"
					class="cursor-pointer rounded-sm border border-[var(--color-app-border)] px-1"
					onclick={() => (rowWidth = clamp(rowWidth + 2, 8, 40))}>+</button>
				<span>Pitch</span>
				<button
					type="button"
					class="cursor-pointer rounded-sm border border-[var(--color-app-border)] px-1"
					onclick={() => (keyHeight = clamp(keyHeight - 2, 8, 28))}>−</button>
				<button
					type="button"
					class="cursor-pointer rounded-sm border border-[var(--color-app-border)] px-1"
					onclick={() => (keyHeight = clamp(keyHeight + 2, 8, 28))}>+</button>
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
			<div class="flex shrink-0 flex-col border-r border-[var(--color-app-border)]" style:width="{KEYBOARD_WIDTH}px">
				<div class="shrink-0 border-b border-[var(--color-app-border)]" style:height="{RULER_HEIGHT}px"></div>
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
					onkeyup={() => stopPreview()}
					oncontextmenu={onGridContextMenu}>
				</canvas>
			</div>
		</div>
	{/if}
	<div
		class="relative z-20 flex shrink-0 border-t border-[var(--color-app-border)]"
		style:height="{LANE_HEIGHT}px">
		{#if effectEditor}
			<div
				bind:this={effectEditorRoot}
				class="absolute z-40 mb-1 flex max-h-64 w-44 flex-col overflow-hidden rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] shadow-lg"
				style:left="{KEYBOARD_WIDTH + effectEditor.left}px"
				style:bottom="100%">
				{#key effectEditor.absoluteRow}
					<div
						class="relative m-1 w-fit rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-bg)]">
						<div
							class="pointer-events-none flex px-1.5 py-1 font-mono text-[13px] leading-none"
							aria-hidden="true">
							{#each effectEditorGlyphs as glyph, index (index)}
								<span class="inline-block w-[1ch] text-center" style:color={glyph.color}
									>{glyph.char}</span>
							{/each}
						</div>
						<input
							bind:this={effectInput}
							bind:value={effectEditor.text}
							maxlength="4"
							class="absolute inset-0 w-full bg-transparent px-1.5 py-1 font-mono text-[13px] leading-none text-transparent uppercase caret-[var(--color-app-text-primary)] outline-none"
							aria-label="Effect command"
							spellcheck="false"
							autocomplete="off"
							oninput={onEffectEditorInput}
							onkeydown={onEffectEditorKeydown} />
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
							<span class="min-w-0 flex-1 truncate text-[11px] text-[var(--color-app-text-primary)]">
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
		{/if}
		{#if valueEditor}
			<div
				bind:this={valueEditorRoot}
				class="absolute z-40 mb-1 rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] p-1 shadow-lg"
				style:left="{KEYBOARD_WIDTH + valueEditor.left}px"
				style:bottom="100%">
				<input
					bind:this={valueInput}
					bind:value={valueEditor.text}
					maxlength={typedInputMaxLength}
					class="rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-bg)] px-1.5 py-1 text-center font-mono text-[13px] uppercase outline-none {(activeLane?.length ?? 2) <= 1 ? 'w-8' : 'w-12'}"
					style:color={typedLaneColor}
					aria-label={activeLane?.label ?? 'Value'}
					spellcheck="false"
					autocomplete="off"
					oninput={onValueEditorInput}
					onkeydown={onValueEditorKeydown} />
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
				{activeLane?.isGlobal ? `Chip · ${activeLane.label}` : (activeLane?.label ?? '')}
			</span>
			{#if laneMenuOpen}
				<div
					class="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-44 overflow-auto rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] py-1 shadow-lg">
					{#each lanes as lane (lane.key)}
						<button
							type="button"
							class="block w-full cursor-pointer px-2 py-1 text-left text-[11px] {lane.key === activeLane?.key
								? 'bg-[var(--color-app-surface-active)] text-[var(--color-app-text-primary)]'
								: 'text-[var(--color-app-text-secondary)] hover:bg-[var(--color-app-surface-hover)]'}"
							onclick={() => selectLane(lane)}>
							{lane.isGlobal ? `Chip · ${lane.label}` : lane.label}
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
				class="block outline-none {activeLane?.kind === 'effect' || laneValueIsTyped(activeLane)
					? 'cursor-text'
					: ''}"
				onmousedown={onLaneMouseDown}
				onkeydown={onLaneKeyDown}
				oncontextmenu={(event) => event.preventDefault()}>
			</canvas>
		</div>
	</div>
</div>
