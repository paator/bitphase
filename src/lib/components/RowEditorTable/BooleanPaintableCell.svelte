<script lang="ts">
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';

	let {
		active,
		selected,
		isExpanded = false,
		title = '',
		display = '✓',
		variant = 'boolean',
		widthClass = '',
		onPaintBegin,
		onPaintOver
	}: {
		active: boolean;
		selected: boolean;
		isExpanded?: boolean;
		title?: string;
		display?: string;
		variant?: 'boolean' | 'accent';
		widthClass?: string;
		onPaintBegin: () => void;
		onPaintOver: () => void;
	} = $props();

	const cellClass = $derived.by(() => {
		if (selected) return ROW_SELECTION_STYLES.cell;
		if (variant === 'accent') {
			return active
				? 'bg-[var(--color-app-primary)]/30 text-[var(--color-app-primary)]'
				: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]';
		}
		return active
			? 'instrument-cell-boolean-on'
			: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]';
	});
</script>

<td
	class="cursor-pointer border border-[var(--color-app-border)] text-center {cellClass} {widthClass} {isExpanded
		? 'px-1'
		: 'px-0.5'}"
	tabindex="-1"
	{title}
	onmousedown={onPaintBegin}
	onmouseover={onPaintOver}
	onfocus={onPaintOver}>
	{display && active ? display : ''}
</td>
