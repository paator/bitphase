<script lang="ts">
	import type { Component } from 'svelte';
	import IconCarbonMagicWandFilled from '~icons/carbon/magic-wand-filled';
	import {
		selectionPaletteStore,
		type SelectionPaletteTabId
	} from '../../stores/selection-palette.svelte';
	import InstrumentSelectList from './InstrumentSelectList.svelte';

	let { chipType }: { chipType?: string } = $props();

	const paletteTabs: {
		id: SelectionPaletteTabId;
		label: string;
		icon: Component<{ class?: string }>;
	}[] = [{ id: 'instruments', label: 'Instruments Picker', icon: IconCarbonMagicWandFilled }];

	const isOpen = $derived(selectionPaletteStore.isOpen);
	const activeTabId = $derived(selectionPaletteStore.activeTabId);
</script>

<div class={['relative h-full shrink-0', !isOpen && 'w-0']}>
	<div
		class="pointer-events-none absolute top-2 right-full z-20 flex flex-col items-end bg-transparent">
		{#each paletteTabs as tab (tab.id)}
			{@const TabIcon = tab.icon}
			<button
				type="button"
				class="group tab-vertical pointer-events-auto cursor-pointer text-[0.7rem] font-semibold"
				title={tab.label}
				aria-label={tab.label}
				aria-pressed={isOpen && activeTabId === tab.id}
				onclick={() => selectionPaletteStore.selectTab(tab.id)}>
				<span
					class={[
						'tab-vertical-inner px-1.5 pt-2.5 pb-2 text-[var(--color-app-text-muted)] group-hover:bg-[var(--color-app-surface-hover)] group-hover:text-[var(--color-app-text-secondary)]',
						isOpen && activeTabId === tab.id
							? 'bg-[var(--color-app-surface)] text-[var(--color-app-text-primary)]'
							: 'bg-[var(--color-app-surface-secondary)]'
					]}>
					<TabIcon class="h-3 w-3 shrink-0" />
					<span class="tab-vertical-label">{tab.label}</span>
				</span>
			</button>
		{/each}
	</div>
	{#if isOpen}
		<div
			class="flex h-full w-44 shrink-0 flex-col overflow-hidden border border-[var(--color-app-border)] bg-[var(--color-app-surface)]">
			{#if activeTabId === 'instruments'}
				<InstrumentSelectList {chipType} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.tab-vertical {
		--tab-slant: 0.55rem;
		background: var(--color-app-border);
		clip-path: polygon(0 var(--tab-slant), 100% 0, 100% 100%, 0 calc(100% - var(--tab-slant)));
		padding: 1px;
	}

	.tab-vertical-inner {
		align-items: center;
		clip-path: polygon(0 var(--tab-slant), 100% 0, 100% 100%, 0 calc(100% - var(--tab-slant)));
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.tab-vertical-label {
		display: block;
		letter-spacing: 0;
		line-height: 1;
		transform: rotate(180deg);
		white-space: nowrap;
		writing-mode: vertical-rl;
	}
</style>
