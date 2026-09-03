<script lang="ts">
	import type { Component } from 'svelte';
	import IconCarbonAdd from '~icons/carbon/add';
	import IconCarbonSubtract from '~icons/carbon/subtract';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonListNumbered from '~icons/carbon/list-numbered';
	import { macroIconClass } from './instrument-macro-ui';

	let {
		label,
		title,
		icon,
		accentColor,
		isExpanded = false,
		loopIndex,
		sequenceLength,
		canRemove,
		canAdd,
		onRemoveStep,
		onAddStep
	}: {
		label: string;
		title?: string;
		icon?: Component;
		accentColor?: string;
		isExpanded?: boolean;
		loopIndex: number;
		sequenceLength: number;
		canRemove: boolean;
		canAdd: boolean;
		onRemoveStep: () => void;
		onAddStep: () => void;
	} = $props();

	const Icon = $derived(icon);
	const iconClass = $derived(macroIconClass(isExpanded));
	const stepLabel = $derived(sequenceLength === 1 ? 'step' : 'steps');
	const buttonClass =
		'flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[var(--color-app-text-muted)] transition-all duration-150 hover:scale-110 hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100';
</script>

<header
	class="flex items-center gap-3 border-b border-[var(--color-app-border)] px-2 py-1 text-xs">
	{#if Icon}
		<Icon class="{iconClass} shrink-0" style="color: {accentColor}" />
	{/if}
	<span class="min-w-0 flex-1 truncate font-medium" {title}>{label}</span>
	<div class="flex shrink-0 items-center gap-4 text-[var(--color-app-text-muted)]">
		<span class="flex items-center gap-1" title="Looping at {loopIndex}">
			<IconCarbonRepeat class="{iconClass} shrink-0" aria-hidden="true" />
			{loopIndex}
		</span>
		<span class="flex items-center gap-1" title="{sequenceLength} {stepLabel}">
			<IconCarbonListNumbered class="{iconClass} shrink-0" aria-hidden="true" />
			{sequenceLength}
		</span>
		<div class="flex items-center gap-0">
			<button
				type="button"
				class={buttonClass}
				disabled={!canRemove}
				title="Remove last step"
				onclick={onRemoveStep}>
				<IconCarbonSubtract class="h-3 w-3" />
			</button>
			<button
				type="button"
				class={buttonClass}
				disabled={!canAdd}
				title="Add step"
				onclick={onAddStep}>
				<IconCarbonAdd class="h-3 w-3" />
			</button>
		</div>
	</div>
</header>
