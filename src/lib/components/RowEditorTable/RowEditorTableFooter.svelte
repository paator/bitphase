<script lang="ts">
	import IconCarbonAdd from '~icons/carbon/add';
	import RowResizeHandle from '../RowResizeHandle/RowResizeHandle.svelte';

	let {
		colSpan,
		rowCount,
		maxRows,
		rowHeightPx,
		onAdd,
		onRowCountChange
	}: {
		colSpan: number;
		rowCount: number;
		maxRows: number;
		rowHeightPx: number;
		onAdd: () => void;
		onRowCountChange: (count: number) => void;
	} = $props();
</script>

<tfoot>
	<tr>
		<td colspan={colSpan} class="px-2 py-1">
			<div class="flex items-center justify-center">
				<button
					class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-pattern-table)]"
					onclick={onAdd}
					title="Add new row">
					<IconCarbonAdd class="mr-1 h-3.5 w-3.5" />
					<span class="mr-1 text-xs">Add new row</span>
				</button>
			</div>
		</td>
	</tr>
	<tr>
		<td colspan={colSpan} class="border-t border-[var(--color-app-border)] p-0">
			<RowResizeHandle {rowCount} {onRowCountChange} {rowHeightPx} maxRows={maxRows} />
		</td>
	</tr>
</tfoot>
