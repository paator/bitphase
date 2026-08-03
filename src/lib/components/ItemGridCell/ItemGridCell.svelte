<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconCarbonCopy from '~icons/carbon/copy';
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import { OverlayIconButton } from '../OverlayIconButton';
	import {
		itemGridCellBackground,
		itemGridIdTextClass,
		itemGridNameTextClass
	} from '../../utils/item-grid-cell';

	let {
		dataIndexKind,
		dataValue,
		isSelected,
		isUsed,
		isEditing,
		idLabel,
		nameLabel,
		copyTitle,
		removeTitle,
		onSelect,
		onDoubleClick,
		onCopy,
		onRemove,
		showCopy = true,
		showRemove = true,
		edit
	}: {
		dataIndexKind: 'instrument' | 'table';
		dataValue: number;
		isSelected: boolean;
		isUsed: boolean;
		isEditing: boolean;
		idLabel: string;
		nameLabel: string;
		copyTitle: string;
		removeTitle: string;
		onSelect: () => void;
		onDoubleClick: () => void;
		onCopy: (event: MouseEvent) => void;
		onRemove: (event: MouseEvent) => void;
		showCopy?: boolean;
		showRemove?: boolean;
		edit: Snippet;
	} = $props();

	const bgClass = $derived(itemGridCellBackground(isSelected, isUsed));
	const dataIndexAttr = $derived(
		dataIndexKind === 'instrument' ? { 'data-instrument-index': dataValue } : { 'data-table-index': dataValue }
	);
</script>

{#if isEditing}
	<div
		{...dataIndexAttr}
		class="group relative flex min-w-[6rem] shrink-0 flex-col items-center justify-center border-r border-[var(--color-app-border)] p-3 {bgClass}">
		{@render edit()}
	</div>
{:else}
	<div
		{...dataIndexAttr}
		class="group relative flex min-w-[6rem] shrink-0 flex-col items-center border-r border-[var(--color-app-border)]">
		<button
			type="button"
			class="flex h-full w-full shrink-0 cursor-pointer flex-col items-center justify-center p-3 {bgClass}"
			onclick={onSelect}
			ondblclick={onDoubleClick}>
			<span class="font-mono text-xs font-semibold {itemGridIdTextClass(isSelected, isUsed)}">
				{idLabel}
			</span>
			<span class="text-xs {itemGridNameTextClass(isSelected, isUsed)}">
				{nameLabel}
			</span>
		</button>
		<div
			class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
			{#if showCopy}
				<OverlayIconButton icon={IconCarbonCopy} title={copyTitle} onclick={onCopy} />
			{/if}
			{#if showRemove}
				<OverlayIconButton
					icon={IconCarbonTrashCan}
					title={removeTitle}
					destructive
					onclick={onRemove} />
			{/if}
		</div>
	</div>
{/if}
