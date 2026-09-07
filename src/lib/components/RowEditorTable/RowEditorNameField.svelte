<script lang="ts">
	import type { Snippet } from 'svelte';
	import Input from '../Input/Input.svelte';

	let {
		name = $bindable(),
		class: className = '',
		children
	}: {
		name: string;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="mt-2 ml-2 flex flex-wrap items-center gap-2 {className}">
	<span class="w-10 shrink-0 text-xs text-[var(--color-app-text-muted)]">Name:</span>
	<Input class="w-48 text-xs" bind:value={name} />
	{#if children}
		{@render children()}
	{/if}
</div>
