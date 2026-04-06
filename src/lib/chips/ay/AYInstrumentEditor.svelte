<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import IconCarbonDelete from '~icons/carbon/delete';
	import IconCarbonAdd from '~icons/carbon/add';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import RowResizeHandle from '../../components/RowResizeHandle/RowResizeHandle.svelte';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonActivity from '~icons/carbon/activity';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import Input from '../../components/Input/Input.svelte';
	import SelectableRowNumberCell from '../../components/RowEditorTable/SelectableRowNumberCell.svelte';
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

	let selectionAnchor = $state<number | null>(null);

	const VOLUME_VALUES = Array.from({ length: 16 }, (_, i) => i);
	const showVolumeGrid = $derived(isExpanded);

	const EMPTY_ROW = {
		tone: false,
		noise: false,
		envelope: false,
		retriggerEnvelope: false,
		toneAdd: 0,
		noiseAdd: 0,
		envelopeAdd: 0,
		volume: 0,
		loop: false,
		amplitudeSliding: false,
		amplitudeSlideUp: false,
		toneAccumulation: false,
		noiseAccumulation: false,
		envelopeAccumulation: false
	};

	const MAX_ROWS = 512;

	let isDragging = $state(false);
	let dragType:
		| 'volume'
		| 'tone'
		| 'noise'
		| 'envelope'
		| 'retriggerEnvelope'
		| 'toneAccumulation'
		| 'noiseAccumulation'
		| 'envelopeAccumulation'
		| null = $state(null);
	let dragValue: boolean | null = $state(null);

	function formatNum(value: number): string {
		if (asHex) {
			const sign = value < 0 ? '-' : '';
			return sign + Math.abs(value).toString(16).toUpperCase();
		}
		return String(value);
	}

	function beginDragVolume(index: number, value: number) {
		isDragging = true;
		dragType = 'volume';
		updateRow(index, 'volume', value);
	}

	function dragOverVolume(index: number, value: number) {
		if (isDragging && dragType === 'volume') {
			updateRow(index, 'volume', value);
		}
	}

	function beginDragBoolean(
		index: number,
		field:
			| 'tone'
			| 'noise'
			| 'envelope'
			| 'retriggerEnvelope'
			| 'toneAccumulation'
			| 'noiseAccumulation'
			| 'envelopeAccumulation'
	) {
		isDragging = true;
		dragType = field;
		const currentValue = rows[index][field];
		dragValue = !currentValue;
		updateRow(index, field, dragValue);
	}

	function dragOverBoolean(
		index: number,
		field:
			| 'tone'
			| 'noise'
			| 'envelope'
			| 'retriggerEnvelope'
			| 'toneAccumulation'
			| 'noiseAccumulation'
			| 'envelopeAccumulation'
	) {
		if (isDragging && dragValue !== null) {
			updateRow(index, field, dragValue);
		}
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

	function ensureNonEmptyRows(rowsArray: any[]): any[] {
		return rowsArray.length === 0
			? [
					{
						tone: true,
						noise: false,
						envelope: false,
						retriggerEnvelope: false,
						toneAdd: 0,
						noiseAdd: 0,
						envelopeAdd: 0,
						volume: 15,
						loop: false,
						amplitudeSliding: false,
						amplitudeSlideUp: false,
						toneAccumulation: false,
						noiseAccumulation: false,
						envelopeAccumulation: false
					}
				]
			: rowsArray;
	}

	let rows = $state(ensureNonEmptyRows([...instrument.rows]));
	let loopRow = $state(instrument.loop);
	let name = $state(instrument.name);
	let loopColumnRef: HTMLTableCellElement | null = $state(null);
	let tableRef: HTMLTableElement | null = $state(null);
	let editorContainerRef: HTMLDivElement | null = $state(null);
	let lastInstrumentId = $state(instrument.id);
	let lastSyncedName = $state(instrument.name);
	let lastSyncedRows = $state([...instrument.rows]);
	let lastSyncedLoop = $state(instrument.loop);

	function updateInstrument(updates: Partial<Instrument>) {
		onInstrumentChange({ ...instrument, ...updates });
	}

	function updateRow(index: number, field: string, value: any) {
		rows[index] = { ...rows[index], [field]: value };
		rows = [...rows];
		updateInstrument({ rows });
	}

	const NUMERIC_FIELDS = [
		{ key: 'toneAdd', min: -4096, max: 4095 },
		{ key: 'noiseAdd', min: -4096, max: 4095 },
		{ key: 'envelopeAdd', min: -4096, max: 4095 },
		{ key: 'volume', min: 0, max: 15 }
	] as const;

	function incrementSelectedRows(delta: number) {
		if (selectedRowIndices.length === 0) return;
		for (const index of selectedRowIndices) {
			let updated = { ...rows[index] };
			for (const { key, min, max } of NUMERIC_FIELDS) {
				const current = key === 'envelopeAdd' ? (updated.envelopeAdd ?? 0) : updated[key];
				const next = Math.max(min, Math.min(max, current + delta));
				updated = { ...updated, [key]: next };
			}
			rows[index] = updated;
		}
		rows = [...rows];
		updateInstrument({ rows });
	}

	function toggleBoolean(index: number, field: string) {
		const currentValue = rows[index][field];
		updateRow(index, field, !currentValue);
	}

	function cycleAmplitudeSlide(index: number) {
		const row = rows[index];
		if (!row.amplitudeSliding) {
			updateRow(index, 'amplitudeSliding', true);
			updateRow(index, 'amplitudeSlideUp', true);
		} else if (row.amplitudeSlideUp) {
			updateRow(index, 'amplitudeSlideUp', false);
		} else {
			updateRow(index, 'amplitudeSliding', false);
			updateRow(index, 'amplitudeSlideUp', false);
		}
	}

	function updateNumericField(index: number, field: string, event: Event) {
		const inputEl = event.target as HTMLInputElement;
		let text = inputEl.value.trim();
		const allowedPattern = asHex ? /[^0-9a-fA-F-]/g : /[^0-9-]/g;
		text = text.replace(/\+/g, '').replace(allowedPattern, '');

		if (field === 'volume') {
			if (asHex) {
				if (text.length > 1) {
					text = text.substring(0, 1);
				}
			} else {
				const num = parseInt(text, 10);
				if (!isNaN(num) && num > 15) {
					text = '15';
				}
			}
		}

		if (text !== inputEl.value) inputEl.value = text;

		let parsed: number | null = null;
		if (asHex) {
			let sign = 1;
			let temp = text;
			if (temp.startsWith('-')) {
				sign = -1;
				temp = temp.substring(1);
			}
			if (/^[0-9a-fA-F]+$/.test(temp)) {
				parsed = sign * parseInt(temp, 16);
			}
		} else {
			if (/^-?\d+$/.test(text)) {
				parsed = parseInt(text, 10);
			}
		}

		if (parsed !== null) {
			if (field === 'volume') {
				parsed = Math.max(0, Math.min(15, parsed));
			}
			updateRow(index, field, parsed);
		}
	}

	function focusInputInRow(row: HTMLTableRowElement | null, currentInput?: HTMLInputElement) {
		if (!row) return;

		let input: HTMLInputElement | null = null;

		if (currentInput) {
			const currentCell = currentInput.closest('td');
			if (currentCell) {
				const cellIndex = Array.from(currentCell.parentElement?.children || []).indexOf(
					currentCell
				);
				const targetCell = row.children[cellIndex] as HTMLTableCellElement | undefined;
				if (targetCell) {
					input = targetCell.querySelector('input[type="text"]');
				}
			}
		}

		if (!input) {
			input = row.querySelector('input[type="text"]');
		}

		if (input) {
			input.focus();
			input.select();
		}
	}

	function handleNumericKeyDown(index: number, event: KeyboardEvent) {
		const key = event.key;
		const inputEl = event.target as HTMLInputElement;

		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = index + 1;
			if (nextIndex < rows.length) {
				const currentRow = inputEl.closest('tr');
				focusInputInRow(
					currentRow?.nextElementSibling as HTMLTableRowElement | null,
					inputEl
				);
			} else if (nextIndex === rows.length) {
				addRow();
				setTimeout(() => {
					const currentRow = inputEl.closest('tr');
					focusInputInRow(
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
				focusInputInRow(
					currentRow?.previousElementSibling as HTMLTableRowElement | null,
					inputEl
				);
			}
			return;
		}

		if (key.length > 1) return;
		const pattern = asHex ? /^[0-9a-fA-F-]$/ : /^[0-9-]$/;
		if (!pattern.test(key)) event.preventDefault();
	}

	function updateArraysAfterRowChange(newRows: any[]) {
		rows = newRows;
		if (loopRow >= rows.length) loopRow = rows.length - 1;
		updateInstrument({ rows });
	}

	function addRow() {
		updateArraysAfterRowChange([...rows, { ...EMPTY_ROW }]);
	}

	function setRowCount(targetCount: number) {
		const count = Math.max(1, Math.min(MAX_ROWS, targetCount));
		if (count === rows.length) return;
		if (count > rows.length) {
			const toAdd = count - rows.length;
			const newRows = [...rows, ...Array.from({ length: toAdd }, () => ({ ...EMPTY_ROW }))];
			updateArraysAfterRowChange(newRows);
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
		updateInstrument({ loop: loopRow });
	}

	export function addRowExternal() {
		addRow();
	}

	export function removeLastRowExternal() {
		removeRow(rows.length - 1);
	}

	function syncFromInstrument() {
		rows = ensureNonEmptyRows([...instrument.rows]);
		loopRow = instrument.loop;
		name = instrument.name;
		lastSyncedRows = [...instrument.rows];
		lastSyncedLoop = instrument.loop;
		lastSyncedName = instrument.name;
	}

	$effect(() => {
		if (instrument.id !== lastInstrumentId) {
			lastInstrumentId = instrument.id;
			syncFromInstrument();
			selectedRowIndices = [];
			selectionAnchor = null;
		} else {
			const rowsChanged =
				instrument.rows.length !== lastSyncedRows.length ||
				instrument.rows.some((row, i) => row !== lastSyncedRows[i]);
			const loopChanged = instrument.loop !== lastSyncedLoop;
			const nameChanged = instrument.name !== lastSyncedName;

			if (rowsChanged || loopChanged) {
				rows = ensureNonEmptyRows([...instrument.rows]);
				loopRow = instrument.loop;
				lastSyncedRows = [...instrument.rows];
				lastSyncedLoop = instrument.loop;
			}

			if (nameChanged) {
				name = instrument.name;
				lastSyncedName = instrument.name;
			}
		}
	});

	$effect(() => {
		if (name !== lastSyncedName) {
			updateInstrument({ name });
		}
	});

	$effect(() => {
		rows = ensureNonEmptyRows(rows);
	});

	$effect(() => {
		const validIndices = filterValidSelection(selectedRowIndices, rows.length);
		if (validIndices.length !== selectedRowIndices.length) {
			selectedRowIndices = validIndices;
		}
	});

	$effect(() => {
		const stop = () => {
			isDragging = false;
			dragType = null;
			dragValue = null;
		};
		window.addEventListener('mouseup', stop);
		return () => window.removeEventListener('mouseup', stop);
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

{#snippet volumeCell(index: number, value: number, isSelected: boolean, rowSelected: boolean)}
	<td
		class={`group h-8 w-6 min-w-6 cursor-pointer border border-[var(--color-app-border)] text-center text-[0.7rem] leading-none ${
			isSelected
				? 'bg-[var(--color-app-surface-active)]'
				: rowSelected
					? ROW_SELECTION_STYLES.cell
					: 'bg-[var(--color-app-surface)] hover:bg-[var(--color-app-surface-secondary)]'
		}`}
		tabindex="-1"
		title={String(value)}
		onmousedown={() => beginDragVolume(index, value)}
		onmouseover={() => dragOverVolume(index, value)}
		onfocus={() => dragOverVolume(index, value)}>
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
	<div class="mt-2 ml-2 flex items-center gap-2">
		<span class="w-10 shrink-0 text-xs text-[var(--color-app-text-muted)]">Name:</span>
		<Input class="w-48 text-xs" bind:value={name} />
	</div>

	<div class="mt-3 flex items-start gap-2 overflow-x-auto">
		{#key isExpanded}
			<div class="relative flex flex-col">
				{#if loopRow >= 0 && loopRow < rows.length && loopColumnRef && tableRef}
					{@const tbody = tableRef.querySelector('tbody')}
					{@const firstRow = tbody?.querySelector('tr') as HTMLTableRowElement | null}
					{@const rowTop = firstRow ? firstRow.offsetTop : 0}
					{@const rowHeight = isExpanded ? '2rem' : '1.75rem'}
					{@const leftOffset = isExpanded ? '1rem' : '0.65rem'}
					<div
						class="pointer-events-none absolute top-0 z-0"
						style="left: calc({loopColumnRef.offsetLeft}px + {leftOffset}); margin-top: calc({rowTop}px + {rowHeight} * {loopRow}); height: calc({rowHeight} * {rows.length -
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
							<th class={isExpanded ? 'w-14 min-w-14 px-2 py-1.5' : 'px-1 py-1'}
								>row</th>
							<th class={isExpanded ? 'w-8 px-1.5' : 'w-6 px-0.5'}></th>
							<th
								class={isExpanded ? 'w-6 px-1.5' : 'w-4 px-0.5'}
								bind:this={loopColumnRef}>{isExpanded ? 'loop' : 'lp'}</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-8 min-w-8 px-0.5 text-[0.65rem]'}
								title="Tone Generator">
								<div class="flex items-center justify-center">
									<IconCarbonChartWinLoss
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-8 min-w-8 px-0.5 text-[0.65rem]'}
								title="Noise Generator">
								<div class="flex items-center justify-center">
									<IconCarbonWaveform
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-8 min-w-8 px-0.5 text-[0.65rem]'}
								title="Hardware Envelope">
								<div class="flex items-center justify-center">
									<IconCarbonActivity
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-8 min-w-8 px-0.5 text-[0.65rem]'}
								title="Retrigger envelope when this row is played (only when envelope is on)">
								<div class="flex items-center justify-center">
									<IconCarbonRepeat
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-16 min-w-16 px-1.5'
									: 'w-12 px-0.5 text-[0.65rem]'}
								title="Tone Offset">
								<div class="flex items-center justify-center gap-0.5">
									<IconCarbonChartWinLoss
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
									<span>+</span>
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-10 px-0.5 text-[0.65rem]'}
								title="Tone Accumulation">
								<div class="flex items-center justify-center gap-0.5">
									<IconCarbonChartWinLoss
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
									<span>↑</span>
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-16 min-w-16 px-1.5'
									: 'w-12 px-0.5 text-[0.65rem]'}
								title="Noise Offset">
								<div class="flex items-center justify-center gap-0.5">
									<IconCarbonWaveform
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
									<span>+</span>
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-10 px-0.5 text-[0.65rem]'}
								title="Noise Accumulation">
								<div class="flex items-center justify-center gap-0.5">
									<IconCarbonWaveform
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
									<span>↑</span>
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-16 min-w-16 px-1.5'
									: 'w-12 px-0.5 text-[0.65rem]'}
								title="Envelope Offset">
								<div class="flex items-center justify-center gap-0.5">
									<IconCarbonActivity
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
									<span>+</span>
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-10 px-0.5 text-[0.65rem]'}
								title="Envelope Accumulation">
								<div class="flex items-center justify-center gap-0.5">
									<IconCarbonActivity
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
									<span>↑</span>
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-12 min-w-12 px-1'
									: 'w-12 px-0.5 text-[0.65rem]'}
								title="Volume Level">
								<div class="flex items-center justify-center">
									<IconCarbonVolumeUp
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
								</div>
							</th>
							<th
								class={isExpanded
									? 'w-8 min-w-8 px-1'
									: 'w-8 min-w-8 px-0.5 text-[0.65rem]'}
								title="Amplitude Slide: ↑ up / ↓ down / blank off">
								<div class="flex items-center justify-center">
									<IconCarbonArrowsVertical
										class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
								</div>
							</th>
						</tr>
						{#if showVolumeGrid}
							<tr>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
								<th></th>
							</tr>
						{/if}
					</thead>
					<tbody>
						{#each rows as row, index}
							{@const selected = isRowSelected(index)}
							<tr
								class="{isExpanded ? 'h-8' : 'h-7'} {selected
									? ROW_SELECTION_STYLES.row
									: ''}">
								<SelectableRowNumberCell
									{index}
									{selected}
									sizeClass={isExpanded
										? 'w-14 min-w-14 px-2 py-1.5'
										: 'px-1 py-1 text-[0.65rem]'}
									onmousedown={(e) => handleRowSelect(index, e)} />
								<td
									class="border border-[var(--color-app-border)] {selected
										? ROW_SELECTION_STYLES.cell
										: 'bg-[var(--color-app-surface-secondary)]'} {isExpanded
										? 'px-1.5'
										: 'px-0.5'}">
									<div
										class="flex items-center justify-center {isExpanded
											? 'gap-1'
											: 'gap-0.5'}">
										<button
											class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-red-400"
											onclick={(e) => {
												e.stopPropagation();
												removeRow(index);
											}}
											title="Remove this row">
											<IconCarbonTrashCan
												class={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
										</button>
										{#if index < rows.length - 1}
											<button
												class="flex cursor-pointer items-center justify-center rounded p-0.5 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-red-500"
												onclick={(e) => {
													e.stopPropagation();
													removeRowsFromBottom(index);
												}}
												title="Remove all rows from bottom up to this one">
												<IconCarbonDelete
													class={isExpanded
														? 'h-3.5 w-3.5'
														: 'h-3 w-3'} />
											</button>
										{/if}
									</div>
								</td>
								<td
									class="{isExpanded
										? 'w-6 cursor-pointer px-1.5 text-center text-sm'
										: 'w-4 cursor-pointer px-0.5 text-center text-[0.65rem]'} {selected
										? ROW_SELECTION_STYLES.cell
										: ''}"
									onclick={() => setLoop(index)}>
								</td>
								<!-- Tone -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'w-8 min-w-8 px-0.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.tone
											? 'bg-green-900/30 text-green-400'
											: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									onmousedown={() => beginDragBoolean(index, 'tone')}
									onmouseover={() => dragOverBoolean(index, 'tone')}
									onfocus={() => dragOverBoolean(index, 'tone')}>
									{row.tone ? '✓' : ''}
								</td>
								<!-- Noise -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'w-8 min-w-8 px-0.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.noise
											? 'bg-green-900/30 text-green-400'
											: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									onmousedown={() => beginDragBoolean(index, 'noise')}
									onmouseover={() => dragOverBoolean(index, 'noise')}
									onfocus={() => dragOverBoolean(index, 'noise')}>
									{row.noise ? '✓' : ''}
								</td>
								<!-- Envelope -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'w-8 min-w-8 px-0.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.envelope
											? 'bg-green-900/30 text-green-400'
											: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									onmousedown={() => beginDragBoolean(index, 'envelope')}
									onmouseover={() => dragOverBoolean(index, 'envelope')}
									onfocus={() => dragOverBoolean(index, 'envelope')}>
									{row.envelope ? '✓' : ''}
								</td>
								<!-- Retrigger envelope -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'w-8 min-w-8 px-0.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: (row.retriggerEnvelope ?? false)
											? 'bg-green-900/30 text-green-400'
											: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									title="Retrigger envelope when this row is played"
									onmousedown={() => beginDragBoolean(index, 'retriggerEnvelope')}
									onmouseover={() => dragOverBoolean(index, 'retriggerEnvelope')}
									onfocus={() => dragOverBoolean(index, 'retriggerEnvelope')}>
									{(row.retriggerEnvelope ?? false) ? '✓' : ''}
								</td>
								<!-- ToneAdd -->
								<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
									<input
										type="text"
										class="w-full min-w-0 overflow-x-auto rounded border border-[var(--color-app-border)] {selected
											? ROW_SELECTION_STYLES.input
											: 'bg-[var(--color-app-surface)]'} {isExpanded
											? 'px-2 py-1 text-xs'
											: 'px-1 py-0.5 text-[0.65rem]'} text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none"
										value={formatNum(row.toneAdd)}
										onkeydown={(e) => handleNumericKeyDown(index, e)}
										onfocus={(e) => (e.target as HTMLInputElement).select()}
										oninput={(e) => updateNumericField(index, 'toneAdd', e)} />
								</td>
								<!-- Tone Accumulation -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'px-1.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.toneAccumulation
											? 'bg-[var(--color-app-primary)]/30'
											: 'bg-[var(--color-app-surface)]'} {row.toneAccumulation
										? 'text-[var(--color-app-primary)]'
										: 'text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									onmousedown={() => beginDragBoolean(index, 'toneAccumulation')}
									onmouseover={() => dragOverBoolean(index, 'toneAccumulation')}
									onfocus={() => dragOverBoolean(index, 'toneAccumulation')}>
									{row.toneAccumulation ? '↑' : ''}
								</td>
								<!-- NoiseAdd -->
								<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
									<input
										type="text"
										class="w-full min-w-0 overflow-x-auto rounded border border-[var(--color-app-border)] {selected
											? ROW_SELECTION_STYLES.input
											: 'bg-[var(--color-app-surface)]'} {isExpanded
											? 'px-2 py-1 text-xs'
											: 'px-1 py-0.5 text-[0.65rem]'} text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none"
										value={formatNum(row.noiseAdd)}
										onkeydown={(e) => handleNumericKeyDown(index, e)}
										onfocus={(e) => (e.target as HTMLInputElement).select()}
										oninput={(e) => updateNumericField(index, 'noiseAdd', e)} />
								</td>
								<!-- Noise Accumulation -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'px-1.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.noiseAccumulation
											? 'bg-[var(--color-app-primary)]/30'
											: 'bg-[var(--color-app-surface)]'} {row.noiseAccumulation
										? 'text-[var(--color-app-primary)]'
										: 'text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									onmousedown={() => beginDragBoolean(index, 'noiseAccumulation')}
									onmouseover={() => dragOverBoolean(index, 'noiseAccumulation')}
									onfocus={() => dragOverBoolean(index, 'noiseAccumulation')}>
									{row.noiseAccumulation ? '↑' : ''}
								</td>
								<!-- EnvelopeAdd -->
								<td class={isExpanded ? 'w-16 min-w-16 px-1.5' : 'w-12 px-0.5'}>
									<input
										type="text"
										class="w-full min-w-0 overflow-x-auto rounded border border-[var(--color-app-border)] {selected
											? ROW_SELECTION_STYLES.input
											: 'bg-[var(--color-app-surface)]'} {isExpanded
											? 'px-2 py-1 text-xs'
											: 'px-1 py-0.5 text-[0.65rem]'} text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none"
										value={formatNum(row.envelopeAdd ?? 0)}
										onkeydown={(e) => handleNumericKeyDown(index, e)}
										onfocus={(e) => (e.target as HTMLInputElement).select()}
										oninput={(e) =>
											updateNumericField(index, 'envelopeAdd', e)} />
								</td>
								<!-- Envelope Accumulation -->
								<td
									class="{isExpanded
										? 'w-8 min-w-8 px-1'
										: 'px-1.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.envelopeAccumulation
											? 'bg-[var(--color-app-primary)]/30'
											: 'bg-[var(--color-app-surface)]'} {row.envelopeAccumulation
										? 'text-[var(--color-app-primary)]'
										: 'text-[var(--color-app-text-muted)]'}"
									tabindex="-1"
									onmousedown={() =>
										beginDragBoolean(index, 'envelopeAccumulation')}
									onmouseover={() =>
										dragOverBoolean(index, 'envelopeAccumulation')}
									onfocus={() => dragOverBoolean(index, 'envelopeAccumulation')}>
									{row.envelopeAccumulation ? '↑' : ''}
								</td>
								<!-- Volume -->
								<td class={isExpanded ? 'w-12 min-w-12 px-1.5' : 'w-12 px-0.5'}>
									<input
										type="text"
										class="w-full min-w-0 overflow-x-auto rounded border border-[var(--color-app-border)] {selected
											? ROW_SELECTION_STYLES.input
											: 'bg-[var(--color-app-surface)]'} {isExpanded
											? 'px-2 py-1 text-xs'
											: 'px-1 py-0.5 text-[0.65rem]'} text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none"
										value={formatNum(row.volume)}
										onkeydown={(e) => handleNumericKeyDown(index, e)}
										onfocus={(e) => (e.target as HTMLInputElement).select()}
										oninput={(e) => updateNumericField(index, 'volume', e)} />
								</td>
								<!-- Amplitude Slide (merged: off/up/down) -->
								<td
									class="w-8 min-w-8 {isExpanded
										? 'px-1'
										: 'px-0.5'} cursor-pointer border border-[var(--color-app-border)] text-center {selected
										? ROW_SELECTION_STYLES.cell
										: row.amplitudeSliding && row.amplitudeSlideUp
											? 'bg-green-900/30 text-green-400'
											: row.amplitudeSliding
												? 'bg-red-900/30 text-red-400'
												: 'bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]'}"
									onclick={() => cycleAmplitudeSlide(index)}
									title={row.amplitudeSliding
										? row.amplitudeSlideUp
											? 'Slide up'
											: 'Slide down'
										: 'No slide'}>
									<span class="inline-block min-w-[1ch]"
										>{row.amplitudeSliding
											? row.amplitudeSlideUp
												? '↑'
												: '↓'
											: ''}</span>
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="16" class="px-2 py-1">
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
						</tr>
						<tr>
							<td colspan="16" class="border-t border-[var(--color-app-border)] p-0">
								<RowResizeHandle
									rowCount={rows.length}
									onRowCountChange={setRowCount}
									rowHeightPx={isExpanded ? 32 : 28}
									maxRows={MAX_ROWS} />
							</td>
						</tr>
					</tfoot>
				</table>
			</div>

			{#if showVolumeGrid}
				<table
					class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none">
					<thead>
						<tr>
							<th class="px-2 py-1.5">row</th>
							{#each VOLUME_VALUES as v}
								<th
									class="w-6 min-w-6 bg-[var(--color-app-surface-secondary)] text-center"
									title={String(v)}>
									{formatNum(v)}
								</th>
							{/each}
						</tr>
						<tr>
							<th></th>
							{#each VOLUME_VALUES as v}
								<th class="w-6 min-w-6"></th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows as row, index}
							{@const selected = isRowSelected(index)}
							<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
								<td
									class="border border-[var(--color-app-border)] px-2 text-right {selected
										? ROW_SELECTION_STYLES.rowNumber
										: 'bg-[var(--color-app-surface-secondary)]'}">{index}</td>
								{#each VOLUME_VALUES as v}
									{@render volumeCell(index, v, v === row.volume, selected)}
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/key}
	</div>
</div>
