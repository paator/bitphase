<script lang="ts">
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import { expandedLoopCellClass } from './row-editor-table-classes';

	let {
		selected,
		isExpanded = false,
		onSelect
	}: {
		selected: boolean;
		isExpanded?: boolean;
		onSelect: () => void;
	} = $props();
</script>

<td
	class="{expandedLoopCellClass(isExpanded)} {selected ? ROW_SELECTION_STYLES.cell : ''}"
	onclick={onSelect}>
</td>
