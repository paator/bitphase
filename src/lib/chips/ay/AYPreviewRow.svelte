<script lang="ts">
	import type { Chip } from '../types';
	import type { Pattern } from '../../models/song';
	import { Pattern as PatternModel, Note } from '../../models/song';
	import type { PreviewNoteSupport } from '../base/processor';
	import type { AudioService } from '../../services/audio/audio-service';
	import { getContext } from 'svelte';
	import {
		parseNoteFromString,
		formatNoteFromEnum,
		midiNoteToNoteString
	} from '../../utils/note-utils';
	import { PatternNoteInput } from '../../services/pattern/editing/pattern-note-input';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { settingsStore } from '../../stores/settings.svelte';
	import { midiService } from '../../services/midi/midi-service';
	import { instrumentIdToNumber } from '../../utils/instrument-id';
	import { playbackStore } from '../../stores/playback.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import {
		envelopePeriodToNoteString,
		noteStringToEnvelopePeriod
	} from '../../utils/envelope-note-conversion';
	import IconCarbonPlay from '~icons/carbon/play';
	import IconCarbonPauseFilled from '~icons/carbon/pause-filled';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import { ACTION_TOGGLE_PLAYBACK } from '../../config/keybindings';

	let {
		chip,
		instrumentId = '01',
		tuningTable = []
	}: {
		chip: Chip;
		instrumentId?: string;
		tuningTable?: number[];
	} = $props();

	const ROW_INDEX = 0;
	const containerContext: { audioService: AudioService } = getContext('container');
	let registerPreviewSpaceHandler: ((fn: (() => void) | null) => void) | undefined;
	try {
		registerPreviewSpaceHandler = getContext('registerPreviewSpaceHandler');
	} catch {
		registerPreviewSpaceHandler = undefined;
	}
	const schema = chip.schema;

	let envelopePeriod = $state(0);
	let noiseValue = $state('00');
	let envelopeShape = $state('');
	let table = $state('');
	let volume = $state('F');
	let activeNotes = $state<Array<{ key: string; note: string }>>([]);
	let lastPlayedNotes = $state<string[]>(['C-4']);
	let isPreviewPlaying = $state(false);
	let noteInputEl: HTMLDivElement | null = $state(null);
	let envelopeInputEl: HTMLDivElement | null = $state(null);

	const envelopeAsNote = $derived(editorStateStore.envelopeAsNote);
	const canEnvelopeAsNote = $derived(envelopeAsNote && tuningTable.length > 0);
	const envelopeHexValue = $derived((envelopePeriod >>> 0).toString(16).toUpperCase().padStart(4, '0'));
	const envelopeDisplayValue = $derived(
		canEnvelopeAsNote
			? (envelopePeriodToNoteString(envelopePeriod, tuningTable) ??
					(envelopePeriod >>> 0).toString(16).toUpperCase().padStart(4, '0'))
			: (envelopePeriod >>> 0).toString(16).toUpperCase().padStart(4, '0')
	);
	let envelopeHexInput = $state('0000');
	let envelopeHexFocused = $state(false);

	const previewProcessors = $derived(
		containerContext.audioService.chipProcessors.filter(
			(p) => p.chip === chip && 'playPreviewRow' in p && p.isAudioNodeAvailable()
		)
	);
	const maxPoly = $derived(previewProcessors.length * 3);

	const isDisabled = $derived(playbackStore.isPlaying);

	let hadActiveNotes = $state(false);
	let wasPlaying = $state(false);

	$effect(() => {
		if (isDisabled && !wasPlaying) {
			activeNotes = [];
			isPreviewPlaying = false;
		}
		wasPlaying = isDisabled;
	});

	let prevInstruments: typeof projectStore.instruments | undefined = $state();
	let prevTables: typeof projectStore.tables | undefined = $state();

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

	const effectiveNoteStrings = $derived(
		isPreviewPlaying ? lastPlayedNotes : activeNotes.map((n) => n.note)
	);

	let savedStereoLayout: string | undefined = undefined;

	$effect(() => {
		return () => {
			if (savedStereoLayout !== undefined) {
				containerContext.audioService.chipSettings.set('stereoLayout', savedStereoLayout);
				savedStereoLayout = undefined;
			}
		};
	});

	$effect(() => {
		const processors = previewProcessors as unknown as PreviewNoteSupport[];
		if (processors.length === 0) return;
		const hasNotes = effectiveNoteStrings.length > 0;
		const chipSettings = containerContext.audioService.chipSettings;
		if (!hasNotes) {
			if (hadActiveNotes) {
				hadActiveNotes = false;
				processors.forEach((proc) => proc.stopPreviewNote());
				containerContext.audioService.setPreviewActiveForChips(null);
				if (savedStereoLayout !== undefined) {
					chipSettings.set('stereoLayout', savedStereoLayout);
					savedStereoLayout = undefined;
				}
			}
			return;
		}
		if (savedStereoLayout === undefined) {
			savedStereoLayout = (chipSettings.get('stereoLayout') as string) ?? 'ABC';
			chipSettings.set('stereoLayout', 'mono');
		}
		hadActiveNotes = true;
		const chipIndices = containerContext.audioService.chipProcessors
			.map((p, i) => (p.chip === chip ? i : -1))
			.filter((i) => i >= 0);
		if (chipIndices.length > 0) {
			containerContext.audioService.setPreviewActiveForChips(chipIndices);
		}
		const normalizedId = (instrumentId || '01').toUpperCase().padStart(2, '0');
		const currentInstrument = projectStore.instruments.find(
			(i) => i.id.toUpperCase().padStart(2, '0') === normalizedId
		);
		processors.forEach((proc, processorIndex) => {
			const start = processorIndex * 3;
			const channelNotes = [
				effectiveNoteStrings[start] ?? 'OFF',
				effectiveNoteStrings[start + 1] ?? 'OFF',
				effectiveNoteStrings[start + 2] ?? 'OFF'
			];
			proc.playPreviewRow(buildPreviewPattern(channelNotes), ROW_INDEX, currentInstrument);
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
		const remove = midiService.addNoteListener((midiNote: number, velocity: number) => {
			const noteFocused = noteInputEl && document.activeElement === noteInputEl;
			const envelopeFocused =
				canEnvelopeAsNote &&
				envelopeInputEl &&
				document.activeElement === envelopeInputEl;
			if (noteFocused) {
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
			} else if (envelopeFocused && velocity > 0) {
				const noteStr = midiNoteToNoteString(midiNote);
				if (!noteStr) return;
				const period = noteStringToEnvelopePeriod(
					noteStr,
					tuningTable,
					editorStateStore.octave
				);
				envelopePeriod = Math.max(0, Math.min(0xffff, period));
			}
		});
		return remove;
	});

	function togglePreviewPlaying() {
		if (isDisabled || lastPlayedNotes.length === 0) return;
		isPreviewPlaying = !isPreviewPlaying;
	}

	$effect(() => {
		registerPreviewSpaceHandler?.(togglePreviewPlaying);
		return () => registerPreviewSpaceHandler?.(null);
	});

	function parseHex4(s: string): number {
		const n = parseInt(s.replace(/[^0-9a-fA-F]/g, '').slice(0, 4) || '0', 16);
		return isNaN(n) ? 0 : Math.max(0, Math.min(0xffff, n));
	}

	function parseHex1(s: string): number {
		const n = parseInt(s.replace(/[^0-9a-fA-F]/g, '').slice(0, 1) || '0', 16);
		return isNaN(n) ? 0 : Math.max(0, Math.min(15, n));
	}

	function parseHex2(s: string): number {
		const n = parseInt(s.replace(/[^0-9a-fA-F]/g, '').slice(0, 2) || '0', 16);
		return isNaN(n) ? 0 : Math.max(0, Math.min(0x1f, n));
	}

	function parseTableChar(s: string): number {
		if (!s || s.length === 0) return 0;
		const c = s.toUpperCase().slice(0, 1);
		if (c >= '0' && c <= '9') return parseInt(c, 10);
		if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
		return 0;
	}

	function buildPreviewPattern(noteStrings: string[]): Pattern {
		const pattern = new PatternModel(0, 1, schema) as Pattern;
		const pr = pattern.patternRows[0];
		pr.envelopeValue = Math.max(0, Math.min(0xffff, envelopePeriod));
		pr.noiseValue = parseHex2(noiseValue);
		pr.envelopeEffect = null;

		const instNum = instrumentIdToNumber(instrumentId || '01') || 1;
		const vol = volume ? Math.max(1, Math.min(15, parseHex1(volume))) : 15;
		const shape = envelopeShape ? parseHex1(envelopeShape) : 0;
		const tbl = parseTableChar(table);

		for (let ch = 0; ch < 3; ch++) {
			const row = pattern.channels[ch].rows[0];
			row.instrument = instNum;
			row.envelopeShape = shape;
			row.table = tbl;
			row.volume = vol;
			row.effects = [null];
			const noteStr = noteStrings[ch] ?? 'OFF';
			const { noteName, octave } = parseNoteFromString(noteStr);
			row.note = new Note(noteName, octave);
		}
		return pattern;
	}

	function handleNoteKeyDown(event: KeyboardEvent) {
		if (isDisabled) return;
		if (event.repeat) return;
		const key = event.key;
		if (activeNotes.some((n) => n.key === key)) return;
		if (activeNotes.length >= maxPoly) return;
		const keyLower = key.toLowerCase();
		let noteStr: string;
		const pianoNote = PatternNoteInput.mapKeyboardKeyToNote(event.key);
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
				const octave = editorStateStore.octave;
				noteStr = formatNoteFromEnum(letterNote, octave);
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

	function clampEnvelopePeriod() {
		envelopePeriod = Math.max(0, Math.min(0xffff, envelopePeriod));
		envelopeHexInput = envelopeHexValue;
	}

	function handleEnvelopeNoteKeyDown(event: KeyboardEvent) {
		if (isDisabled || !canEnvelopeAsNote) return;
		event.preventDefault();
		const key = event.key;
		const keyLower = key.toLowerCase();
		let noteStr: string;
		const pianoNote = PatternNoteInput.mapKeyboardKeyToNote(key);
		if (pianoNote) {
			noteStr = formatNoteFromEnum(pianoNote.noteName, pianoNote.octave);
		} else if (keyLower === 'a') {
			envelopePeriod = 0;
			return;
		} else {
			const letterNote = PatternNoteInput.getLetterNote(key);
			if (!letterNote) return;
			const octave = editorStateStore.octave;
			noteStr = formatNoteFromEnum(letterNote, octave);
		}
		const period = noteStringToEnvelopePeriod(noteStr, tuningTable, editorStateStore.octave);
		envelopePeriod = Math.max(0, Math.min(0xffff, period));
	}

	function clampNoiseValue() {
		const s = noiseValue
			.replace(/[^0-9a-fA-F]/g, '')
			.slice(0, 2)
			.toUpperCase();
		noiseValue = s.padStart(2, '0') || '00';
	}

	function clampEnvelopeShape() {
		envelopeShape = envelopeShape
			.replace(/[^0-9a-fA-F]/g, '')
			.slice(0, 1)
			.toUpperCase();
	}

	function clampTable() {
		const c = table.slice(-1).toUpperCase();
		if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z')) table = c;
		else table = '';
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

	function clampVolume() {
		const v = volume
			.replace(/[^0-9a-fA-F]/g, '')
			.slice(0, 1)
			.toUpperCase();
		if (v) {
			const n = parseInt(v, 16);
			volume = n >= 1 && n <= 15 ? v : 'F';
		} else {
			volume = 'F';
		}
	}
</script>

<div data-ay-playground class="flex flex-col gap-2">
	<div
		class="flex items-center gap-1.5 text-xs text-[var(--color-app-text-muted)]"
		role="group"
		aria-label="Preview playground">
		<button
			type="button"
			class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-primary)] text-[var(--color-app-secondary)] transition-colors hover:bg-[var(--color-app-primary-hover)] disabled:pointer-events-none disabled:opacity-50"
			disabled={isDisabled || lastPlayedNotes.length === 0}
			title={isPreviewPlaying
				? `Stop preview (${ShortcutString.toDisplay(keybindingsStore.getShortcut(ACTION_TOGGLE_PLAYBACK))})`
				: `Play preview (${ShortcutString.toDisplay(keybindingsStore.getShortcut(ACTION_TOGGLE_PLAYBACK))})`}
			aria-label={isPreviewPlaying ? 'Stop preview' : 'Play preview'}
			onclick={togglePreviewPlaying}>
			{#if isPreviewPlaying}
				<IconCarbonPauseFilled class="h-3.5 w-3.5" />
			{:else}
				<IconCarbonPlay class="h-3.5 w-3.5" />
			{/if}
		</button>
		<span>Preview playground</span>
	</div>
	<div class="flex flex-wrap items-end gap-3 font-mono text-xs">
		<div class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Inst</span>
			<div
				class="flex h-7 w-8 items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase"
				title="Current instrument (select in Instruments panel)">
				{instrumentId}
			</div>
		</div>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Envelope</span>
			{#if canEnvelopeAsNote}
				<div
					bind:this={envelopeInputEl}
					class="flex h-7 w-14 items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 font-mono uppercase focus:border-[var(--color-app-primary)] focus:outline-none {isDisabled
						? 'pointer-events-none cursor-not-allowed opacity-50'
						: ''}"
					role="textbox"
					tabindex={isDisabled ? -1 : 0}
					aria-label="Envelope as note (keyboard: piano keys or letters)"
					title="Envelope as note. Piano: Z–P, Q–I; A = OFF; letters = note with current octave."
					onmousedown={ensureMidiAccess}
					onclick={() => envelopeInputEl?.focus()}
					onkeydown={handleEnvelopeNoteKeyDown}>
					{envelopePeriod === 0 ? '—' : envelopeDisplayValue}
				</div>
			{:else}
				<input
					type="text"
					class="h-7 w-14 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 font-mono uppercase disabled:cursor-not-allowed disabled:opacity-50"
					maxlength={4}
					placeholder="0000"
					disabled={isDisabled}
					value={envelopeHexFocused ? envelopeHexInput : envelopeHexValue}
					onfocus={() => {
						envelopeHexFocused = true;
						envelopeHexInput = envelopeHexValue;
					}}
					onblur={() => {
						envelopeHexFocused = false;
						envelopePeriod = parseHex4(envelopeHexInput);
						clampEnvelopePeriod();
					}}
					oninput={(e) => {
						const s = (e.currentTarget.value || '')
							.replace(/[^0-9a-fA-F]/gi, '')
							.slice(0, 4)
							.toUpperCase();
						envelopeHexInput = s;
						envelopePeriod = parseHex4(s);
					}} />
			{/if}
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Shape</span>
			<input
				type="text"
				class="h-7 w-8 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={1}
				placeholder="0"
				disabled={isDisabled}
				bind:value={envelopeShape}
				onblur={clampEnvelopeShape}
				oninput={(e) => {
					envelopeShape = (e.currentTarget.value || '')
						.replace(/[^0-9a-fA-F]/gi, '')
						.slice(0, 1)
						.toUpperCase();
				}} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Noise</span>
			<input
				type="text"
				class="h-7 w-10 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={2}
				placeholder="00"
				disabled={isDisabled}
				bind:value={noiseValue}
				onblur={clampNoiseValue}
				oninput={(e) => {
					noiseValue = (e.currentTarget.value || '')
						.replace(/[^0-9a-fA-F]/gi, '')
						.slice(0, 2)
						.toUpperCase();
				}} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Table</span>
			<input
				type="text"
				class="h-7 w-8 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={1}
				placeholder="0"
				disabled={isDisabled}
				bind:value={table}
				onblur={clampTable}
				oninput={(e) => {
					const v = (e.currentTarget.value || '').toUpperCase().slice(-1);
					table = (v >= '0' && v <= '9') || (v >= 'A' && v <= 'Z') ? v : '';
				}} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Volume</span>
			<input
				type="text"
				class="h-7 w-8 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={1}
				placeholder="F"
				disabled={isDisabled}
				bind:value={volume}
				onblur={clampVolume}
				oninput={(e) => {
					const v = (e.currentTarget.value || '')
						.replace(/[^0-9a-fA-F]/gi, '')
						.slice(0, 1)
						.toUpperCase();
					if (v) {
						const n = parseInt(v, 16);
						volume = n >= 1 && n <= 15 ? v : volume;
					} else {
						volume = '';
					}
				}} />
		</label>
		<div class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Note</span>
			<div
				bind:this={noteInputEl}
				class="flex h-7 max-w-[10rem] min-w-14 items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 focus:border-[var(--color-app-primary)] focus:outline-none {isDisabled
					? 'pointer-events-none cursor-not-allowed opacity-50'
					: ''}"
				role="textbox"
				tabindex={isDisabled ? -1 : 0}
				aria-label="Note (keyboard: piano keys)"
				aria-disabled={isDisabled}
				title={`Click to focus, then use keyboard. Polyphony: ${maxPoly} notes (3 per chip). Piano: Z–P, Q–I; A = OFF; letters = note with current octave. ${ShortcutString.toDisplay(keybindingsStore.getShortcut(ACTION_TOGGLE_PLAYBACK))} = toggle play.`}
				onmousedown={ensureMidiAccess}
				onclick={() => noteInputEl?.focus()}
				onkeydown={handleNoteKeyDown}
				onkeyup={handleNoteKeyUp}
				onblur={() => {
					if (activeNotes.length > 0) {
						lastPlayedNotes = activeNotes.map((n) => n.note);
					}
					activeNotes = [];
				}}>
				{activeNotes.length > 0
					? activeNotes.map((n) => n.note).join(' ')
					: lastPlayedNotes.length > 0
						? lastPlayedNotes.join(' ')
						: '—'}
			</div>
		</div>
	</div>
</div>
