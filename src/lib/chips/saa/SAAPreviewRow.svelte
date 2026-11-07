<script lang="ts">
	import type { Chip } from '../types';
	import type { Pattern } from '../../models/song';
	import { createChipPreviewPlayground } from '../base/preview-playground.svelte';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { PatternNoteInput } from '../../services/pattern/editing/pattern-note-input';
	import { formatNoteFromEnum, isTrackerNoteStringInTuningTable } from '../../utils/note-utils';
	import {
		applySaaPreviewColumns,
		filterSaaEnvelopeInput,
		filterSaaNoiseInput
	} from './preview-columns';
	import IconCarbonPlay from '~icons/carbon/play';
	import IconCarbonPauseFilled from '~icons/carbon/pause-filled';
	import { IconButton } from '../../components/IconButton';

	let {
		chip,
		instrumentId = '01',
		channelIndex = 0,
		channelLabels
	}: {
		chip: Chip;
		instrumentId?: string;
		tuningTable?: number[];
		channelIndex?: number;
		channelLabels?: string[];
	} = $props();

	let noise = $state('');
	let envelope = $state('');
	let clockNote = $state('');

	const envelopeActive = $derived(envelope !== '' && envelope !== '0');
	const noiseTitle =
		'Noise clock for every preview channel: 0 high, 1 mid, 2 low, 3 locked. Blank keeps the current clock.';
	const envelopeTitle =
		'Envelope shape, same as the E column. 1-C play on the third channel of each group, clocked by the second channel. 0 is off. A blank cell leaves the current mode.';
	const clockTitle =
		'Note on the second channel. It sets how fast the envelope runs. Blank leaves that channel empty, so the envelope stays on its first step. This channel stays silent.';

	function decoratePreviewPattern(pattern: Pattern) {
		applySaaPreviewColumns(pattern, { noise, envelope, clockNote });
	}

	const playground = createChipPreviewPlayground({
		getChip: () => chip,
		getInstrumentId: () => instrumentId,
		getPreviewChannelIndex: () => channelIndex,
		getPreviewChannelLabels: () => channelLabels,
		decoratePreviewPattern
	});

	function handleClockKeyDown(event: KeyboardEvent) {
		if (playground.isDisabled) return;
		const key = event.key;
		if (key === 'a' || key === 'A' || key === 'Backspace' || key === 'Delete') {
			event.preventDefault();
			clockNote = '';
			return;
		}
		const piano = PatternNoteInput.mapKeyboardCodeToNote(event.code);
		if (piano) {
			const noteStr = formatNoteFromEnum(piano.noteName, piano.octave);
			if (!isTrackerNoteStringInTuningTable(noteStr)) return;
			event.preventDefault();
			clockNote = noteStr;
			return;
		}
		const letter = PatternNoteInput.getLetterNote(key);
		if (!letter) return;
		const noteStr = formatNoteFromEnum(letter, editorStateStore.octave);
		if (!isTrackerNoteStringInTuningTable(noteStr)) return;
		event.preventDefault();
		clockNote = noteStr;
	}

	const hexInputClass =
		'h-7 w-8 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#snippet columnField(
	label: string,
	title: string,
	value: string,
	setValue: (next: string) => void,
	filter: (text: string, previous: string) => string
)}
	<label class="flex flex-col gap-0.5">
		<span class="text-[var(--color-app-text-muted)]">{label}</span>
		<input
			type="text"
			class={hexInputClass}
			maxlength={1}
			{title}
			aria-label={title}
			disabled={playground.isDisabled}
			{value}
			oninput={(event) => {
				const next = filter(event.currentTarget.value, value);
				event.currentTarget.value = next;
				setValue(next);
			}} />
	</label>
{/snippet}

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
		{@render columnField('N', noiseTitle, noise, (next) => (noise = next), filterSaaNoiseInput)}
		{@render columnField(
			'E',
			envelopeTitle,
			envelope,
			(next) => (envelope = next),
			filterSaaEnvelopeInput
		)}
		{#if envelopeActive}
			<div class="flex flex-col gap-0.5">
				<span class="text-[var(--color-app-text-muted)]">Rate</span>
				<div
					class="flex h-7 w-14 items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-1.5 uppercase focus:border-[var(--color-app-primary)] focus:outline-none {playground.isDisabled
						? 'pointer-events-none cursor-not-allowed opacity-50'
						: ''}"
					role="textbox"
					tabindex={playground.isDisabled ? -1 : 0}
					aria-label={clockTitle}
					aria-disabled={playground.isDisabled}
					title={clockTitle}
					onclick={(event) => event.currentTarget.focus()}
					onkeydown={handleClockKeyDown}>
					{clockNote || '—'}
				</div>
			</div>
		{/if}
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Table</span>
			<input
				type="text"
				class={hexInputClass}
				maxlength={1}
				placeholder="0"
				disabled={playground.isDisabled}
				bind:value={playground.table}
				onblur={playground.clampTable}
				oninput={playground.handleTableInput} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">L</span>
			<input
				type="text"
				class={hexInputClass}
				maxlength={1}
				placeholder="F"
				aria-label="Left volume"
				disabled={playground.isDisabled}
				bind:value={playground.left}
				onblur={playground.clampLeft}
				oninput={playground.handleLeftInput} />
		</label>
		<label class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">R</span>
			<input
				type="text"
				class={hexInputClass}
				maxlength={1}
				placeholder="F"
				aria-label="Right volume"
				disabled={playground.isDisabled}
				bind:value={playground.right}
				onblur={playground.clampRight}
				oninput={playground.handleRightInput} />
		</label>
		<div class="flex flex-col gap-0.5">
			<span class="text-[var(--color-app-text-muted)]">Note</span>
			<div
				{@attach (element: HTMLDivElement) => {
					playground.noteInputEl = element;
					return () => {
						if (playground.noteInputEl === element) playground.noteInputEl = null;
					};
				}}
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
