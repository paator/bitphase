<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
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
		formatRowEditorNumber,
		focusRowEditorInputInRow,
		parseRowEditorNumericText,
		shouldBlockRowEditorNumericKey
	} from '../../utils/row-editor-numeric';
	import { compactTableInputClass } from '../../utils/compact-table-input';
	import {
		createDefaultNesInstrumentRow,
		cyclePulseWidth,
		ensureNesInstrumentRows,
		isNesVolumeField,
		NES_PULSE_WIDTH_LABELS,
		type NesInstrumentRow
	} from './instrument';

	let {
		instrument,
		asHex = false,
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

	const TABLE_COLUMNS = 13;
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

	function updateBooleanRow(
		index: number,
		field: 'retrigger' | 'toneAccumulation' | 'sweep' | 'envelope',
		value: boolean
	) {
		if (Boolean(editorSync.rows[index][field]) === value) return;
		updateRow(index, { [field]: value });
	}

	function updateNumericField(
		index: number,
		field: 'toneAdd' | 'sweepRate' | 'sweepShift' | 'soundLength' | 'volumeOrRate',
		event: Event,
		limits?: { min?: number; max?: number }
	) {
		const inputEl = event.target as HTMLInputElement;
		const parsed = parseRowEditorNumericText(inputEl.value, asHex, limits);
		if (parsed !== null) {
			const normalized = formatRowEditorNumber(parsed, asHex);
			if (inputEl.value !== normalized) {
				inputEl.value = normalized;
			}
			updateRow(index, { [field]: parsed });
		}
	}

	function handleNumericKeyDown(index: number, event: KeyboardEvent) {
		const key = event.key;
		const inputEl = event.target as HTMLInputElement;

		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = index + 1;
			if (nextIndex < editorSync.rows.length) {
				const currentRow = inputEl.closest('tr');
				focusRowEditorInputInRow(
					currentRow?.nextElementSibling as HTMLTableRowElement | null,
					inputEl
				);
			} else if (nextIndex === editorSync.rows.length) {
				editorSync.addRow(createDefaultNesInstrumentRow);
				setTimeout(() => {
					const currentRow = inputEl.closest('tr');
					focusRowEditorInputInRow(
						currentRow?.nextElementSibling as HTMLTableRowElement | null,
						inputEl
					);
				}, 0);
			}
			return;
		}

		if (key === 'ArrowUp') {
			event.preventDefault();
			const prevIndex = index - 1;
			if (prevIndex >= 0) {
				const currentRow = inputEl.closest('tr');
				focusRowEditorInputInRow(
					currentRow?.previousElementSibling as HTMLTableRowElement | null,
					inputEl
				);
			}
			return;
		}

		if (shouldBlockRowEditorNumericKey(key, asHex)) {
			event.preventDefault();
		}
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
					<th
						class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5 text-[0.65rem]'}
						title="Tone Offset">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonChartWinLoss class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>+</span>
						</div>
					</th>
					<th
						class={isExpanded ? 'w-8 min-w-8 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Tone Accumulation">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonChartWinLoss class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>↑</span>
						</div>
					</th>
					<IconColumnHeader
						title="Hardware sweep"
						icon={IconCarbonArrowsVertical}
						label="sw"
						{isExpanded}
						class="w-8 min-w-8 px-1" />
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Hardware sweep rate (0–7)">
						rate
					</th>
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Hardware sweep shift (−7–7)">
						shift
					</th>
					<th
						class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Sound length (0–511, length counter setting)">
						{isExpanded ? 'sound len' : 'len'}
					</th>
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Envelope (1) or constant volume (0)">
						env
					</th>
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Volume or envelope rate depending on mode">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonVolumeUp class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>/rate</span>
						</div>
					</th>
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
									(value) => updateBooleanRow(index, 'retrigger', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateBooleanRow(index, 'retrigger', value))} />
						<CycleValueCell
							label={NES_PULSE_WIDTH_LABELS[row.pulseWidth]}
							labelClass="font-sans text-base leading-none"
							{selected}
							{isExpanded}
							title="Pulse width"
							onclick={() =>
								updateRow(index, { pulseWidth: cyclePulseWidth(row.pulseWidth) })} />
						<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
							<input
								type="text"
								class={compactTableInputClass({ selected, isExpanded })}
								value={formatRowEditorNumber(row.toneAdd, asHex)}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
								oninput={(e) => updateNumericField(index, 'toneAdd', e)} />
						</td>
						<BooleanPaintableCell
							active={row.toneAccumulation}
							{selected}
							{isExpanded}
							variant="accent"
							display="↑"
							widthClass={isExpanded ? 'w-8 min-w-8' : ''}
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.toneAccumulation,
									(value) => updateBooleanRow(index, 'toneAccumulation', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'toneAccumulation', value))} />
						<BooleanPaintableCell
							active={row.sweep}
							{selected}
							{isExpanded}
							title="Hardware sweep"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.sweep,
									(value) => updateBooleanRow(index, 'sweep', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateBooleanRow(index, 'sweep', value))} />
						<td class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5'}>
							<input
								type="text"
								class={compactTableInputClass({ selected, isExpanded })}
								value={formatRowEditorNumber(row.sweepRate, asHex)}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
								oninput={(e) => updateNumericField(index, 'sweepRate', e, { min: 0, max: 7 })} />
						</td>
						<td class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5'}>
							<input
								type="text"
								class={compactTableInputClass({ selected, isExpanded })}
								value={formatRowEditorNumber(row.sweepShift, asHex)}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
								oninput={(e) =>
									updateNumericField(index, 'sweepShift', e, { min: -7, max: 7 })} />
						</td>
						<td class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 px-0.5'}>
							<input
								type="text"
								class={compactTableInputClass({ selected, isExpanded })}
								value={formatRowEditorNumber(row.soundLength, asHex)}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
								oninput={(e) =>
									updateNumericField(index, 'soundLength', e, { min: 0, max: 511 })} />
						</td>
						<BooleanPaintableCell
							active={row.envelope}
							{selected}
							{isExpanded}
							title="Envelope (1) or constant volume (0)"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.envelope,
									(value) => updateBooleanRow(index, 'envelope', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateBooleanRow(index, 'envelope', value))} />
						<td class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5'}>
							<input
								type="text"
								class={compactTableInputClass({ selected, isExpanded })}
								value={formatRowEditorNumber(row.volumeOrRate, asHex)}
								title={isNesVolumeField(row.envelope)
									? 'Volume (0–15)'
									: 'Envelope rate (0–15)'}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
								oninput={(e) =>
									updateNumericField(index, 'volumeOrRate', e, { min: 0, max: 15 })} />
						</td>
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
