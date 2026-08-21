<script lang="ts">
	import type { Chip } from '../types';
	import { createChipPreviewPlayground } from '../base/preview-playground.svelte';
	import IconCarbonPlay from '~icons/carbon/play';
	import IconCarbonPauseFilled from '~icons/carbon/pause-filled';
	import { IconButton } from '../../components/IconButton';

	let {
		chip,
		instrumentId = '01'
	}: {
		chip: Chip;
		instrumentId?: string;
		tuningTable?: number[];
	} = $props();

	const playground = createChipPreviewPlayground({
		getChip: () => chip,
		getInstrumentId: () => instrumentId
	});
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
