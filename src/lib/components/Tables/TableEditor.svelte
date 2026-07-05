<script lang="ts">
	import type { Table } from '../../models/project';
	import RowResizeHandle from '../RowResizeHandle/RowResizeHandle.svelte';
	import {
		createLoopMarkerMeasure,
		createRowEditorSelection,
		LoopMarkerOverlay,
		NamedRowEditorSync,
		PaintableValueGridCell,
		ROW_EDITOR_MAX_ROWS,
		RowEditorActionsCell,
		RowEditorAddRowButton,
		RowEditorLoopCell,
		RowEditorNameField,
		SelectableRowNumberCell,
		ValuePaintDrag
	} from '../RowEditorTable';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import { compactTableInputClass } from '../../utils/compact-table-input';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import {
		ACTION_INCREMENT_VALUE,
		ACTION_DECREMENT_VALUE,
		ACTION_TRANSPOSE_OCTAVE_UP,
		ACTION_TRANSPOSE_OCTAVE_DOWN
	} from '../../config/keybindings';
	import { isEditableElement } from '../../utils/shortcut-input-exclusion';
	import {
		formatRowEditorNumber,
		focusRowEditorInputInRow,
		parseRowEditorNumericText,
		shouldBlockRowEditorNumericKey
	} from '../../utils/row-editor-numeric';

	let {
		table,
		asHex = false,
		isExpanded = false,
		onTableChange,
		selectedRowIndices = $bindable([])
	}: {
		table: Table;
		asHex: boolean;
		isExpanded: boolean;
		onTableChange: (table: Table) => void;
		selectedRowIndices?: number[];
	} = $props();

	let editorContainerRef: HTMLDivElement | null = $state(null);
	let tableRef: HTMLTableElement | null = $state(null);
	let offsetInputRefs: (HTMLInputElement | null)[] = $state([]);
	let pitches = $state<number[]>([]);
	let shifts = $state<number[]>([]);

	const PITCH_VALUES = Array.from({ length: 23 }, (_, i) => i - 11);
	const SHIFT_VALUES = Array.from({ length: 15 }, (_, i) => i - 7);
	const showOffsetGrid = $derived(isExpanded);
	const showOctaveGrid = $derived(isExpanded);
	const tableColSpan = $derived(showOffsetGrid ? 29 : 4);
	const isAdditive = $derived(table.additive);

	function setAdditive(additive: boolean): void {
		if (isAdditive === additive) return;
		onTableChange({ ...table, additive });
	}

	function ensureNonEmptyRows(rowsArray: number[]): number[] {
		return rowsArray.length === 0 ? [0] : rowsArray;
	}

	function offsetToPitch(offset: number): number {
		let pitch = offset % 12;
		if (pitch > 11) pitch -= 12;
		if (pitch < -11) pitch += 12;
		return pitch;
	}

	function pitchShiftToOffset(pitch: number, shift: number): number {
		return pitch + shift * 12;
	}

	function syncPitchShiftFromRows(rowList: number[]): void {
		const newPitches: number[] = [];
		const newShifts: number[] = [];
		for (const offset of rowList) {
			const pitch = offsetToPitch(offset);
			newPitches.push(pitch);
			newShifts.push(Math.trunc((offset - pitch) / 12));
		}
		pitches = newPitches;
		shifts = newShifts;
	}

	const selection = createRowEditorSelection({
		getSelectedIndices: () => selectedRowIndices,
		setSelectedIndices: (indices) => {
			selectedRowIndices = indices;
		},
		getRowCount: () => editorSync.rows.length,
		focusContainer: () => editorContainerRef?.focus()
	});

	const editorSync = new NamedRowEditorSync<number>({
		getSource: () => table,
		normalizeRows: (rows) => ensureNonEmptyRows(rows as number[]),
		onUpdate: (updates) => onTableChange({ ...table, ...updates }),
		onSourceIdChange: () => {
			selectedRowIndices = [];
			selection.clearSelection();
		}
	});

	const pitchDrag = new ValuePaintDrag<number>();
	const shiftDrag = new ValuePaintDrag<number>();
	const loopMarker = createLoopMarkerMeasure(
		() => tableRef,
		() => editorSync.loopRow,
		() => editorSync.rows.length,
		() => isExpanded
	);

	$effect(() => {
		syncPitchShiftFromRows(editorSync.rows);
	});

	$effect(() => {
		const rowCount = editorSync.rows.length;
		if (offsetInputRefs.length !== rowCount) {
			const newRefs = new Array(rowCount).fill(null);
			for (let i = 0; i < Math.min(offsetInputRefs.length, rowCount); i++) {
				newRefs[i] = offsetInputRefs[i];
			}
			offsetInputRefs = newRefs;
		}
	});

	function setValue(mode: 'pitch' | 'shift', index: number, value: number): void {
		if (mode === 'pitch' && pitches[index] === value) return;
		if (mode === 'shift' && shifts[index] === value) return;
		const nextPitches = [...pitches];
		const nextShifts = [...shifts];
		if (mode === 'pitch') {
			nextPitches[index] = value;
		} else {
			nextShifts[index] = value;
		}
		const nextRows = [...editorSync.rows];
		nextRows[index] = pitchShiftToOffset(nextPitches[index], nextShifts[index]);
		pitches = nextPitches;
		shifts = nextShifts;
		editorSync.applyRowChange(nextRows);
	}

	function adjustRowOffset(index: number, newOffset: number): void {
		const nextRows = [...editorSync.rows];
		nextRows[index] = newOffset;
		editorSync.applyRowChange(nextRows);
	}

	function incrementSelectedRows(delta: number): void {
		if (selectedRowIndices.length === 0) return;
		const nextRows = [...editorSync.rows];
		for (const index of selectedRowIndices) {
			nextRows[index] = nextRows[index] + delta;
		}
		editorSync.applyRowChange(nextRows);
	}

	function onOffsetInput(index: number, event: Event): void {
		const inputEl = event.target as HTMLInputElement;
		const parsed = parseRowEditorNumericText(inputEl.value, asHex);
		if (parsed !== null) {
			const normalized = formatRowEditorNumber(parsed, asHex);
			if (inputEl.value !== normalized) {
				inputEl.value = normalized;
			}
			adjustRowOffset(index, parsed);
		}
	}

	function handleOffsetKeyDown(index: number, event: KeyboardEvent): void {
		const key = event.key;
		const inputEl = event.target as HTMLInputElement;

		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = index + 1;
			if (nextIndex < editorSync.rows.length) {
				const currentRow = inputEl.closest('tr');
				focusRowEditorInputInRow(currentRow?.nextElementSibling as HTMLTableRowElement | null);
			} else if (nextIndex === editorSync.rows.length) {
				editorSync.addRow(() => 0);
				setTimeout(() => {
					const currentRow = inputEl.closest('tr');
					focusRowEditorInputInRow(currentRow?.nextElementSibling as HTMLTableRowElement | null);
				}, 0);
			}
			return;
		}

		if (key === 'ArrowUp') {
			event.preventDefault();
			const prevIndex = index - 1;
			if (prevIndex >= 0) {
				const currentRow = inputEl.closest('tr');
				focusRowEditorInputInRow(currentRow?.previousElementSibling as HTMLTableRowElement | null);
			}
			return;
		}

		if (shouldBlockRowEditorNumericKey(key, asHex)) {
			event.preventDefault();
		}
	}

	export function addRowExternal(): void {
		editorSync.addRow(() => 0);
	}

	export function removeLastRowExternal(): void {
		editorSync.removeRow(editorSync.rows.length - 1);
	}

	$effect(() => {
		const containerEl = editorContainerRef;
		if (!containerEl) return;

		function handleClickOutside(event: MouseEvent): void {
			const target = event.target as Node;
			if (selectedRowIndices.length > 0 && !containerEl!.contains(target)) {
				selection.clearSelection();
			}
		}

		function handleFocusOut(event: FocusEvent): void {
			const relatedTarget = event.relatedTarget as Node | null;
			if (!relatedTarget) return;
			if (containerEl!.contains(relatedTarget)) return;
			if (selectedRowIndices.length > 0) {
				selection.clearSelection();
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		containerEl.addEventListener('focusout', handleFocusOut);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			containerEl.removeEventListener('focusout', handleFocusOut);
		};
	});

	$effect(() => {
		const container = editorContainerRef;
		if (!container) return;

		function handleKeyDown(event: KeyboardEvent): void {
			if (selectedRowIndices.length === 0) return;
			if (isEditableElement(event.target)) return;
			const shortcut = ShortcutString.fromEvent(event);
			const action = keybindingsStore.getActionForShortcut(shortcut);
			const delta =
				action === ACTION_TRANSPOSE_OCTAVE_UP || action === ACTION_TRANSPOSE_OCTAVE_DOWN ? 10 : 1;
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
	class="w-full overflow-x-auto outline-none focus:outline-none"
	bind:this={editorContainerRef}
	tabindex="-1">
	<RowEditorNameField bind:name={editorSync.name} class="mb-2" />

	<div class="mb-2 ml-2 flex flex-wrap items-center gap-4">
		<label class="flex cursor-pointer items-center gap-1.5 select-none">
			<input
				type="checkbox"
				class="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] text-[var(--color-app-primary)] focus:ring-2 focus:ring-[var(--color-app-primary)]"
				checked={isAdditive}
				title="Each row value adds to the running offset while the table plays"
				onchange={(event) =>
					setAdditive((event.currentTarget as HTMLInputElement).checked)} />
			<span class="text-xs text-[var(--color-app-text-muted)]">Additive</span>
		</label>
	</div>

	<div class="flex items-start gap-2 overflow-x-auto">
		<div class="relative flex flex-col">
			<LoopMarkerOverlay style={loopMarker.style} />

			<table
				bind:this={tableRef}
				class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
				<thead>
					<tr>
						<th class="px-2 py-1.5">row</th>
						<th class="w-8 px-1.5"></th>
						<th class="w-6 px-1.5">loop</th>
						<th class="w-14 px-1.5">offset</th>
						{#if showOffsetGrid}
							<th colspan="25" class="px-2">note key offset</th>
						{/if}
					</tr>
					{#if showOffsetGrid}
						<tr>
							<th></th>
							<th></th>
							<th></th>
							<th></th>
							{#each PITCH_VALUES as p}
								<th
									class="w-6 min-w-6 bg-[var(--color-app-surface-secondary)] text-center"
									title={String(p)}></th>
							{/each}
						</tr>
					{/if}
				</thead>
				<tbody>
					{#each editorSync.rows as offset, index}
						{@const selected = selection.isRowSelected(index)}
						<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
							<SelectableRowNumberCell
								{index}
								{selected}
								sizeClass="px-2 py-1.5"
								onmousedown={(e) => selection.handleRowSelect(index, e)} />
							<RowEditorActionsCell
								{index}
								rowCount={editorSync.rows.length}
								{selected}
								isExpanded={true}
								onRemove={() => editorSync.removeRow(index)}
								onRemoveFromBottom={() => editorSync.removeRowsFromBottom(index)} />
							<RowEditorLoopCell
								{selected}
								isExpanded={true}
								onSelect={() => editorSync.setLoop(index)} />
							<td class="w-14 px-1.5">
								<input
									type="text"
									bind:this={offsetInputRefs[index]}
									class={compactTableInputClass({ selected })}
									value={formatRowEditorNumber(offset, asHex)}
									onkeydown={(e) => handleOffsetKeyDown(index, e)}
									onfocus={(e) => (e.target as HTMLInputElement).select()}
									oninput={(e) => onOffsetInput(index, e)} />
							</td>
							{#if showOffsetGrid}
								{#each PITCH_VALUES as p}
									<PaintableValueGridCell
										{index}
										value={p}
										currentValue={pitches[index]}
										{selected}
										formatValue={(v) => formatRowEditorNumber(v, asHex)}
										onPaintBegin={(_, value) =>
											pitchDrag.begin(value, (v) => setValue('pitch', index, v))}
										onPaintOver={(_, value) =>
											pitchDrag.dragOverWithValue(value, (v) =>
												setValue('pitch', index, v))} />
								{/each}
							{/if}
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						{#if showOffsetGrid}
							<td colspan="4"></td>
							<td colspan="25" class="px-2 py-1">
								<RowEditorAddRowButton onAdd={() => editorSync.addRow(() => 0)} />
							</td>
						{:else}
							<td colspan="4" class="px-2 py-1">
								<RowEditorAddRowButton onAdd={() => editorSync.addRow(() => 0)} />
							</td>
						{/if}
					</tr>
					<tr>
						<td
							colspan={tableColSpan}
							class="border-t border-[var(--color-app-border)] p-0">
							<RowResizeHandle
								rowCount={editorSync.rows.length}
								onRowCountChange={(count) =>
									editorSync.setRowCount(count, () => 0, ROW_EDITOR_MAX_ROWS)}
								rowHeightPx={32}
								maxRows={ROW_EDITOR_MAX_ROWS} />
						</td>
					</tr>
				</tfoot>
			</table>
		</div>

		{#if showOctaveGrid}
			<table
				class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
				<thead>
					<tr>
						<th class="px-2 py-1.5">row</th>
						<th colspan="15" class="px-2">octave shift</th>
					</tr>
					<tr>
						<th></th>
						{#each SHIFT_VALUES as s}
							<th
								class="w-6 min-w-6 bg-[var(--color-app-surface-secondary)] text-center"
								title={String(s)}></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each editorSync.rows as _, index}
						{@const selected = selection.isRowSelected(index)}
						<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
							<SelectableRowNumberCell
								{index}
								{selected}
								sizeClass="px-2 py-1.5"
								onmousedown={(e) => selection.handleRowSelect(index, e)} />
							{#each SHIFT_VALUES as s}
								<PaintableValueGridCell
									{index}
									value={s}
									currentValue={shifts[index]}
									{selected}
									formatValue={(v) => formatRowEditorNumber(v, asHex)}
									onPaintBegin={(_, value) =>
										shiftDrag.begin(value, (v) => setValue('shift', index, v))}
									onPaintOver={(_, value) =>
										shiftDrag.dragOverWithValue(value, (v) =>
											setValue('shift', index, v))} />
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
