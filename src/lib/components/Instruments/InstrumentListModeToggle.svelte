<script lang="ts">
	import IconCarbonGrid from '~icons/carbon/grid';
	import IconCarbonList from '~icons/carbon/list';
	import { settingsStore } from '../../stores/settings.svelte';

	const compact = $derived(settingsStore.compactInstrumentList);
	const Icon = $derived(compact ? IconCarbonList : IconCarbonGrid);
	const title = $derived(
		compact ? 'Show instruments as a grid' : 'Show instruments as a compact list'
	);
</script>

<button
	type="button"
	class="flex cursor-pointer items-center rounded border px-2 py-1.5 transition-colors {compact
		? 'border-[var(--color-pattern-note)]/50 bg-[var(--color-pattern-note)]/15 text-[var(--color-pattern-note)]'
		: 'border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] text-[var(--color-app-text-tertiary)] hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)]'}"
	aria-pressed={compact}
	aria-label={title}
	{title}
	onclick={() => settingsStore.set('compactInstrumentList', !compact)}>
	<Icon class="h-3.5 w-3.5" />
</button>
