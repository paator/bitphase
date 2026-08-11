<script lang="ts">
	import type { Component } from 'svelte';
	import { CommitNumericInput } from '../CommitNumericInput';
	import IconCarbonChevronUp from '~icons/carbon/chevron-up';
	import IconCarbonChevronDown from '~icons/carbon/chevron-down';

	let {
		id,
		label,
		icon,
		value = $bindable(),
		min,
		max,
		title = '',
		onCommit,
		onIncrement,
		onDecrement,
		onKeyDown
	}: {
		id: string;
		label?: string;
		icon?: Component<{ class?: string }>;
		value: number;
		min?: number;
		max?: number;
		title?: string;
		onCommit: () => void;
		onIncrement: () => void;
		onDecrement: () => void;
		onKeyDown?: (event: KeyboardEvent) => void;
	} = $props();

	const Icon = $derived(icon);
</script>

<div class="flex items-center gap-1.5" {title}>
	{#if Icon}
		<Icon class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)]" />
	{/if}
	{#if label}
		<label
			for={id}
			class="hidden text-xs font-medium text-[var(--color-app-text-tertiary)] min-[1880px]:inline"
			>{label}:</label>
	{/if}
	<div
		class="flex items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)]">
		<CommitNumericInput
			{id}
			bind:value
			{min}
			{max}
			live={false}
			class="h-6 w-10 border-0 bg-transparent text-center font-mono text-xs focus:ring-0"
			onkeydown={onKeyDown}
			oncommit={() => onCommit()} />
		<div class="flex flex-col border-l border-[var(--color-app-border)]">
			<button
				type="button"
				class="flex h-3 w-4 cursor-pointer items-center justify-center border-b border-[var(--color-app-border)] transition-colors hover:bg-[var(--color-app-surface-hover)]"
				onclick={onIncrement}
				title="Increment {label?.toLowerCase() ?? 'value'}">
				<IconCarbonChevronUp class="h-2.5 w-2.5 text-[var(--color-app-text-muted)]" />
			</button>
			<button
				type="button"
				class="flex h-3 w-4 cursor-pointer items-center justify-center transition-colors hover:bg-[var(--color-app-surface-hover)]"
				onclick={onDecrement}
				title="Decrement {label?.toLowerCase() ?? 'value'}">
				<IconCarbonChevronDown class="h-2.5 w-2.5 text-[var(--color-app-text-muted)]" />
			</button>
		</div>
	</div>
</div>
