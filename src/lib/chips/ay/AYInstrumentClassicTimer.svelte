<script lang="ts">
	import RowResizeHandle from '../../components/RowResizeHandle/RowResizeHandle.svelte';
	import PillTabs, { type PillTab } from '../../components/PillTabs/PillTabs.svelte';
	import {
		createLoopMarkerMeasure,
		createRowEditorSelection,
		LoopMarkerOverlay,
		ROW_EDITOR_MAX_ROWS,
		RowEditorActionsCell,
		RowEditorAddRowButton,
		RowEditorLoopCell,
		SelectableRowNumberCell
	} from '../../components/RowEditorTable';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import AYTimerEffectsHeaderCells from './AYTimerEffectsHeaderCells.svelte';
	import AYTimerEffectsRowCells from './AYTimerEffectsRowCells.svelte';
	import AYTimerPwmControls from './AYTimerPwmControls.svelte';
	import { getAyTimerEffectsContext } from './ay-timer-effects-context';
	import type { TimerEditPanel, TimerEffectDragField } from './ay-timer-effects-controller.svelte';

	let { isExpanded = false }: { isExpanded?: boolean } = $props();

	const controller = getAyTimerEffectsContext();
	const timerEditTabs = $derived.by((): PillTab[] => [
		{ id: 'mix', label: 'Mix (SID / Sync)' },
		{ id: 'fm', label: 'FM' },
		{ id: 'envFm', label: 'Env+FM' }
	]);
	const rowCount = $derived.by(() => {
		void controller.fields.timerMacros;
		return controller.timerRowCount();
	});
	const loopRow = $derived.by(() => {
		void controller.fields.timerMacros;
		return controller.timerLoop();
	});
	const tableColSpan = $derived(3 + (controller.timerEditPanel === 'mix' ? 5 : 4));
	const rowIndices = $derived(Array.from({ length: rowCount }, (_, index) => index));

	let selectedRowIndices = $state<number[]>([]);
	let tableRef: HTMLTableElement | null = $state(null);
	let editorContainerRef: HTMLDivElement | null = $state(null);

	const selection = createRowEditorSelection({
		getSelectedIndices: () => selectedRowIndices,
		setSelectedIndices: (indices) => {
			selectedRowIndices = indices;
		},
		getRowCount: () => rowCount,
		focusContainer: () => editorContainerRef?.focus()
	});

	const loopMarker = createLoopMarkerMeasure(
		() => tableRef,
		() => loopRow,
		() => rowCount,
		() => `${isExpanded}-${controller.timerEditPanel}`
	);

	function paintTimerEffectAt(clientX: number, clientY: number): void {
		const cell = document
			.elementFromPoint(clientX, clientY)
			?.closest('[data-timer-effect-cell]') as HTMLElement | null;
		if (!cell) return;
		const rowIndex = Number(cell.dataset.rowIndex);
		const field = cell.dataset.timerEffectField as TimerEffectDragField | undefined;
		if (!field || Number.isNaN(rowIndex)) return;
		controller.dragOverTimerEffect(rowIndex, field);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!controller.isDragging) return;
		paintTimerEffectAt(event.clientX, event.clientY);
	}

	function handlePointerEnd(event: PointerEvent): void {
		if (!controller.isDragging) return;
		paintTimerEffectAt(event.clientX, event.clientY);
		controller.stopDrag();
		tableRef?.releasePointerCapture(event.pointerId);
	}
</script>

<svelte:window onmouseup={() => controller.stopDrag()} />

<PillTabs
	activeTabId={controller.timerEditPanel}
	tabs={timerEditTabs}
	size="sm"
	class="mt-2 ml-2"
	onSelect={(tabId) => controller.setTimerEditPanel(tabId as TimerEditPanel)} />

<div
	class="mt-3 flex items-start gap-2 overflow-x-auto outline-none focus:outline-none"
	bind:this={editorContainerRef}
	tabindex="-1">
	<div class="relative flex w-full min-w-0 flex-col">
		<LoopMarkerOverlay style={loopMarker.style} />
		<table
			bind:this={tableRef}
			class="row-editor-table w-full table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none"
			onpointermove={handlePointerMove}
			onpointerup={handlePointerEnd}
			onpointercancel={handlePointerEnd}>
			<thead>
				<tr>
					<th class={isExpanded ? 'w-14 min-w-14 px-2 py-1.5' : 'w-8 min-w-8 px-1 py-1'}>row</th>
					<th class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 min-w-10 px-0.5'}></th>
					<th class={isExpanded ? 'w-6 min-w-6 px-1.5' : 'w-4 min-w-4 px-0.5'}
						>{isExpanded ? 'loop' : 'lp'}</th>
					<AYTimerEffectsHeaderCells {isExpanded} />
				</tr>
			</thead>
			<tbody>
				{#each rowIndices as index (index)}
					{@const selected = selection.isRowSelected(index)}
					<tr class="{isExpanded ? 'h-8' : 'h-7'} {selected ? ROW_SELECTION_STYLES.row : ''}">
						<SelectableRowNumberCell
							{index}
							{selected}
							sizeClass={isExpanded
								? 'w-14 min-w-14 px-2 py-1.5'
								: 'w-8 min-w-8 px-1 py-1 text-[0.65rem]'}
							onmousedown={(e) => selection.handleRowSelect(index, e)} />
						<RowEditorActionsCell
							{index}
							rowCount={rowCount}
							{selected}
							{isExpanded}
							onRemove={() => controller.removeTimerRow(index)}
							onRemoveFromBottom={() => controller.removeTimerRowsFromBottom(index)} />
						<RowEditorLoopCell
							{selected}
							{isExpanded}
							onSelect={() => controller.setTimerLoop(index)} />
						<AYTimerEffectsRowCells {index} {selected} {isExpanded} />
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td
						colspan={tableColSpan}
						class="border-t border-[var(--color-app-border)] px-0 py-0">
						<AYTimerPwmControls {isExpanded} />
					</td>
				</tr>
				<tr>
					<td colspan={tableColSpan} class="px-2 py-1">
						<RowEditorAddRowButton onAdd={() => controller.addTimerRow()} />
					</td>
				</tr>
				<tr>
					<td colspan={tableColSpan} class="border-t border-[var(--color-app-border)] p-0">
						<RowResizeHandle
							rowCount={rowCount}
							onRowCountChange={(count) => controller.setTimerRowCount(count)}
							rowHeightPx={isExpanded ? 32 : 28}
							maxRows={ROW_EDITOR_MAX_ROWS} />
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
</div>
