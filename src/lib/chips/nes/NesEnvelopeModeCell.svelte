<script lang="ts">
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import {
		NES_ENVELOPE_MODE_LABELS,
		type NesEnvelopeMode
	} from './instrument';

	let {
		mode,
		selected,
		isExpanded = false,
		onclick
	}: {
		mode: NesEnvelopeMode;
		selected: boolean;
		isExpanded?: boolean;
		onclick: () => void;
	} = $props();
</script>

<td
	class="cursor-pointer border border-[var(--color-app-border)] text-center {selected
		? ROW_SELECTION_STYLES.cell
		: 'bg-[var(--color-app-surface)] hover:bg-[var(--color-app-surface-secondary)]'} {isExpanded
		? 'w-10 min-w-10 px-1'
		: 'w-10 px-0.5'}"
	title={NES_ENVELOPE_MODE_LABELS[mode]}
	{onclick}>
	<svg
		class="mx-auto block {isExpanded ? 'h-4 w-8' : 'h-3 w-7'}"
		viewBox="0 0 32 16"
		aria-hidden="true">
		{#if mode === 'infinite'}
			<line
				x1="4"
				y1="8"
				x2="28"
				y2="8"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round" />
		{:else if mode === 'decay'}
			<polyline
				points="4,4 18,12 28,12"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round" />
		{:else if mode === 'loop'}
			<polyline
				points="4,4 12,10 20,4 28,10"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round" />
		{:else if mode === 'hold'}
			<polyline
				points="4,4 16,4 16,12 28,12"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round" />
		{:else}
			<line
				x1="10"
				y1="8"
				x2="22"
				y2="8"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-dasharray="3 3" />
		{/if}
	</svg>
</td>
