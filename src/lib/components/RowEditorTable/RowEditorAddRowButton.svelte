<script lang="ts">
	import IconCarbonAdd from '~icons/carbon/add';

	let { onAdd }: { onAdd: () => void } = $props();
</script>

<div class="flex items-center justify-center">
	<button
		class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-pattern-table)]"
		onclick={onAdd}
		title="Add new row">
		<IconCarbonAdd class="mr-1 h-3.5 w-3.5" />
		<span class="mr-1 text-xs">Add new row</span>
	</button>
</div>
