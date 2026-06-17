<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';

	let {
		label,
		selected,
		isExpanded = false,
		title = '',
		icon = undefined,
		labelClass = '',
		onclick,
		children
	}: {
		label: string;
		selected: boolean;
		isExpanded?: boolean;
		title?: string;
		icon?: Component<{ class?: string }>;
		labelClass?: string;
		onclick: () => void;
		children?: Snippet;
	} = $props();
</script>

<td
	class="cursor-pointer border border-[var(--color-app-border)] text-center {selected
		? ROW_SELECTION_STYLES.cell
		: 'bg-[var(--color-app-surface)] hover:bg-[var(--color-app-surface-secondary)]'} {isExpanded
		? 'px-1'
		: 'px-0.5'}"
	{title}
	{onclick}>
	{#if children}
		{@render children()}
	{:else}
		<div class="flex items-center justify-center gap-0.5">
			{#if icon}
				{@const Icon = icon}
				<Icon class="{isExpanded ? 'h-3 w-3' : 'h-2.5 w-2.5'} shrink-0 opacity-70" />
			{/if}
			<span class={labelClass}>{label}</span>
		</div>
	{/if}
</td>
