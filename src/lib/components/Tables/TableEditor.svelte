<script lang="ts">
	import type { Table } from '../../models/project';
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import IconCarbonDelete from '~icons/carbon/delete';
	import IconCarbonAdd from '~icons/carbon/add';
	import Input from '../Input/Input.svelte';
	import RowResizeHandle from '../RowResizeHandle/RowResizeHandle.svelte';
	import SelectableRowNumberCell from '../RowEditorTable/SelectableRowNumberCell.svelte';
	import {
		ROW_SELECTION_STYLES,
		computeSelectionFromClick,
		filterValidSelection,
		isRowSelected as checkRowSelected
	} from '../../utils/row-selection';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import {
		ACTION_INCREMENT_VALUE,
		ACTION_DECREMENT_VALUE,
		ACTION_TRANSPOSE_OCTAVE_UP,
		ACTION_TRANSPOSE_OCTAVE_DOWN
	} from '../../config/keybindings';
	import { isEditableElement } from '../../utils/shortcut-input-exclusion';
	import { settingsStore } from '../../stores/settings.svelte';

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

	let selectionAnchor = $state<number | null>(null);
	let editorContainerRef: HTMLDivElement | null = $state(null);

	const PITCH_VALUES = Array.from({ length: 23 }, (_, i) => i - 11);
	const SHIFT_VALUES = Array.from({ length: 15 }, (_, i) => i - 7);
	const MAX_ROWS = 512;

	function ensureNonEmptyRows(rowsArray: number[]): number[] {
		return rowsArray.length === 0 ? [0] : rowsArray;
	}

	let rows = $state(ensureNonEmptyRows([...table.rows]));
	let loopRow = $state(table.loop);
	let name = $state(table.name);
	let pitches = $state<number[]>([]);
	let shifts = $state<number[]>([]);

	let isDragging = $state(false);
	let dragMode: 'pitch' | 'shift' | null = null;
	let offsetInputRefs: (HTMLInputElement | null)[] = $state([]);
	let loopColumnRef: HTMLTableCellElement | null = $state(null);
	let tableRef: HTMLTableElement | null = $state(null);
	let lastTableId = $state(table.id);
	let lastSyncedName = $state(table.name);
	let lastSyncedRows = $state([...table.rows]);
	let lastSyncedLoop = $state(table.loop);

	const showOffsetGrid = $derived(isExpanded);
	const showOctaveGrid = $derived(isExpanded);

	function initRowRepresentations() {
		rows = ensureNonEmptyRows(rows);
		pitches = rows.map((offset) => offsetToPitch(offset));
		shifts = rows.map((offset, idx) => Math.trunc((offset - pitches[idx]) / 12));
	}

	function offsetToPitch(offset: number): number {
		let pitch = offset % 12;
		if (pitch > 11) pitch -= 12;
		if (pitch < -11) pitch += 12;
		return pitch;
	}

	function pitchShiftToOffset(pitch: number, shift: number) {
		return pitch + shift * 12;
	}

	function recalcRow(index: number) {
		rows[index] = pitchShiftToOffset(pitches[index], shifts[index]);
		rows = [...rows];
	}

	function updateTable(updates: Partial<Table>) {
		onTableChange({ ...table, ...updates });
	}

	function setValue(mode: 'pitch' | 'shift', index: number, value: number) {
		if (mode === 'pitch') {
			pitches[index] = value;
		} else {
			shifts[index] = value;
		}
		recalcRow(index);
		updateTable({ rows });
	}

	function adjustRowOffset(index: number, newOffset: number) {
		rows[index] = newOffset;
		pitches[index] = offsetToPitch(newOffset);
		shifts[index] = Math.trunc((newOffset - pitches[index]) / 12);
		rows = [...rows];
	}

	function incrementSelectedRows(delta: number) {
		if (selectedRowIndices.length === 0) return;
		for (const index of selectedRowIndices) {
			adjustRowOffset(index, rows[index] + delta);
		}
		updateTable({ rows });
	}

	function formatNum(value: number): string {
		if (asHex) {
			const sign = value < 0 ? '-' : '';
			return sign + Math.abs(value).toString(16).toUpperCase();
		}
		return value.toString();
	}

	const formatOffset = formatNum;

	function onOffsetInput(index: number, event: Event) {
		const inputEl = event.target as HTMLInputElement;
		let text = inputEl.value.trim();
		const allowedPattern = asHex ? /[^0-9a-fA-F-]/g : /[^0-9-]/g;
		text = text.replace(/\+/g, '').replace(allowedPattern, '');
		if (text !== inputEl.value) inputEl.value = text;
		let parsed: number | null = null;
		if (asHex) {
			let sign = 1;
			let temp = text;
			if (temp.startsWith('-')) {
				sign = -1;
				temp = temp.slice(1);
			}
			if (/^[0-9a-fA-F]+$/.test(temp) && temp !== '') {
				parsed = sign * parseInt(temp, 16);
			}
		} else {
			if (/^-?\d+$/.test(text)) {
				parsed = parseInt(text, 10);
			}
		}
		if (parsed !== null) {
			adjustRowOffset(index, parsed);
			updateTable({ rows });
		}
	}

	function focusInputInRow(row: HTMLTableRowElement | null) {
		if (!row) return;
		const input = row.querySelector('input[type="text"]') as HTMLInputElement | null;
		if (input) {
			input.focus();
			input.select();
		}
	}

	function handleOffsetKeyDown(index: number, event: KeyboardEvent) {
		const key = event.key;

		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = index + 1;
			if (nextIndex < rows.length) {
				const currentRow = (event.target as HTMLInputElement).closest('tr');
				focusInputInRow(currentRow?.nextElementSibling as HTMLTableRowElement | null);
			} else if (nextIndex === rows.length) {
				addRow();
				setTimeout(() => {
					const currentRow = (event.target as HTMLInputElement).closest('tr');
					focusInputInRow(currentRow?.nextElementSibling as HTMLTableRowElement | null);
				}, 0);
			}
			return;
		}

		if (key === 'ArrowUp') {
			event.preventDefault();
			const prevIndex = index - 1;
			if (prevIndex >= 0) {
				const currentRow = (event.target as HTMLInputElement).closest('tr');
				focusInputInRow(currentRow?.previousElementSibling as HTMLTableRowElement | null);
			}
			return;
		}

		if (key.length > 1) return;
		const pattern = asHex ? /^[0-9a-fA-F-]$/ : /^[0-9-]$/;
		if (!pattern.test(key)) event.preventDefault();
	}

	function updateArraysAfterRowChange(newRows: number[]) {
		rows = newRows;
		pitches = rows.map((offset) => offsetToPitch(offset));
		shifts = rows.map((offset, idx) => Math.trunc((offset - pitches[idx]) / 12));
		if (loopRow >= rows.length) loopRow = rows.length - 1;
		updateTable({ rows });
	}

	function addRow() {
		updateArraysAfterRowChange([...rows, 0]);
	}

	function setRowCount(targetCount: number) {
		const count = Math.max(1, Math.min(MAX_ROWS, targetCount));
		if (count === rows.length) return;
		if (count > rows.length) {
			const toAdd = count - rows.length;
			updateArraysAfterRowChange([...rows, ...Array.from({ length: toAdd }, () => 0)]);
		} else {
			updateArraysAfterRowChange(rows.slice(0, count));
		}
	}

	function removeRow(index: number) {
		if (rows.length === 1) return;
		updateArraysAfterRowChange(rows.filter((_, i) => i !== index));
	}

	function removeRowsFromBottom(index: number) {
		if (rows.length === 1) return;
		const rowsToKeep = index + 1;
		if (rowsToKeep >= rows.length) return;
		updateArraysAfterRowChange(rows.slice(0, rowsToKeep));
	}

	function setLoop(index: number) {
		loopRow = index;
		updateTable({ loop: loopRow });
	}

	function isRowSelected(index: number): boolean {
		return checkRowSelected(index, selectedRowIndices);
	}

	function handleRowSelect(index: number, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		const result = computeSelectionFromClick(index, event, selectedRowIndices, selectionAnchor);
		selectedRowIndices = result.indices;
		selectionAnchor = result.anchor;
		editorContainerRef?.focus();
	}

	export function addRowExternal() {
		addRow();
	}

	export function removeLastRowExternal() {
		removeRow(rows.length - 1);
	}

	function beginDrag(mode: 'pitch' | 'shift', index: number, value: number) {
		isDragging = true;
		dragMode = mode;
		setValue(mode, index, value);
	}

	function dragOver(mode: 'pitch' | 'shift', index: number, value: number) {
		if (isDragging && dragMode === mode) {
			setValue(mode, index, value);
		}
	}

	initRowRepresentations();

	function syncFromTable() {
		rows = ensureNonEmptyRows([...table.rows]);
		loopRow = table.loop;
		name = table.name;
		lastSyncedRows = [...table.rows];
		lastSyncedLoop = table.loop;
		lastSyncedName = table.name;
		initRowRepresentations();
	}

	$effect(() => {
		if (table.id !== lastTableId) {
			lastTableId = table.id;
			syncFromTable();
			selectedRowIndices = [];
			selectionAnchor = null;
		} else {
			const rowsChanged =
				table.rows.length !== lastSyncedRows.length ||
				table.rows.some((row, i) => row !== lastSyncedRows[i]);
			const loopChanged = table.loop !== lastSyncedLoop;
			const nameChanged = table.name !== lastSyncedName;

			if (rowsChanged || loopChanged) {
				rows = ensureNonEmptyRows([...table.rows]);
				loopRow = table.loop;
				lastSyncedRows = [...table.rows];
				lastSyncedLoop = table.loop;
				initRowRepresentations();
			}

			if (nameChanged) {
				name = table.name;
				lastSyncedName = table.name;
			}
		}
	});

	$effect(() => {
		if (name !== lastSyncedName) {
			updateTable({ name });
		}
	});

	$effect(() => {
		rows = ensureNonEmptyRows(rows);
		if (offsetInputRefs.length !== rows.length) {
			const newRefs = new Array(rows.length).fill(null);
			for (let i = 0; i < Math.min(offsetInputRefs.length, rows.length); i++) {
				newRefs[i] = offsetInputRefs[i];
			}
			offsetInputRefs = newRefs;
		}
	});

	$effect(() => {
		const stop = () => {
			isDragging = false;
			dragMode = null;
		};
		window.addEventListener('mouseup', stop);
		return () => window.removeEventListener('mouseup', stop);
	});

	$effect(() => {
		const validIndices = filterValidSelection(selectedRowIndices, rows.length);
		if (validIndices.length !== selectedRowIndices.length) {
			selectedRowIndices = validIndices;
		}
	});

	$effect(() => {
		const containerEl = editorContainerRef;
		if (!containerEl) return;

		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (selectedRowIndices.length > 0 && !containerEl!.contains(target)) {
				selectedRowIndices = [];
				selectionAnchor = null;
			}
		}

		function handleFocusOut(event: FocusEvent) {
			const relatedTarget = event.relatedTarget as Node | null;
			if (!relatedTarget) return;
			if (containerEl!.contains(relatedTarget)) return;
			if (selectedRowIndices.length > 0) {
				selectedRowIndices = [];
				selectionAnchor = null;
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

		function handleKeyDown(event: KeyboardEvent) {
			if (selectedRowIndices.length === 0) return;
			if (isEditableElement(event.target)) return;
			const shortcut = ShortcutString.fromEvent(event);
			const action = keybindingsStore.getActionForShortcut(shortcut);
			const delta =
				action === ACTION_TRANSPOSE_OCTAVE_UP || action === ACTION_TRANSPOSE_OCTAVE_DOWN
					? 10
					: 1;
			if (action === ACTION_INCREMENT_VALUE || action === ACTION_TRANSPOSE_OCTAVE_UP) {
				event.preventDefault();
				incrementSelectedRows(delta);
			} else if (
				action === ACTION_DECREMENT_VALUE ||
				action === ACTION_TRANSPOSE_OCTAVE_DOWN
			) {
				event.preventDefault();
				incrementSelectedRows(-delta);
			}
		}

		container.addEventListener('keydown', handleKeyDown);
		return () => container.removeEventListener('keydown', handleKeyDown);
	});
</script>

{#snippet valueCell(
	mode: 'pitch' | 'shift',
	index: number,
	value: number,
	isSelected: boolean,
	rowSelected: boolean
)}
	<td
		class={`group h-8 w-6 min-w-6 cursor-pointer border border-[var(--color-app-border)] text-center text-[0.7rem] leading-none ${
			isSelected
				? 'bg-[var(--color-app-surface-active)]'
				: rowSelected
					? ROW_SELECTION_STYLES.cell
					: 'bg-[var(--color-app-surface)] hover:bg-[var(--color-app-surface-secondary)]'
		}`}
		tabindex="0"
		title={String(value)}
		onmousedown={() => beginDrag(mode, index, value)}
		onmouseover={() => dragOver(mode, index, value)}
		onfocus={() => dragOver(mode, index, value)}>
		{#if isSelected}
			{formatNum(value)}
		{:else}
			<span class="text-[var(--color-app-text-tertiary)] opacity-0 group-hover:opacity-100"
				>{formatNum(value)}</span>
		{/if}
	</td>
{/snippet}

<div
	class="w-full overflow-x-auto outline-none focus:outline-none"
	bind:this={editorContainerRef}
	tabindex="-1">
	<div class="mt-2 mb-2 ml-2 flex items-center gap-2">
		<span class="text-xs text-[var(--color-app-text-muted)]">Name:</span>
		<Input class="w-48 text-xs" bind:value={name} />
	</div>

	<div class="flex items-start gap-2 overflow-x-auto">
		<div class="relative flex flex-col">
			{#if loopRow >= 0 && loopRow < rows.length && loopColumnRef && tableRef}
				{@const tbody = tableRef.querySelector('tbody')}
				{@const firstRow = tbody?.querySelector('tr') as HTMLTableRowElement | null}
				{@const rowTop = firstRow ? firstRow.offsetTop : 0}
				<div
					class="pointer-events-none absolute top-0 z-0"
					style="left: calc({loopColumnRef.offsetLeft}px + 1rem); margin-top: calc({rowTop}px + 2rem * {loopRow}); height: calc(2rem * {rows.length -
						loopRow});">
					<div class="relative h-full">
						<div
							class="absolute top-0 left-0 h-full w-0.5 border-l-2 border-[var(--color-app-primary)]">
						</div>
						<div
							class="absolute top-0 left-0 h-2 w-2 border-t-2 border-l-2 border-[var(--color-app-primary)]">
						</div>
						<div
							class="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-[var(--color-app-primary)]">
						</div>
					</div>
				</div>
			{/if}
			<table
				bind:this={tableRef}
				class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
				<thead>
					<tr>
						<th class="px-2 py-1.5">row</th>
						<th class="w-8 px-1.5"></th>
						<th class="w-6 px-1.5" bind:this={loopColumnRef}>loop</th>
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
					{#each rows as offset, index}
						{@const selected = isRowSelected(index)}
						<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
							<SelectableRowNumberCell
								{index}
								{selected}
								sizeClass="px-2 py-1.5"
								onmousedown={(e) => handleRowSelect(index, e)} />
							<td
								class="border border-[var(--color-app-border)] {selected
									? ROW_SELECTION_STYLES.cell
									: 'bg-[var(--color-app-surface-secondary)]'} px-1.5">
								<div class="flex items-center justify-center gap-1">
									<button
										class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-red-400"
										onclick={(e) => {
											e.stopPropagation();
											removeRow(index);
										}}
										title="Remove this row">
										<IconCarbonTrashCan class="h-3.5 w-3.5" />
									</button>
									{#if index < rows.length - 1}
										<button
											class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-red-500"
											onclick={(e) => {
												e.stopPropagation();
												removeRowsFromBottom(index);
											}}
											title="Remove all rows from bottom up to this one">
											<IconCarbonDelete class="h-3.5 w-3.5" />
										</button>
									{/if}
								</div>
							</td>
							<td
								class="w-6 cursor-pointer px-1.5 text-center text-sm {selected
									? ROW_SELECTION_STYLES.cell
									: ''}"
								onclick={() => setLoop(index)}>
							</td>
							<td class="w-14 px-1.5">
								<input
									type="text"
									bind:this={offsetInputRefs[index]}
									class="w-full min-w-0 overflow-x-auto rounded border border-[var(--color-app-border)] {selected
										? ROW_SELECTION_STYLES.input
										: 'bg-[var(--color-app-surface)]'} px-2 py-1 text-xs text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none"
									value={formatOffset(offset)}
									onkeydown={(e) => handleOffsetKeyDown(index, e)}
									onfocus={(e) => (e.target as HTMLInputElement).select()}
									oninput={(e) => onOffsetInput(index, e)} />
							</td>
							{#if showOffsetGrid}
								{#each PITCH_VALUES as p}
									{@render valueCell(
										'pitch',
										index,
										p,
										p === pitches[index],
										selected
									)}
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
								<div class="flex items-center justify-center">
									<button
										class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-green-400"
										onclick={addRow}
										title="Add new row">
										<IconCarbonAdd class="mr-1 h-3.5 w-3.5" />
										<span class="mr-1 text-xs">Add new row</span>
									</button>
								</div>
							</td>
						{:else}
							<td colspan="4" class="px-2 py-1">
								<div class="flex items-center justify-center">
									<button
										class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-green-400"
										onclick={addRow}
										title="Add new row">
										<IconCarbonAdd class="mr-1 h-3.5 w-3.5" />
										<span class="mr-1 text-xs">Add new row</span>
									</button>
								</div>
							</td>
						{/if}
					</tr>
					<tr>
						<td
							colspan={showOffsetGrid ? 29 : 4}
							class="border-t border-[var(--color-app-border)] p-0">
							<RowResizeHandle
								rowCount={rows.length}
								onRowCountChange={setRowCount}
								rowHeightPx={32}
								maxRows={MAX_ROWS} />
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
					{#each rows as _, index}
						{@const selected = isRowSelected(index)}
						<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
							<SelectableRowNumberCell
								{index}
								{selected}
								sizeClass="px-2 py-1.5"
								onmousedown={(e) => handleRowSelect(index, e)} />
							{#each SHIFT_VALUES as s}
								{@render valueCell(
									'shift',
									index,
									s,
									s === shifts[index],
									selected
								)}
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
