<script lang="ts">
	import type { Component } from 'svelte';
	import { expandedIconSizeClass } from './row-editor-table-classes';

	let {
		title,
		icon,
		label = '',
		isExpanded = false,
		class: className = ''
	}: {
		title: string;
		icon: Component<{ class?: string }>;
		label?: string;
		isExpanded?: boolean;
		class?: string;
	} = $props();

	const Icon = $derived(icon);
	const iconClass = $derived(expandedIconSizeClass(isExpanded));
</script>

<th class={className} {title}>
	<div class="flex items-center justify-center gap-0.5">
		<Icon class={iconClass} />
		{#if isExpanded && label}
			<span>{label}</span>
		{/if}
	</div>
</th>
