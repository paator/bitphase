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
	import { ITEM_COMPACT_ROW_HEIGHT } from '../../config/item-grid';

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
		layout = 'grid',
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
		layout?: 'grid' | 'list';
		edit: Snippet;
	} = $props();

	const bgClass = $derived(itemGridCellBackground(isSelected, isUsed));
	const isList = $derived(layout === 'list');
	const dataIndexAttr = $derived(
		dataIndexKind === 'instrument'
			? { 'data-instrument-index': dataValue }
			: { 'data-table-index': dataValue }
	);
	const shellClass = $derived(
		isList
			? 'group relative flex w-full min-w-0 shrink-0 items-stretch border-b border-[var(--color-app-border)]'
			: 'group relative flex min-w-[6rem] shrink-0 flex-col items-center border-r border-[var(--color-app-border)]'
	);
	const editShellClass = $derived(
		isList
			? `${shellClass} px-2 py-0.5 ${bgClass}`
			: `${shellClass} justify-center p-3 ${bgClass}`
	);
	const buttonClass = $derived(
		isList
			? `flex w-full min-w-0 cursor-pointer items-center gap-2 py-0.5 pr-12 pl-2 ${bgClass}`
			: `flex h-full w-full shrink-0 cursor-pointer flex-col items-center justify-center p-3 ${bgClass}`
	);
	const idClass = $derived(
		isList
			? `w-5 shrink-0 font-mono text-[0.65rem] font-semibold ${itemGridIdTextClass(isSelected, isUsed)}`
			: `font-mono text-xs font-semibold ${itemGridIdTextClass(isSelected, isUsed)}`
	);
	const nameClass = $derived(
		isList
			? `min-w-0 truncate text-[0.65rem] ${itemGridNameTextClass(isSelected, isUsed)}`
			: `text-xs ${itemGridNameTextClass(isSelected, isUsed)}`
	);
	const actionsClass = $derived(
		isList
			? 'absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'
			: 'absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'
	);
</script>

{#if isEditing}
	<div {...dataIndexAttr} class={editShellClass}>
		{@render edit()}
	</div>
{:else}
	<div {...dataIndexAttr} class={shellClass}>
		<button
			type="button"
			class={buttonClass}
			style:min-height={isList ? `${ITEM_COMPACT_ROW_HEIGHT}px` : undefined}
			onclick={onSelect}
			ondblclick={onDoubleClick}>
			<span class={idClass}>
				{idLabel}
			</span>
			<span class={nameClass}>
				{nameLabel}
			</span>
		</button>
		<div class={actionsClass}>
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
