<script lang="ts">
	import { settingsStore } from '../../stores/settings.svelte';

	const classic = $derived(settingsStore.classicInstrumentEditor);
</script>

<button
	type="button"
	class="cursor-pointer rounded border px-2 py-0.5 text-[0.65rem] font-medium transition-colors {classic
		? 'border-[var(--color-pattern-note)]/50 bg-[var(--color-pattern-note)]/15 text-[var(--color-pattern-note)]'
		: 'border-[var(--color-app-border)] text-[var(--color-app-text-muted)] hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)]'}"
	aria-pressed={classic}
	title="Use the old row-table instrument editor. Macros stay underneath."
	onclick={() => settingsStore.set('classicInstrumentEditor', !classic)}>
	Classic
</button>
