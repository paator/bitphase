<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonActivity from '~icons/carbon/activity';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import RowResizeHandle from '../../components/RowResizeHandle/RowResizeHandle.svelte';
	import {
		BooleanPaintableCell,
		BooleanPaintDrag,
		createLoopMarkerMeasure,
		createRowEditorSelection,
		LoopMarkerOverlay,
		NamedRowEditorSync,
		PaintableValueGridCell,
		ROW_EDITOR_MAX_ROWS,
		RowEditorActionsCell,
		RowEditorAddRowButton,
		RowEditorLoopCell,
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
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import {
		ACTION_INCREMENT_VALUE,
		ACTION_DECREMENT_VALUE,
		ACTION_TRANSPOSE_OCTAVE_UP,
		ACTION_TRANSPOSE_OCTAVE_DOWN
	} from '../../config/keybindings';
	import { isEditableElement } from '../../utils/shortcut-input-exclusion';
	import { resolveInstrumentMacros } from '../base/instrument-macros';
	import { AY_MIXER_MACRO_FIELDS, createDefaultAyMixerRow } from './mixer-macros';
	import {
		classicTableFromMacros,
		commitClassicTableMacros
	} from '../../components/Instruments/instrument-classic-source';

	type AyMixerRow = ReturnType<typeof createDefaultAyMixerRow> & {
		tone: boolean;
		noise: boolean;
		envelope: boolean;
		retriggerEnvelope: boolean;
		toneAdd: number;
		noiseAdd: number;
		envelopeAdd: number;
		volume: number;
		amplitudeSliding: boolean;
		amplitudeSlideUp: boolean;
		toneAccumulation: boolean;
		noiseAccumulation: boolean;
		envelopeAccumulation: boolean;
	};
	type BooleanInstrumentField =
		| 'tone'
		| 'noise'
		| 'envelope'
		| 'retriggerEnvelope'
		| 'toneAccumulation'
		| 'noiseAccumulation'
		| 'envelopeAccumulation';

	let {
		instrument,
		asHex = false,
		isExpanded = false,
		onInstrumentChange
	}: {
		instrument: Instrument;
		asHex: boolean;
		isExpanded: boolean;
		onInstrumentChange: (instrument: Instrument) => void;
	} = $props();

	const VOLUME_VALUES = Array.from({ length: 16 }, (_, i) => i);
	const MIXER_COLUMNS = 16;
	const NUMERIC_FIELDS = [
		{ key: 'toneAdd', min: -4096, max: 4095 },
		{ key: 'noiseAdd', min: -31, max: 31 },
		{ key: 'envelopeAdd', min: -255, max: 255 },
		{ key: 'volume', min: 0, max: 15 }
	] as const;

	let selectedRowIndices = $state<number[]>([]);
	let tableRef: HTMLTableElement | null = $state(null);
	let editorContainerRef: HTMLDivElement | null = $state(null);

	function coerceMixerRow(row: Record<string, unknown>): AyMixerRow {
		return { ...createDefaultAyMixerRow(), ...row } as AyMixerRow;
	}

	function tableSource() {
		const macros = resolveInstrumentMacros(instrument, AY_MIXER_MACRO_FIELDS);
		return classicTableFromMacros(instrument, AY_MIXER_MACRO_FIELDS, macros);
	}

	function commitTable(rows: AyMixerRow[], loop: number): void {
		onInstrumentChange(commitClassicTableMacros(instrument, AY_MIXER_MACRO_FIELDS, rows, loop));
	}

	const booleanDrag = new BooleanPaintDrag();
	const volumeDrag = new ValuePaintDrag<number>();

	const selection = createRowEditorSelection({
		getSelectedIndices: () => selectedRowIndices,
		setSelectedIndices: (indices) => {
			selectedRowIndices = indices;
		},
		getRowCount: () => mixerSync.rows.length,
		focusContainer: () => editorContainerRef?.focus()
	});

	const mixerSync = new NamedRowEditorSync<AyMixerRow>({
		getSource: () => tableSource(),
		normalizeRows: (rows) => {
			const list = rows.map((row) => coerceMixerRow(row as Record<string, unknown>));
			return list.length > 0 ? list : [coerceMixerRow(createDefaultAyMixerRow())];
		},
		onUpdate: (updates) => {
			if (updates.rows === undefined && updates.loop === undefined) return;
			commitTable(updates.rows ?? mixerSync.rows, updates.loop ?? mixerSync.loopRow);
		},
		onSourceIdChange: () => {
			selectedRowIndices = [];
			selection.clearSelection();
		}
	});

	const loopMarker = createLoopMarkerMeasure(
		() => tableRef,
		() => mixerSync.loopRow,
		() => mixerSync.rows.length,
		() => isExpanded
	);

	function updateRow(index: number, field: string, value: unknown) {
		if (mixerSync.rows[index][field as keyof AyMixerRow] === value) return;
		const nextRows = [...mixerSync.rows];
		nextRows[index] = { ...nextRows[index], [field]: value };
		mixerSync.applyRowChange(nextRows);
	}

	function updateBooleanRow(index: number, field: BooleanInstrumentField, value: boolean) {
		if (Boolean(mixerSync.rows[index][field]) === value) return;
		updateRow(index, field, value);
	}

	function incrementSelectedRows(delta: number) {
		if (selectedRowIndices.length === 0) return;
		const nextRows = [...mixerSync.rows];
		for (const index of selectedRowIndices) {
			let updated = { ...nextRows[index] };
			for (const { key, min, max } of NUMERIC_FIELDS) {
				const current = Number(updated[key] ?? 0);
				updated = { ...updated, [key]: Math.max(min, Math.min(max, current + delta)) };
			}
			nextRows[index] = updated;
		}
		mixerSync.applyRowChange(nextRows);
	}

	function cycleAmplitudeSlide(index: number) {
		const row = mixerSync.rows[index];
		const nextRows = [...mixerSync.rows];
		if (!row.amplitudeSliding) {
			nextRows[index] = { ...row, amplitudeSliding: true, amplitudeSlideUp: true };
		} else if (row.amplitudeSlideUp) {
			nextRows[index] = { ...row, amplitudeSlideUp: false };
		} else {
			nextRows[index] = { ...row, amplitudeSliding: false, amplitudeSlideUp: false };
		}
		mixerSync.applyRowChange(nextRows);
	}

	function handleNumericKeyDown(index: number, event: KeyboardEvent) {
		const key = event.key;
		const inputEl = event.target as HTMLInputElement;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = index + 1;
			if (nextIndex < mixerSync.rows.length) {
				focusRowEditorInputInRow(
					inputEl.closest('tr')?.nextElementSibling as HTMLTableRowElement | null,
					inputEl
				);
			} else if (nextIndex === mixerSync.rows.length) {
				mixerSync.addRow(() => coerceMixerRow(createDefaultAyMixerRow()));
				setTimeout(() => {
					focusRowEditorInputInRow(
						inputEl.closest('tr')?.nextElementSibling as HTMLTableRowElement | null,
						inputEl
					);
				}, 0);
			}
			return;
		}
		if (key === 'ArrowUp') {
			event.preventDefault();
			if (index > 0) {
				focusRowEditorInputInRow(
					inputEl.closest('tr')?.previousElementSibling as HTMLTableRowElement | null,
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
		const container = editorContainerRef;
		if (!container) return;
		const root: HTMLDivElement = container;
		function handleClickOutside(event: MouseEvent) {
			if (selectedRowIndices.length > 0 && !root.contains(event.target as Node)) {
				selection.clearSelection();
			}
		}
		function handleFocusOut(event: FocusEvent) {
			const related = event.relatedTarget as Node | null;
			if (!related || root.contains(related)) return;
			if (selectedRowIndices.length > 0) selection.clearSelection();
		}
		document.addEventListener('mousedown', handleClickOutside);
		root.addEventListener('focusout', handleFocusOut);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			root.removeEventListener('focusout', handleFocusOut);
		};
	});

	$effect(() => {
		const container = editorContainerRef;
		if (!container) return;
		function handleKeyDown(event: KeyboardEvent) {
			if (selectedRowIndices.length === 0) return;
			if (isEditableElement(event.target)) return;
			const action = keybindingsStore.getActionForShortcut(ShortcutString.fromEvent(event));
			const delta =
				action === ACTION_TRANSPOSE_OCTAVE_UP || action === ACTION_TRANSPOSE_OCTAVE_DOWN
					? 10
					: 1;
			if (action === ACTION_INCREMENT_VALUE || action === ACTION_TRANSPOSE_OCTAVE_UP) {
				event.preventDefault();
				incrementSelectedRows(delta);
			} else if (action === ACTION_DECREMENT_VALUE || action === ACTION_TRANSPOSE_OCTAVE_DOWN) {
				event.preventDefault();
				incrementSelectedRows(-delta);
			}
		}
		container.addEventListener('keydown', handleKeyDown);
		return () => container.removeEventListener('keydown', handleKeyDown);
	});
</script>

<div
	class="mt-3 flex items-start gap-2 overflow-x-auto outline-none focus:outline-none"
	bind:this={editorContainerRef}
	tabindex="-1">
	<div class="relative flex flex-col">
		<LoopMarkerOverlay style={loopMarker.style} />
		<table
			bind:this={tableRef}
			class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
			<thead>
				<tr>
					<th class={isExpanded ? 'w-14 min-w-14 px-2 py-1.5' : 'w-8 min-w-8 px-1 py-1'}>row</th>
					<th class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 min-w-10 px-0.5'}></th>
					<th class={isExpanded ? 'w-6 min-w-6 px-1.5' : 'w-4 min-w-4 px-0.5'}
						>{isExpanded ? 'loop' : 'lp'}</th>
					<th class="w-8 min-w-8 {isExpanded ? 'px-1' : 'px-0.5 text-[0.65rem]'}" title="Tone Generator">
						<div class="flex items-center justify-center">
							<IconCarbonChartWinLoss class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
						</div>
					</th>
					<th class="w-8 min-w-8 {isExpanded ? 'px-1' : 'px-0.5 text-[0.65rem]'}" title="Noise Generator">
						<div class="flex items-center justify-center">
							<IconCarbonWaveform class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
						</div>
					</th>
					<th class="w-8 min-w-8 {isExpanded ? 'px-1' : 'px-0.5 text-[0.65rem]'}" title="Hardware Envelope">
						<div class="flex items-center justify-center">
							<IconCarbonActivity class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
						</div>
					</th>
					<th
						class="w-8 min-w-8 {isExpanded ? 'px-1' : 'px-0.5 text-[0.65rem]'}"
						title="Retrigger envelope when this row is played (only when envelope is on)">
						<div class="flex items-center justify-center">
							<IconCarbonRepeat class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
						</div>
					</th>
					<th class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5 text-[0.65rem]'} title="Tone Offset">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonChartWinLoss class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>+</span>
						</div>
					</th>
					<th class={isExpanded ? 'w-8 min-w-8 px-1' : 'w-10 px-0.5 text-[0.65rem]'} title="Tone Accumulation">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonChartWinLoss class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>↑</span>
						</div>
					</th>
					<th class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5 text-[0.65rem]'} title="Noise Offset">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonWaveform class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>+</span>
						</div>
					</th>
					<th class={isExpanded ? 'w-8 min-w-8 px-1' : 'w-10 px-0.5 text-[0.65rem]'} title="Noise Accumulation">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonWaveform class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>↑</span>
						</div>
					</th>
					<th
						class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5 text-[0.65rem]'}
						title="Envelope Offset">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonActivity class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>+</span>
						</div>
					</th>
					<th
						class={isExpanded ? 'w-8 min-w-8 px-1' : 'w-10 px-0.5 text-[0.65rem]'}
						title="Envelope Accumulation">
						<div class="flex items-center justify-center gap-0.5">
							<IconCarbonActivity class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
							<span>↑</span>
						</div>
					</th>
					<th class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-12 px-0.5 text-[0.65rem]'} title="Volume Level">
						<div class="flex items-center justify-center">
							<IconCarbonVolumeUp class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
						</div>
					</th>
					<th
						class="w-8 min-w-8 {isExpanded ? 'px-1' : 'px-0.5 text-[0.65rem]'}"
						title="Amplitude Slide: ↑ up / ↓ down / blank off">
						<div class="flex items-center justify-center">
							<IconCarbonArrowsVertical class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
						</div>
					</th>
				</tr>
				{#if isExpanded}
					<tr>
						{#each { length: MIXER_COLUMNS } as _, columnIndex (columnIndex)}
							<th></th>
						{/each}
					</tr>
				{/if}
			</thead>
			<tbody>
				{#each mixerSync.rows as row, index (index)}
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
							rowCount={mixerSync.rows.length}
							{selected}
							{isExpanded}
							onRemove={() => mixerSync.removeRow(index)}
							onRemoveFromBottom={() => mixerSync.removeRowsFromBottom(index)} />
						<RowEditorLoopCell
							{selected}
							{isExpanded}
							onSelect={() => mixerSync.setLoop(index)} />
						<BooleanPaintableCell
							active={row.tone}
							{selected}
							{isExpanded}
							widthClass="w-8 min-w-8"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.tone,
									(value) => updateBooleanRow(index, 'tone', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateBooleanRow(index, 'tone', value))} />
						<BooleanPaintableCell
							active={row.noise}
							{selected}
							{isExpanded}
							widthClass="w-8 min-w-8"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.noise,
									(value) => updateBooleanRow(index, 'noise', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateBooleanRow(index, 'noise', value))} />
						<BooleanPaintableCell
							active={row.envelope}
							{selected}
							{isExpanded}
							widthClass="w-8 min-w-8"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.envelope,
									(value) => updateBooleanRow(index, 'envelope', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) => updateBooleanRow(index, 'envelope', value))} />
						<BooleanPaintableCell
							active={row.retriggerEnvelope}
							{selected}
							{isExpanded}
							title="Retrigger envelope when this row is played"
							widthClass="w-8 min-w-8"
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.retriggerEnvelope,
									(value) => updateBooleanRow(index, 'retriggerEnvelope', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'retriggerEnvelope', value))} />
						<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
							<CommitNumericInput
								value={row.toneAdd}
								{asHex}
								min={-4096}
								max={4095}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, 'toneAdd', v)} />
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
						<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
							<CommitNumericInput
								value={row.noiseAdd}
								{asHex}
								min={-31}
								max={31}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, 'noiseAdd', v)} />
						</td>
						<BooleanPaintableCell
							active={row.noiseAccumulation}
							{selected}
							{isExpanded}
							variant="accent"
							display="↑"
							widthClass={isExpanded ? 'w-8 min-w-8' : ''}
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.noiseAccumulation,
									(value) => updateBooleanRow(index, 'noiseAccumulation', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'noiseAccumulation', value))} />
						<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
							<CommitNumericInput
								value={row.envelopeAdd}
								{asHex}
								min={-255}
								max={255}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, 'envelopeAdd', v)} />
						</td>
						<BooleanPaintableCell
							active={row.envelopeAccumulation}
							{selected}
							{isExpanded}
							variant="accent"
							display="↑"
							widthClass={isExpanded ? 'w-8 min-w-8' : ''}
							onPaintBegin={() =>
								booleanDrag.begin(
									() => row.envelopeAccumulation,
									(value) => updateBooleanRow(index, 'envelopeAccumulation', value)
								)}
							onPaintOver={() =>
								booleanDrag.dragOver((value) =>
									updateBooleanRow(index, 'envelopeAccumulation', value))} />
						<td class={isExpanded ? 'w-12 min-w-12 px-1.5' : 'w-12 px-0.5'}>
							<CommitNumericInput
								value={row.volume}
								{asHex}
								min={0}
								max={15}
								maxDigits={asHex ? 1 : undefined}
								class={compactTableInputClass({ selected, isExpanded })}
								onkeydown={(e) => handleNumericKeyDown(index, e)}
								onValueChange={(v) => updateRow(index, 'volume', v)} />
						</td>
						<td
							class="w-8 min-w-8 {isExpanded
								? 'px-1'
								: 'px-0.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
								? ROW_SELECTION_STYLES.cell
								: row.amplitudeSliding && row.amplitudeSlideUp
									? 'instrument-cell-boolean-on'
									: row.amplitudeSliding
										? 'instrument-cell-slide-negative'
										: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]'}"
							onclick={() => cycleAmplitudeSlide(index)}
							title={row.amplitudeSliding
								? row.amplitudeSlideUp
									? 'Slide up'
									: 'Slide down'
								: 'No slide'}>
							<span class="inline-block min-w-[1ch]"
								>{row.amplitudeSliding ? (row.amplitudeSlideUp ? '↑' : '↓') : ''}</span>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td colspan={MIXER_COLUMNS} class="px-2 py-1">
						<RowEditorAddRowButton
							onAdd={() => mixerSync.addRow(() => coerceMixerRow(createDefaultAyMixerRow()))} />
					</td>
				</tr>
				<tr>
					<td colspan={MIXER_COLUMNS} class="border-t border-[var(--color-app-border)] p-0">
						<RowResizeHandle
							rowCount={mixerSync.rows.length}
							onRowCountChange={(count) =>
								mixerSync.setRowCount(
									count,
									() => coerceMixerRow(createDefaultAyMixerRow()),
									ROW_EDITOR_MAX_ROWS
								)}
							rowHeightPx={isExpanded ? 32 : 28}
							maxRows={ROW_EDITOR_MAX_ROWS} />
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
	{#if isExpanded}
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
				{#each mixerSync.rows as row, index (index)}
					{@const selected = selection.isRowSelected(index)}
					<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
						<td
							class="border border-[var(--color-app-border)] px-2 text-right {selected
								? ROW_SELECTION_STYLES.rowNumber
								: 'bg-[var(--color-app-surface-secondary)]'}">{index}</td>
						{#each VOLUME_VALUES as v (v)}
							<PaintableValueGridCell
								{index}
								value={v}
								currentValue={row.volume}
								{selected}
								formatValue={(value) => formatRowEditorNumber(value, asHex)}
								onPaintBegin={(_, value) =>
									volumeDrag.begin(value, (paintValue) =>
										updateRow(index, 'volume', paintValue))}
								onPaintOver={(_, value) =>
									volumeDrag.dragOverWithValue(value, (paintValue) =>
										updateRow(index, 'volume', paintValue))} />
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
