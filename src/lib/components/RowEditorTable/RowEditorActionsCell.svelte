<script lang="ts">
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import IconCarbonDelete from '~icons/carbon/delete';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import { expandedActionsCellClass, expandedIconSizeClass } from './row-editor-table-classes';

	let {
		index,
		rowCount,
		selected,
		isExpanded = false,
		onRemove,
		onRemoveFromBottom
	}: {
		index: number;
		rowCount: number;
		selected: boolean;
		isExpanded?: boolean;
		onRemove: () => void;
		onRemoveFromBottom: () => void;
	} = $props();

	const iconClass = $derived(expandedIconSizeClass(isExpanded));
</script>

<td
	class="overflow-hidden border border-[var(--color-app-border)] {selected
		? ROW_SELECTION_STYLES.cell
		: 'bg-[var(--color-app-surface-secondary)]'} {expandedActionsCellClass(isExpanded)}">
	<div class="flex min-w-0 items-center justify-center {isExpanded ? 'gap-0.5' : 'gap-0'}">
		<button
			class="flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-pattern-note-off)]"
			onclick={(e) => {
				e.stopPropagation();
				onRemove();
			}}
			title="Remove this row">
			<IconCarbonTrashCan class={iconClass} />
		</button>
		{#if index < rowCount - 1}
			<button
				class="flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-pattern-note-off)]"
				onclick={(e) => {
					e.stopPropagation();
					onRemoveFromBottom();
				}}
				title="Remove all rows from bottom up to this one">
				<IconCarbonDelete class={iconClass} />
			</button>
		{/if}
	</div>
</td>
