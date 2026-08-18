<script lang="ts">
	import { tick, untrack } from 'svelte';
	import IconCarbonChevronDown from '~icons/carbon/chevron-down';
	import IconCarbonChevronUp from '~icons/carbon/chevron-up';
	import IconCarbonMusic from '~icons/carbon/music';
	import Button from '../Button/Button.svelte';
	import { NativeSelect } from '../NativeSelect';
	import {
		DEFAULT_ROOT_PITCH_CLASS,
		DEFAULT_SCALE_ID,
		getScaleById,
		MUSICAL_SCALES,
		PITCH_CLASS_NAMES,
		scaleNoteNames
	} from '../../utils/music-scales';
	import {
		formatOffsetList,
		isMidiInScale,
		offsetsToMidis,
		PIANO_BASE_OCTAVE,
		PIANO_ROWS,
		rowsMatchOffsets,
		selectedMidisToOffsets,
		transposeMidis
	} from '../../utils/piano-helper';
	import PianoKeyboard from './PianoKeyboard.svelte';

	let {
		asHex = false,
		tableRows,
		onInsert
	}: {
		asHex: boolean;
		tableRows: number[];
		onInsert: (rows: number[]) => void;
	} = $props();

	let isOpen = $state(false);
	let scaleId = $state(DEFAULT_SCALE_ID);
	let rootValue = $state(String(DEFAULT_ROOT_PITCH_CLASS));
	let lastRootPitchClass = $state(DEFAULT_ROOT_PITCH_CLASS);
	let restrictToScale = $state(true);
	let selectedMidis = $state(
		untrack(() => offsetsToMidis(tableRows, DEFAULT_ROOT_PITCH_CLASS, PIANO_BASE_OCTAVE))
	);

	const scale = $derived(getScaleById(scaleId));
	const rootPitchClass = $derived(Number(rootValue));
	const scaleNotes = $derived(scaleNoteNames(scale.intervals, rootPitchClass).join(' '));
	const offsets = $derived(selectedMidisToOffsets(selectedMidis));
	const insertRows = $derived(offsets.length === 0 ? [0] : offsets);
	const offsetText = $derived(formatOffsetList(insertRows, asHex));
	const alreadyInserted = $derived(rowsMatchOffsets(tableRows, insertRows));
	const loadedMidis = $derived(offsetsToMidis(tableRows, rootPitchClass, PIANO_BASE_OCTAVE));
	const alreadyLoaded = $derived(rowsMatchOffsets(selectedMidis, loadedMidis));
	const omittedOffsetCount = $derived(new Set(tableRows).size - loadedMidis.length);
	const showRangeHint = $derived(omittedOffsetCount > 0 && alreadyLoaded);

	const scaleOptions = MUSICAL_SCALES.map((item) => ({ label: item.name, value: item.id }));
	const rootOptions = PITCH_CLASS_NAMES.map((name, pitchClass) => ({
		label: name,
		value: String(pitchClass)
	}));

	function handleRootChange(event: Event): void {
		const next = Number((event.currentTarget as HTMLSelectElement).value);
		const delta = next - lastRootPitchClass;
		lastRootPitchClass = next;
		if (delta !== 0 && selectedMidis.length > 0) {
			selectedMidis = transposeMidis(selectedMidis, delta);
		}
	}

	function toggleMidi(midi: number): void {
		if (selectedMidis.includes(midi)) {
			selectedMidis = selectedMidis.filter((selected) => selected !== midi);
			return;
		}
		if (restrictToScale && !isMidiInScale(midi, scale.intervals, rootPitchClass)) return;
		selectedMidis = [...selectedMidis, midi].sort((a, b) => a - b);
	}

	function loadFromTable(): void {
		selectedMidis = offsetsToMidis(tableRows, rootPitchClass, PIANO_BASE_OCTAVE);
	}

	function clearSelection(): void {
		selectedMidis = [];
	}

	function insertIntoTable(): void {
		onInsert(insertRows);
	}

	function scrollWhenOpen(open: boolean) {
		return (node: HTMLElement) => {
			if (!open) return;
			void tick().then(() => {
				requestAnimationFrame(() => {
					node.scrollIntoView({
						behavior: 'smooth',
						block: 'end',
						inline: 'nearest'
					});
				});
			});
		};
	}
</script>

<section
	{@attach scrollWhenOpen(isOpen)}
	class="mt-3 overflow-hidden rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]">
	<button
		type="button"
		class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-app-surface-hover)]"
		onclick={() => (isOpen = !isOpen)}
		aria-expanded={isOpen}>
		<span
			class="flex items-center gap-1.5 text-xs font-medium text-[var(--color-app-text-secondary)]">
			<IconCarbonMusic class="h-3.5 w-3.5 text-[var(--color-app-text-muted)]" />
			Piano helper
		</span>
		{#if isOpen}
			<IconCarbonChevronUp class="h-3.5 w-3.5 text-[var(--color-app-text-muted)]" />
		{:else}
			<IconCarbonChevronDown class="h-3.5 w-3.5 text-[var(--color-app-text-muted)]" />
		{/if}
	</button>

	{#if isOpen}
		<div class="space-y-3 border-t border-[var(--color-app-border)] px-3 py-3">
			<div class="flex flex-wrap items-start gap-3">
				<label class="flex min-w-[12rem] flex-1 flex-col gap-1">
					<span class="text-xs text-[var(--color-app-text-muted)]">Musical scale</span>
					<NativeSelect bind:value={scaleId} options={scaleOptions} class="w-full" />
				</label>
				<label class="flex w-20 flex-col gap-1">
					<span class="text-xs text-[var(--color-app-text-muted)]">Root</span>
					<NativeSelect
						bind:value={rootValue}
						options={rootOptions}
						class="w-full"
						onchange={handleRootChange} />
				</label>
				<div class="flex min-w-[12rem] flex-[1.4] flex-col gap-1">
					<span class="text-xs text-[var(--color-app-text-muted)]"
						>Notes in selected scale</span>
					<p class="py-1.5 font-mono text-xs text-[var(--color-app-text-secondary)]">
						{scaleNotes}
					</p>
				</div>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="text-xs text-[var(--color-app-text-muted)]">
					Create a chord using the piano keyboard
				</span>
				<label class="flex cursor-pointer items-center gap-1.5 select-none">
					<input
						type="checkbox"
						class="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[var(--color-app-border)] bg-[var(--color-app-surface)] text-[var(--color-app-primary)] focus:ring-2 focus:ring-[var(--color-app-primary)]"
						bind:checked={restrictToScale} />
					<span class="text-xs text-[var(--color-app-text-muted)]"
						>Restrict to scale</span>
				</label>
			</div>

			<div class="mx-auto w-full max-w-full space-y-1.5">
				{#each PIANO_ROWS as row (row.startMidi)}
					<PianoKeyboard
						startMidi={row.startMidi}
						endMidi={row.endMidi}
						{selectedMidis}
						{restrictToScale}
						intervals={scale.intervals}
						{rootPitchClass}
						ontoggle={toggleMidi} />
				{/each}
			</div>

			<div class="flex flex-col gap-1">
				<span class="text-xs text-[var(--color-app-text-muted)]">Table offsets</span>
				<div class="flex items-stretch gap-1.5">
					<input
						type="text"
						readonly
						value={offsetText}
						placeholder="Click keys to build a chord"
						class="h-8 min-w-0 flex-1 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 font-mono text-xs leading-none text-[var(--color-app-text-primary)] placeholder-[var(--color-app-text-muted)]" />
					<Button
						class="flex h-8 shrink-0 items-center"
						variant="primary"
						size="sm"
						disabled={alreadyInserted}
						onclick={insertIntoTable}
						title="Write these offsets into the current table">
						Insert
					</Button>
					<Button
						class="flex h-8 shrink-0 items-center"
						variant="secondary"
						size="sm"
						disabled={tableRows.length === 0}
						onclick={loadFromTable}
						title="Show the current table as a chord from the selected root">
						Load table
					</Button>
					<Button
						class="flex h-8 shrink-0 items-center"
						variant="secondary"
						size="sm"
						disabled={selectedMidis.length === 0}
						onclick={clearSelection}
						title="Clear selected keys">
						Clear
					</Button>
				</div>
				{#if showRangeHint}
					<p class="text-xs text-[var(--color-app-text-muted)]">
						{omittedOffsetCount === 1
							? '1 offset is outside the keyboard'
							: `${omittedOffsetCount} offsets are outside the keyboard`}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</section>
