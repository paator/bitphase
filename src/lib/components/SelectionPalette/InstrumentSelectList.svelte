<script lang="ts">
	import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import { ITEM_COMPACT_ROW_HEIGHT } from '../../config/item-grid';
	import { itemGridIdTextClass, itemGridNameTextClass } from '../../utils/item-grid-cell';

	let { chipType = 'ay' }: { chipType?: string } = $props();

	const instruments = $derived(filterInstrumentsForChip(projectStore.instruments, chipType));
	const selectedId = $derived(editorStateStore.getCurrentInstrument(chipType));

	function selectInstrument(instrumentId: string): void {
		editorStateStore.setCurrentInstrumentForChip(chipType, instrumentId);
	}
</script>

<div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
	{#each instruments as instrument (instrument.id)}
		{@const isSelected = selectedId === instrument.id}
		<button
			type="button"
			class={[
				'flex w-full min-w-0 cursor-pointer items-center gap-1.5 px-2 py-0.5 text-left',
				isSelected
					? 'bg-[var(--color-app-primary)]'
					: 'bg-transparent hover:bg-[var(--color-app-surface-hover)]'
			]}
			style:min-height="{ITEM_COMPACT_ROW_HEIGHT}px"
			onclick={() => selectInstrument(instrument.id)}>
			<span
				class="w-5 shrink-0 font-mono text-[0.65rem] font-semibold {itemGridIdTextClass(
					isSelected,
					true
				)}">
				{instrument.id}
			</span>
			<span
				class="min-w-0 truncate text-[0.65rem] {itemGridNameTextClass(isSelected, true)}">
				{instrument.name}
			</span>
		</button>
	{/each}
</div>
