<script lang="ts">
	import type { Chip } from '../types';
	import type { Pattern } from '../../models/song';
	import { createChipPreviewPlayground } from '../base/preview-playground.svelte';
	import { parseClampedHex, sanitizeHexInput } from '../base/preview-row-utils';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { playbackStore } from '../../stores/playback.svelte';
	import { formatNoteFromEnum, midiNoteToNoteString } from '../../utils/note-utils';
	import { PatternNoteInput } from '../../services/pattern/editing/pattern-note-input';
	import {
		envelopePeriodToNoteString,
		noteStringToEnvelopePeriod
	} from '../../utils/envelope-note-conversion';
	import IconCarbonPlay from '~icons/carbon/play';
	import IconCarbonPauseFilled from '~icons/carbon/pause-filled';
	import { IconButton } from '../../components/IconButton';

	let {
		chip,
		instrumentId = '01',
		tuningTable = []
	}: {
		chip: Chip;
		instrumentId?: string;
		tuningTable?: number[];
	} = $props();

	let envelopePeriod = $state(0);
	let noiseValue = $state('00');
	let envelopeShape = $state('');
	let envelopeInputEl: HTMLDivElement | null = $state(null);
	let envelopeHexInput = $state('0000');
	let envelopeHexFocused = $state(false);

	const envelopeAsNote = $derived(editorStateStore.envelopeAsNote);
	const canEnvelopeAsNote = $derived(envelopeAsNote && tuningTable.length > 0);
	const envelopeHexValue = $derived(
		(envelopePeriod >>> 0).toString(16).toUpperCase().padStart(4, '0')
	);
	const envelopeDisplayValue = $derived(
		canEnvelopeAsNote
			? (envelopePeriodToNoteString(envelopePeriod, tuningTable) ?? envelopeHexValue)
			: envelopeHexValue
	);

	function decoratePreviewPattern(pattern: Pattern) {
		const pr = pattern.patternRows[0];
		pr.envelopeValue = Math.max(0, Math.min(0xffff, envelopePeriod));
		pr.noiseValue = parseClampedHex(noiseValue, 2, 0x1f);
		pr.envelopeEffect = null;
		const shapeValue = envelopeShape ? parseClampedHex(envelopeShape, 1, 15) : 0;
		for (const channel of pattern.channels) {
			channel.rows[0].envelopeShape = shapeValue;
		}
	}

	function handleMidiNote(midiNote: number, velocity: number): boolean {
		const envelopeFocused =
			canEnvelopeAsNote && envelopeInputEl && document.activeElement === envelopeInputEl;
		if (!envelopeFocused) return false;
		if (velocity <= 0) return true;
		const noteStr = midiNoteToNoteString(midiNote);
		if (!noteStr) return true;
		const period = noteStringToEnvelopePeriod(noteStr, tuningTable, editorStateStore.octave);
		envelopePeriod = Math.max(0, Math.min(0xffff, period));
		return true;
	}

	const playground = createChipPreviewPlayground({
		getChip: () => chip,
		getInstrumentId: () => instrumentId,
		decoratePreviewPattern,
		onMidiNote: handleMidiNote
	});

	function clampEnvelopePeriod() {
		envelopePeriod = Math.max(0, Math.min(0xffff, envelopePeriod));
		envelopeHexInput = envelopeHexValue;
	}

	function clampNoiseValue() {
		noiseValue = sanitizeHexInput(noiseValue, 2).padStart(2, '0') || '00';
	}

	function clampEnvelopeShape() {
		envelopeShape = sanitizeHexInput(envelopeShape, 1);
	}

	function handleEnvelopeNoteKeyDown(event: KeyboardEvent) {
		if (playbackStore.isPlaying || !canEnvelopeAsNote) return;
		event.preventDefault();
		const key = event.key;
		const keyLower = key.toLowerCase();
		let noteStr: string;
		const pianoNote = PatternNoteInput.mapKeyboardCodeToNote(event.code);
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
</script>

<div class="flex flex-col gap-2">
	<div
		class="flex items-center gap-1.5 text-xs text-[var(--color-app-text-muted)]"
		role="group"
		aria-label="Preview playground">
		<IconButton
			variant="primary"
			size="sm"
			title={playground.playButtonTitle}
			disabled={playground.playDisabled}
			onclick={playground.togglePreviewPlaying}>
			{#if playground.isPreviewPlaying}
				<IconCarbonPauseFilled class="h-3.5 w-3.5" />
			{:else}
				<IconCarbonPlay class="h-3.5 w-3.5" />
			{/if}
		</IconButton>
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
					class="flex h-7 w-14 items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 font-mono uppercase focus:border-[var(--color-app-primary)] focus:outline-none {playground.isDisabled
						? 'pointer-events-none cursor-not-allowed opacity-50'
						: ''}"
					role="textbox"
					tabindex={playground.isDisabled ? -1 : 0}
					aria-label="Envelope as note (keyboard: piano keys or letters)"
					title="Envelope as note. Piano: Z–P, Q–I; A = OFF; letters = note with current octave."
					onmousedown={playground.ensureMidiAccess}
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
					disabled={playground.isDisabled}
					value={envelopeHexFocused ? envelopeHexInput : envelopeHexValue}
					onfocus={() => {
						envelopeHexFocused = true;
						envelopeHexInput = envelopeHexValue;
					}}
					onblur={() => {
						envelopeHexFocused = false;
						envelopePeriod = parseClampedHex(envelopeHexInput, 4, 0xffff);
						clampEnvelopePeriod();
					}}
					oninput={(e) => {
						const s = sanitizeHexInput(e.currentTarget.value || '', 4);
						envelopeHexInput = s;
						envelopePeriod = parseClampedHex(s, 4, 0xffff);
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
				disabled={playground.isDisabled}
				bind:value={envelopeShape}
				onblur={clampEnvelopeShape}
				oninput={(e) => {
					envelopeShape = sanitizeHexInput(e.currentTarget.value || '', 1);
				}} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Noise</span>
			<input
				type="text"
				class="h-7 w-10 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={2}
				placeholder="00"
				disabled={playground.isDisabled}
				bind:value={noiseValue}
				onblur={clampNoiseValue}
				oninput={(e) => {
					noiseValue = sanitizeHexInput(e.currentTarget.value || '', 2);
				}} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Table</span>
			<input
				type="text"
				class="h-7 w-8 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={1}
				placeholder="0"
				disabled={playground.isDisabled}
				bind:value={playground.table}
				onblur={playground.clampTable}
				oninput={playground.handleTableInput} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Volume</span>
			<input
				type="text"
				class="h-7 w-8 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50"
				maxlength={1}
				placeholder="F"
				disabled={playground.isDisabled}
				bind:value={playground.volume}
				onblur={playground.clampVolume}
				oninput={playground.handleVolumeInput} />
		</label>
		<div class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Note</span>
			<div
				bind:this={playground.noteInputEl}
				class="flex h-7 max-w-[10rem] min-w-14 items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 focus:border-[var(--color-app-primary)] focus:outline-none {playground.isDisabled
					? 'pointer-events-none cursor-not-allowed opacity-50'
					: ''}"
				role="textbox"
				tabindex={playground.isDisabled ? -1 : 0}
				aria-label="Note (keyboard: piano keys)"
				aria-disabled={playground.isDisabled}
				title={playground.noteTitle}
				onmousedown={playground.ensureMidiAccess}
				onclick={playground.focusNoteInput}
				onkeydown={playground.handleNoteKeyDown}
				onkeyup={playground.handleNoteKeyUp}
				onblur={playground.handleNoteBlur}>
				{playground.noteDisplay}
			</div>
		</div>
	</div>
</div>
