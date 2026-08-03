<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	let {
		icon,
		title,
		message,
		hint,
		class: className,
		style,
		children
	}: {
		icon?: Component<{ class?: string }>;
		title?: string;
		message?: string;
		hint?: string;
		class?: ClassValue;
		style?: string;
		children?: Snippet;
	} = $props();

	const Icon = $derived(icon);
</script>

<div
	class="flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]/40 px-4 py-8 text-center {className}"
	{style}>
	{#if Icon}
		<Icon class="h-8 w-8 text-[var(--color-app-text-tertiary)]/70" />
	{/if}
	{#if title}
		<p class="text-sm font-medium text-[var(--color-app-text-primary)]">{title}</p>
	{/if}
	{#if message}
		<p class="text-xs text-[var(--color-app-text-muted)]">{message}</p>
	{/if}
	{#if hint}
		<p class="text-[10px] text-[var(--color-app-text-tertiary)]">{hint}</p>
	{/if}
	{#if children}
		<div class="mt-2 w-full">
			{@render children()}
		</div>
	{/if}
</div>
