<script lang="ts">
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import { formatRowEditorNumber } from '../../utils/row-editor-numeric';

	let {
		index,
		value,
		currentValue,
		selected,
		formatValue = undefined,
		onPaintBegin,
		onPaintOver
	}: {
		index: number;
		value: number;
		currentValue: number;
		selected: boolean;
		formatValue?: (value: number) => string;
		onPaintBegin: (index: number, value: number) => void;
		onPaintOver: (index: number, value: number) => void;
	} = $props();

	const isSelected = $derived(value === currentValue);
	const display = $derived(formatValue ? formatValue(value) : formatRowEditorNumber(value, false));
</script>

<td
	class="group h-8 w-6 min-w-6 cursor-pointer border border-[var(--color-app-border)] text-center text-[0.7rem] leading-none {selected
		? ROW_SELECTION_STYLES.cell
		: isSelected
			? 'bg-[var(--color-app-surface-active)]'
			: 'bg-[var(--color-app-surface)] hover:bg-[var(--color-app-surface-secondary)]'}"
	tabindex="-1"
	title={String(value)}
	onmousedown={() => onPaintBegin(index, value)}
	onmouseover={() => onPaintOver(index, value)}
	onfocus={() => onPaintOver(index, value)}>
	{#if isSelected}
		{display}
	{:else}
		<span class="text-[var(--color-app-text-tertiary)] opacity-0 group-hover:opacity-100">{display}</span>
	{/if}
</td>
