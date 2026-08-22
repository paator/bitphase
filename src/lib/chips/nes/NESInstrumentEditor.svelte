<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonWaveform from '~icons/carbon/waveform';
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
		PaintableValueGridCell,
		ROW_EDITOR_MAX_ROWS,
		RowEditorActionsCell,
		RowEditorContainer,
		RowEditorLoopCell,
		RowEditorNameField,
		RowEditorTableFooter,
		SelectableRowNumberCell,
		ValuePaintDrag
	} from '../../components/RowEditorTable';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import {
		formatRowEditorNumber,
		focusRowEditorInputInRow,
		shouldBlockRowEditorNumericKey
	} from '../../utils/row-editor-numeric';
	import { compactTableInputClass } from '../../utils/compact-table-input';
	import { CommitNumericInput } from '../../components/CommitNumericInput';
	import {
		createDefaultNesInstrumentRow,
		cyclePulseWidth,
		ensureNesInstrumentRows,
		isNesVolumeField,
		NES_PULSE_WIDTH_LABELS,
		type NESInstrumentFields,
		type NesInstrumentRow
	} from './instrument';
	import PillTabs, { type PillTab } from '../../components/PillTabs/PillTabs.svelte';
	import { AlertBanner } from '../../components/AlertBanner';
	import IconCarbonWarningAltFilled from '~icons/carbon/warning-alt-filled';
	import NESInstrumentSamplePanel from './NESInstrumentSamplePanel.svelte';
	import { instrumentHasSample } from '../ay/sample-region';

	type InstrumentTab = 'apu' | 'dpcm';

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

	let activeTab = $state<InstrumentTab>('apu');

	const extendedInstrument = $derived(instrument as Instrument & Partial<NESInstrumentFields>);
	const hasSample = $derived(instrumentHasSample(extendedInstrument));

 	const instrumentTabs = $derived.by((): PillTab[] => [
		{ id: 'apu', label: 'APU', icon: IconCarbonVolumeUp, disabled: hasSample },
		{ id: 'dpcm', label: 'DPCM', icon: IconCarbonWaveform }
	]);

	const TABLE_COLUMNS = 13;
	const VOLUME_VALUES = Array.from({ length: 16 }, (_, i) => i);
	const showVolumeGrid = $derived(isExpanded && activeTab === 'apu');
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
	const volumeDrag = new ValuePaintDrag<number>();
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
				(key) =>
					current[key as keyof NesInstrumentRow] === next[key as keyof NesInstrumentRow]
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

	$effect(() => {
		if (hasSample && activeTab !== 'dpcm') {
			activeTab = 'dpcm';
		}
	});
</script>

<RowEditorContainer bind:editorContainerRef>
	<RowEditorNameField bind:name={editorSync.name} />

	<PillTabs
	bind:activeTabId={activeTab}
	tabs={instrumentTabs}
	class="mt-3 ml-2"
	onSelect={(tabId) => {
		activeTab = tabId as InstrumentTab;
		}} />

	{#if activeTab === 'dpcm'}
		<AlertBanner variant="warning" class="mx-2 mt-2 px-3 py-2 text-xs">
			<div class="flex gap-2">
				<IconCarbonWarningAltFilled
					class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pattern-note-off)]" />
				<div class="min-w-0">
					<p class="font-medium text-[var(--color-pattern-note-off)]">
						Experimental — use at your own risk
					</p>
					<p class="mt-1 text-[var(--color-app-text-secondary)]">
						DPCM instruments are work in progress! Breaking changes to behavior may occur in future releases. Please report any issues you encounter.
					</p>
				</div>
			</div>
		</AlertBanner>
	{/if}

	{#if activeTab === 'dpcm'}
		<div class="mt-3 mr-2 ml-2 box-border min-w-0">
			<NESInstrumentSamplePanel {instrument} {isExpanded} {onInstrumentChange} />
		</div>
	{:else}
	<div class="mt-3 flex items-start gap-2 overflow-x-auto">
		<div class="relative flex flex-col">
			<LoopMarkerOverlay style={loopMarker.style} />

			<table
			bind:this={tableRef}
			class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
			<thead>
				<tr>
					<th class={expandedHeaderRowClass(isExpanded)}>row</th>
					<th class={expandedHeaderActionsClass(isExpanded)}></th>
					<th class={expandedHeaderLoopClass(isExpanded)}
						>{isExpanded ? 'loop' : 'lp'}</th>
					<IconColumnHeader
						title="Retrigger"
						icon={IconCarbonRepeat}
						{isExpanded}
						class="w-8 min-w-8 px-1" />
					<IconColumnHeader
						title="Pulse width / Noise type"
						icon={IconCarbonChartWinLoss}
						label="duty"
						{isExpanded}
						class="w-12 min-w-12 px-1" />
					<th
						class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5 text-[0.65rem]'}
						title="Tone Offset">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonChartWinLoss
								class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>+</span>
						</div>
					</th>
					<th
						class={isExpanded ? 'w-8 min-w-8 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Tone Accumulation">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonChartWinLoss
								class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>↑</span>
						</div>
					</th>
					<IconColumnHeader
						title="Hardware sweep, pulse channels only"
						icon={IconCarbonArrowsVertical}
						label="sw"
						{isExpanded}
						class="w-8 min-w-8 px-1" />
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Hardware sweep rate (0–7), pulse channels only">
						rate
					</th>
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Hardware sweep shift (−7–7), pulse channels only">
						shift
					</th>
					<th
						class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Sound length (0–511, 0 is infinite and enables looping envelope)">
						{isExpanded ? 'sound len' : 'len'}
					</th>
					<th
						class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Envelope (1) or constant volume (0), pulse and noise channels only">
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
				{#if showVolumeGrid}
					<tr>
						{#each { length: TABLE_COLUMNS } as _, columnIndex (columnIndex)}
							<th></th>
						{/each}
					</tr>
				{/if}
			</thead>
			<tbody>
				{#each editorSync.rows as row, index (index)}
					{@const selected = selection.isRowSelected(index)}
					<tr
						class="{expandedRowHeightClass(isExpanded)} {selected
							? ROW_SELECTION_STYLES.row
							: ''}">
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
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'retrigger', value)
								)} />
						<CycleValueCell
							label={NES_PULSE_WIDTH_LABELS[row.pulseWidth]}
							labelClass="font-sans text-[0.65rem] leading-none"
							{selected}
							{isExpanded}
							title="Pulse width / Noise type"
							onclick={() =>
								updateRow(index, {
									pulseWidth: cyclePulseWidth(row.pulseWidth)
								})} />
						<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
							<CommitNumericInput
								value={row.toneAdd}
								{asHex}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, { toneAdd: v })} />
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
									updateBooleanRow(index, 'toneAccumulation', value)
								)} />
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
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'sweep', value)
								)} />
						<td class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5'}>
							<CommitNumericInput
								value={row.sweepRate}
								{asHex}
								min={0}
								max={7}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, { sweepRate: v })} />
						</td>
						<td class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5'}>
							<CommitNumericInput
								value={row.sweepShift}
								{asHex}
								min={-7}
								max={7}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, { sweepShift: v })} />
						</td>
						<td class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 px-0.5'}>
							<CommitNumericInput
								value={row.soundLength}
								{asHex}
								min={0}
								max={511}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, { soundLength: v })} />
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
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'envelope', value)
								)} />
						<td class={isExpanded ? 'w-10 min-w-10 px-1' : 'w-10 px-0.5'}>
							<CommitNumericInput
								value={row.volumeOrRate}
								{asHex}
								min={0}
								max={15}
								title={isNesVolumeField(row.envelope)
									? 'Volume (0–15)'
									: 'Envelope rate (0–15)'}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, { volumeOrRate: v })} />
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
					editorSync.setRowCount(
						count,
						createDefaultNesInstrumentRow,
						ROW_EDITOR_MAX_ROWS
					)} />
			</table>
		</div>

		{#if showVolumeGrid}
			<table
				class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
				<thead>
					<tr>
						<th class="px-2 py-1.5">row</th>
						{#each VOLUME_VALUES as v (v)}
							<th
								class="w-6 min-w-6 bg-[var(--color-app-surface-secondary)] text-center"
								title={String(v)}>
								{formatRowEditorNumber(v, asHex)}
							</th>
						{/each}
					</tr>
					<tr>
						<th></th>
						{#each VOLUME_VALUES as v (v)}
							<th class="w-6 min-w-6"></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each editorSync.rows as row, index (index)}
						{@const selected = selection.isRowSelected(index)}
						<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
							<td
								class="border border-[var(--color-app-border)] px-2 text-right {selected
									? ROW_SELECTION_STYLES.rowNumber
									: 'bg-[var(--color-app-surface-secondary)]'}"
								>{index}</td>
							{#each VOLUME_VALUES as v (v)}
								<PaintableValueGridCell
									{index}
									value={v}
									currentValue={row.volumeOrRate}
									{selected}
									formatValue={(value) => formatRowEditorNumber(value, asHex)}
									onPaintBegin={(_, value) =>
										volumeDrag.begin(value, (paintValue) =>
											updateRow(index, { volumeOrRate: paintValue }))}
									onPaintOver={(_, value) =>
										volumeDrag.dragOverWithValue(value, (paintValue) =>
											updateRow(index, { volumeOrRate: paintValue }))} />
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
	{/if}
</RowEditorContainer>
