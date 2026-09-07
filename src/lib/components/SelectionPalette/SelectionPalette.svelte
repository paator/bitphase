<script lang="ts">
	import type { Component } from 'svelte';
	import IconCarbonMagicWandFilled from '~icons/carbon/magic-wand-filled';
	import IconCarbonList from '~icons/carbon/list';
	import type { Chip } from '../../chips/types';
	import {
		selectionPaletteStore,
		type SelectionPaletteTabId
	} from '../../stores/selection-palette.svelte';
	import EffectCheatSheet from './EffectCheatSheet.svelte';
	import InstrumentSelectList from './InstrumentSelectList.svelte';

	let { chip, chips = [] }: { chip?: Chip; chips?: Chip[] } = $props();

	const chipType = $derived(chip?.type);

	const paletteTabs: {
		id: SelectionPaletteTabId;
		label: string;
		icon: Component<{ class?: string }>;
	}[] = [
		{ id: 'instruments', label: 'Instruments Picker', icon: IconCarbonMagicWandFilled },
		{ id: 'effects', label: 'Effects', icon: IconCarbonList }
	];

	const isOpen = $derived(selectionPaletteStore.isOpen);
	const activeTabId = $derived(selectionPaletteStore.activeTabId);
</script>

<div class={['relative h-full shrink-0', !isOpen && 'w-0']}>
	<div
		class="pointer-events-none absolute top-2 right-full z-20 flex flex-col items-end gap-1 bg-transparent">
		{#each paletteTabs as tab (tab.id)}
			{@const TabIcon = tab.icon}
			{@const attached = isOpen && activeTabId === tab.id}
			<button
				type="button"
				class={[
					'pointer-events-auto flex cursor-pointer flex-col items-center gap-1 rounded-l-md border px-1.5 py-2 text-[0.65rem] font-medium',
					attached
						? 'relative z-10 -mr-px border-[var(--color-app-border)] border-r-[var(--color-app-surface)] bg-[var(--color-app-surface)] text-[var(--color-app-text-primary)]'
						: 'border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] text-[var(--color-app-text-muted)] shadow-[-1px_1px_3px_rgb(0_0_0/0.16)] hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)]'
				]}
				title={tab.label}
				aria-label={tab.label}
				aria-pressed={attached}
				onclick={() => selectionPaletteStore.selectTab(tab.id)}>
				<TabIcon class="h-3.5 w-3.5 shrink-0" />
				<span class="tab-vertical-label">{tab.label}</span>
			</button>
		{/each}
	</div>
	{#if isOpen}
		<div
			class={[
				'flex h-full shrink-0 flex-col overflow-hidden border border-[var(--color-app-border)] bg-[var(--color-app-surface)]',
				activeTabId === 'effects' ? 'w-72' : 'w-44'
			]}>
			{#if activeTabId === 'instruments'}
				<InstrumentSelectList {chipType} />
			{:else if activeTabId === 'effects'}
				<EffectCheatSheet {chips} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.tab-vertical-label {
		display: block;
		letter-spacing: 0.06em;
		line-height: 1.15;
		transform: rotate(180deg);
		white-space: nowrap;
		writing-mode: vertical-rl;
	}
</style>
