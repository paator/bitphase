import { getContext } from 'svelte';
import type { Chip } from '../types';
import type { Pattern } from '../../models/song';
import type { PreviewNoteSupport } from './processor';
import type { AudioService } from '../../services/audio/audio-service';
import { formatNoteFromEnum, midiNoteToNoteString } from '../../utils/note-utils';
import { PatternNoteInput } from '../../services/pattern/editing/pattern-note-input';
import { editorStateStore } from '../../stores/editor-state.svelte';
import { settingsStore } from '../../stores/settings.svelte';
import { midiService } from '../../services/midi/midi-service';
import { playbackStore } from '../../stores/playback.svelte';
import { projectStore } from '../../stores/project.svelte';
import { keybindingsStore } from '../../stores/keybindings.svelte';
import { ShortcutString } from '../../utils/shortcut-string';
import { ACTION_TOGGLE_PLAYBACK } from '../../config/keybindings';
import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
import {
	buildPreviewPattern,
	clampVolumeInput,
	filterVolumeInput,
	notesForProcessor,
	sanitizeTableInput
} from './preview-row-utils';

const ROW_INDEX = 0;

export type ChipPreviewPlaygroundOptions = {
	getChip: () => Chip;
	getInstrumentId: () => string;
	decoratePreviewPattern?: (pattern: Pattern) => void;
	onMidiNote?: (midiNote: number, velocity: number) => boolean;
};

export function createChipPreviewPlayground(options: ChipPreviewPlaygroundOptions) {
	let table = $state('');
	let volume = $state('F');
	let activeNotes = $state<Array<{ key: string; note: string }>>([]);
	let lastPlayedNotes = $state<string[]>(['C-4']);
	let isPreviewPlaying = $state(false);
	let noteInputEl = $state<HTMLDivElement | null>(null);

	const containerContext: { audioService: AudioService } = getContext('container');
	const audioService = containerContext.audioService;
	let registerPreviewSpaceHandler: ((fn: (() => void) | null) => void) | undefined;
	try {
		registerPreviewSpaceHandler = getContext('registerPreviewSpaceHandler');
	} catch {
		registerPreviewSpaceHandler = undefined;
	}

	let hadActiveNotes = false;
	let wasPlaying = false;
	let prevInstruments: typeof projectStore.instruments | undefined;
	let prevTables: typeof projectStore.tables | undefined;
	let savedStereoLayout: string | undefined;

	const channelCount = $derived(options.getChip().schema.channelLabels?.length ?? 3);
	const previewProcessors = $derived(
		audioService.chipProcessors.filter(
			(p) => p.chip === options.getChip() && 'playPreviewRow' in p && p.isAudioNodeAvailable()
		)
	);
	const maxPoly = $derived(previewProcessors.length * channelCount);
	const isDisabled = $derived(playbackStore.isPlaying);
	const playDisabled = $derived(isDisabled || lastPlayedNotes.length === 0);
	const effectiveNoteStrings = $derived(
		isPreviewPlaying ? lastPlayedNotes : activeNotes.map((n) => n.note)
	);
	const noteDisplay = $derived(
		activeNotes.length > 0
			? activeNotes.map((n) => n.note).join(' ')
			: lastPlayedNotes.length > 0
				? lastPlayedNotes.join(' ')
				: '—'
	);
	const playbackShortcutDisplay = $derived(
		ShortcutString.toDisplay(keybindingsStore.getShortcut(ACTION_TOGGLE_PLAYBACK))
	);
	const playButtonTitle = $derived(
		isPreviewPlaying
			? `Stop preview (${playbackShortcutDisplay})`
			: `Play preview (${playbackShortcutDisplay})`
	);
	const noteTitle = $derived(
		`Click to focus, then use keyboard. Polyphony: ${maxPoly} notes (${channelCount} per chip). Piano: Z–P, Q–I; A = OFF; letters = note with current octave. ${playbackShortcutDisplay} = toggle play.`
	);

	$effect(() => {
		if (isDisabled && !wasPlaying) {
			activeNotes = [];
			isPreviewPlaying = false;
		}
		wasPlaying = isDisabled;
	});

	$effect(() => {
		const instruments = projectStore.instruments;
		const tables = projectStore.tables;
		const playing = isPreviewPlaying;
		if (!playing) {
			prevInstruments = instruments;
			prevTables = tables;
			return;
		}
		if (prevInstruments !== instruments || prevTables !== tables) {
			prevInstruments = instruments;
			prevTables = tables;
			isPreviewPlaying = false;
			queueMicrotask(() => {
				isPreviewPlaying = true;
			});
		}
	});

	$effect(() => {
		return () => {
			if (savedStereoLayout !== undefined) {
				audioService.chipSettings
					.forChip(options.getChip().type)
					.set('stereoLayout', savedStereoLayout);
				savedStereoLayout = undefined;
			}
		};
	});

	$effect(() => {
		const chip = options.getChip();
		const instrumentId = options.getInstrumentId();
		const processors = previewProcessors as unknown as PreviewNoteSupport[];
		if (processors.length === 0) return;
		const hasNotes = effectiveNoteStrings.length > 0;
		const chipSettings = audioService.chipSettings.forChip(chip.type);
		if (!hasNotes) {
			if (hadActiveNotes) {
				hadActiveNotes = false;
				processors.forEach((proc) => proc.stopPreviewNote());
				audioService.setPreviewActiveForChips(null);
				if (savedStereoLayout !== undefined) {
					chipSettings.set('stereoLayout', savedStereoLayout);
					savedStereoLayout = undefined;
				}
			}
			return;
		}
		const stereoLayoutSetting = chip.schema.settings?.find(
			(setting) => setting.key === 'stereoLayout'
		);
		if (stereoLayoutSetting && savedStereoLayout === undefined) {
			savedStereoLayout =
				(chipSettings.get('stereoLayout') as string) ??
				String(stereoLayoutSetting.defaultValue ?? 'mono');
			chipSettings.set('stereoLayout', 'mono');
		}
		hadActiveNotes = true;
		const chipIndices = audioService.chipProcessors
			.map((p, i) => (p.chip === chip ? i : -1))
			.filter((i) => i >= 0);
		if (chipIndices.length > 0) {
			audioService.setPreviewActiveForChips(chipIndices);
		}
		const normalizedId = instrumentId.toUpperCase().padStart(2, '0');
		const currentInstrument = instrumentId
			? filterInstrumentsForChip(projectStore.instruments, chip.type).find(
					(i) => i.id.toUpperCase().padStart(2, '0') === normalizedId
				)
			: undefined;
		processors.forEach((proc, processorIndex) => {
			const channelNotes = notesForProcessor(
				effectiveNoteStrings,
				processorIndex,
				channelCount
			);
			const pattern = buildPreviewPattern({
				schema: chip.schema,
				instrumentId,
				table,
				volume,
				noteStrings: channelNotes
			});
			options.decoratePreviewPattern?.(pattern);
			proc.playPreviewRow(pattern, ROW_INDEX, currentInstrument);
		});
	});

	$effect(() => {
		const keys = activeNotes.map((n) => n.key);
		if (keys.length === 0) return;
		function onWindowKeyUp(e: KeyboardEvent) {
			const action = keybindingsStore.getActionForShortcut(ShortcutString.fromEvent(e));
			if (action === ACTION_TOGGLE_PLAYBACK) return;
			if (keys.includes(e.key)) {
				const nextNotes = activeNotes.filter((n) => n.key !== e.key);
				if (nextNotes.length === 0) {
					lastPlayedNotes = activeNotes.map((n) => n.note);
				}
				activeNotes = nextNotes;
			}
		}
		window.addEventListener('keyup', onWindowKeyUp);
		return () => window.removeEventListener('keyup', onWindowKeyUp);
	});

	$effect(() => {
		if (!settingsStore.midiInputDeviceId || isDisabled || !midiService.isSupported()) return;
		return midiService.addNoteListener((midiNote: number, velocity: number) => {
			if (options.onMidiNote?.(midiNote, velocity)) return;
			const noteFocused = noteInputEl && document.activeElement === noteInputEl;
			if (!noteFocused) return;
			if (velocity > 0) {
				if (activeNotes.length >= maxPoly) return;
				if (activeNotes.some((n) => n.key === `midi-${midiNote}`)) return;
				const noteStr = midiNoteToNoteString(midiNote);
				if (!noteStr) return;
				activeNotes = [...activeNotes, { key: `midi-${midiNote}`, note: noteStr }];
			} else {
				const nextNotes = activeNotes.filter((n) => n.key !== `midi-${midiNote}`);
				if (nextNotes.length === 0 && activeNotes.length > 0) {
					lastPlayedNotes = activeNotes.map((n) => n.note);
				}
				activeNotes = nextNotes;
			}
		});
	});

	$effect(() => {
		registerPreviewSpaceHandler?.(togglePreviewPlaying);
		return () => registerPreviewSpaceHandler?.(null);
	});

	function togglePreviewPlaying() {
		if (playDisabled) return;
		isPreviewPlaying = !isPreviewPlaying;
	}

	function handleNoteKeyDown(event: KeyboardEvent) {
		if (isDisabled) return;
		if (event.repeat) return;
		const key = event.key;
		if (activeNotes.some((n) => n.key === key)) return;
		if (activeNotes.length >= maxPoly) return;
		const keyLower = key.toLowerCase();
		let noteStr: string;
		const pianoNote = PatternNoteInput.mapKeyboardCodeToNote(event.code);
		if (pianoNote) {
			event.preventDefault();
			noteStr = formatNoteFromEnum(pianoNote.noteName, pianoNote.octave);
		} else if (keyLower === 'a') {
			event.preventDefault();
			noteStr = 'OFF';
		} else {
			const letterNote = PatternNoteInput.getLetterNote(event.key);
			if (letterNote) {
				event.preventDefault();
				noteStr = formatNoteFromEnum(letterNote, editorStateStore.octave);
			} else return;
		}
		activeNotes = [...activeNotes, { key, note: noteStr }];
	}

	function handleNoteKeyUp(event: KeyboardEvent) {
		if (isDisabled) return;
		const key = event.key;
		if (!activeNotes.some((n) => n.key === key)) return;
		const nextNotes = activeNotes.filter((n) => n.key !== key);
		if (nextNotes.length === 0) {
			lastPlayedNotes = activeNotes.map((n) => n.note);
		}
		activeNotes = nextNotes;
	}

	function handleNoteBlur() {
		if (activeNotes.length > 0) {
			lastPlayedNotes = activeNotes.map((n) => n.note);
		}
		activeNotes = [];
	}

	function focusNoteInput() {
		noteInputEl?.focus();
	}

	function ensureMidiAccess() {
		if (
			settingsStore.midiInputDeviceId &&
			midiService.isSupported() &&
			!midiService.hasAccess()
		) {
			midiService.requestAccess();
		}
	}

	function handleTableInput(event: Event) {
		table = sanitizeTableInput((event.currentTarget as HTMLInputElement).value || '');
	}

	function clampTable() {
		table = sanitizeTableInput(table);
	}

	function handleVolumeInput(event: Event) {
		volume = filterVolumeInput((event.currentTarget as HTMLInputElement).value || '', volume);
	}

	function clampVolume() {
		volume = clampVolumeInput(volume);
	}

	return {
		get table() {
			return table;
		},
		set table(value: string) {
			table = value;
		},
		get volume() {
			return volume;
		},
		set volume(value: string) {
			volume = value;
		},
		get noteInputEl() {
			return noteInputEl;
		},
		set noteInputEl(value: HTMLDivElement | null) {
			noteInputEl = value;
		},
		get isPreviewPlaying() {
			return isPreviewPlaying;
		},
		get isDisabled() {
			return isDisabled;
		},
		get playDisabled() {
			return playDisabled;
		},
		get noteDisplay() {
			return noteDisplay;
		},
		get playButtonTitle() {
			return playButtonTitle;
		},
		get noteTitle() {
			return noteTitle;
		},
		togglePreviewPlaying,
		handleNoteKeyDown,
		handleNoteKeyUp,
		handleNoteBlur,
		focusNoteInput,
		ensureMidiAccess,
		handleTableInput,
		clampTable,
		handleVolumeInput,
		clampVolume
	};
}
