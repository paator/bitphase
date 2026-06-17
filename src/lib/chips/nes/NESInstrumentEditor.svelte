<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import {
		BooleanPaintableCell,
		BooleanPaintDrag,
		CycleValueCell,
		createLoopMarkerMeasure,
		createRowEditorSelection,
		expandedHeaderActionsClass,
		expandedHeaderLoopClass,
		expandedHeaderRowClass,
		expandedRowHeightClass,
		expandedRowNumberSizeClass,
		IconColumnHeader,
		LoopMarkerOverlay,
		NamedRowEditorSync,
		ROW_EDITOR_MAX_ROWS,
		RowEditorActionsCell,
		RowEditorContainer,
		RowEditorLoopCell,
		RowEditorNameField,
		RowEditorTableFooter,
		SelectableRowNumberCell
	} from '../../components/RowEditorTable';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import {
		createDefaultNesInstrumentRow,
		cyclePulseWidth,
		ensureNesInstrumentRows,
		NES_PULSE_WIDTH_LABELS,
		type NesInstrumentRow
	} from './instrument';

	let {
		instrument,
		isExpanded = false,
		onInstrumentChange,
		selectedRowIndices = $bindable([])
	}: {
		instrument: Instrument;
		asHex: boolean;
		isExpanded: boolean;
		onInstrumentChange: (instrument: Instrument) => void;
		selectedRowIndices?: number[];
	} = $props();

	const TABLE_COLUMNS = 5;
	let tableRef: HTMLTableElement | null = $state(null);
	let editorContainerRef: HTMLDivElement | null = $state(null);

	const selection = createRowEditorSelection({
		getSelectedIndices: () => selectedRowIndices,
		setSelectedIndices: (indices) => {
			selectedRowIndices = indices;
		},
		getRowCount: () => editorSync.rows.length,
		focusContainer: () => editorContainerRef?.focus()
	});

	const editorSync = new NamedRowEditorSync<NesInstrumentRow>({
		getSource: () => instrument,
		normalizeRows: (rows) => ensureNesInstrumentRows(rows as Record<string, unknown>[]),
		onUpdate: (updates) => onInstrumentChange({ ...instrument, ...updates }),
		onSourceIdChange: () => {
			selectedRowIndices = [];
			selection.clearSelection();
		}
	});

	const booleanDrag = new BooleanPaintDrag();
	const loopMarker = createLoopMarkerMeasure(
		() => tableRef,
		() => editorSync.loopRow,
		() => editorSync.rows.length,
		() => isExpanded
	);

	function updateRow(index: number, patch: Partial<NesInstrumentRow>) {
		const current = editorSync.rows[index];
		const next = { ...current, ...patch };
		if (
			Object.keys(patch).every(
				(key) => current[key as keyof NesInstrumentRow] === next[key as keyof NesInstrumentRow]
			)
		) {
			return;
		}
		const nextRows = [...editorSync.rows];
		nextRows[index] = next;
		editorSync.applyRowChange(nextRows);
	}
</script>

<RowEditorContainer bind:editorContainerRef>
	<RowEditorNameField bind:name={editorSync.name} />

	<div class="relative mt-3 flex flex-col overflow-x-auto">
		<LoopMarkerOverlay style={loopMarker.style} />

		<table
			bind:this={tableRef}
			class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
			<thead>
				<tr>
					<th class={expandedHeaderRowClass(isExpanded)}>row</th>
					<th class={expandedHeaderActionsClass(isExpanded)}></th>
					<th class={expandedHeaderLoopClass(isExpanded)}>{isExpanded ? 'loop' : 'lp'}</th>
					<IconColumnHeader title="Retrigger" icon={IconCarbonRepeat} {isExpanded} class="w-8 min-w-8 px-1" />
					<IconColumnHeader
						title="Pulse width"
						icon={IconCarbonChartWinLoss}
						label="duty"
						{isExpanded}
						class="w-10 min-w-10 px-1" />
				</tr>
			</thead>
			<tbody>
				{#each editorSync.rows as row, index (index)}
					{@const selected = selection.isRowSelected(index)}
					<tr class="{expandedRowHeightClass(isExpanded)} {selected ? ROW_SELECTION_STYLES.row : ''}">
						<SelectableRowNumberCell
							{index}
							{selected}
							sizeClass={expandedRowNumberSizeClass(isExpanded)}
							onmousedown={(e) => selection.handleRowSelect(index, e)} />
						<RowEditorActionsCell
							{index}
							rowCount={editorSync.rows.length}
							{selected}
							{isExpanded}
							onRemove={() => editorSync.removeRow(index)}
							onRemoveFromBottom={() => editorSync.removeRowsFromBottom(index)} />
						<RowEditorLoopCell
							{selected}
							{isExpanded}
							onSelect={() => editorSync.setLoop(index)} />
						<BooleanPaintableCell
							active={row.retrigger}
							{selected}
							{isExpanded}
							title="Retrigger"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.retrigger,
									(value) => updateRow(index, { retrigger: value })
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateRow(index, { retrigger: value }))} />
						<CycleValueCell
							label={NES_PULSE_WIDTH_LABELS[row.pulseWidth]}
							labelClass="font-sans text-base leading-none"
							{selected}
							{isExpanded}
							title="Pulse width"
							onclick={() =>
								updateRow(index, { pulseWidth: cyclePulseWidth(row.pulseWidth) })} />
					</tr>
				{/each}
			</tbody>
			<RowEditorTableFooter
				colSpan={TABLE_COLUMNS}
				rowCount={editorSync.rows.length}
				maxRows={ROW_EDITOR_MAX_ROWS}
				rowHeightPx={isExpanded ? 32 : 28}
				onAdd={() => editorSync.addRow(createDefaultNesInstrumentRow)}
				onRowCountChange={(count) =>
					editorSync.setRowCount(count, createDefaultNesInstrumentRow, ROW_EDITOR_MAX_ROWS)} />
		</table>
	</div>
</RowEditorContainer>
