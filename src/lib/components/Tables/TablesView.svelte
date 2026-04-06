<script lang="ts">
	import type { Table } from '../../models/project';
	import { Table as TableModel } from '../../models/project';
	import { migrateTableIdInSongs } from '../../services/project/id-migration';
	import IconCarbonHexagonSolid from '~icons/carbon/hexagon-solid';
	import IconCarbonHexagonOutline from '~icons/carbon/hexagon-outline';
	import IconCarbonDataTable from '~icons/carbon/data-table';
	import IconCarbonAdd from '~icons/carbon/add';
	import IconCarbonCopy from '~icons/carbon/copy';
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import IconCarbonMaximize from '~icons/carbon/maximize';
	import IconCarbonMinimize from '~icons/carbon/minimize';
	import IconCarbonSave from '~icons/carbon/save';
	import IconCarbonDocumentImport from '~icons/carbon/document-import';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import TableEditor from './TableEditor.svelte';
	import Card from '../Card/Card.svelte';
	import { downloadJson, pickFileAsText } from '../../utils/file-download';
	import EditableIdField from '../EditableIdField/EditableIdField.svelte';
	import { getContext, tick, untrack } from 'svelte';
	import type { AudioService } from '../../services/audio/audio-service';
	import {
		getNextAvailableTableId,
		MAX_TABLE_ID,
		tableIdToDisplayChar,
		tableDisplayCharToId,
		isValidTableDisplayChar
	} from '../../utils/table-id';
	import { projectStore } from '../../stores/project.svelte';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { computeGridRows } from '../../utils/compute-grid-rows';
	import { createPersistedResizableListHeight } from '../../utils/persisted-resizable-list-height.svelte';
	import {
		ITEM_ROW_HEIGHT,
		ITEM_BUTTON_BAR_HEIGHT,
		DEFAULT_ITEM_LIST_HEIGHT,
		MIN_ITEM_LIST_HEIGHT,
		MAX_ITEM_LIST_HEIGHT
	} from '../../config/item-grid';

	const services: { audioService: AudioService } = getContext('container');
	const requestPatternRedraw = getContext<() => void>('requestPatternRedraw');

	let {
		isExpanded = $bindable(false)
	}: {
		isExpanded: boolean;
	} = $props();

	let tables = $derived(projectStore.tables);
	const songs = $derived(projectStore.songs);

	const tableListResize = createPersistedResizableListHeight({
		storageKey: 'tableListHeight',
		min: MIN_ITEM_LIST_HEIGHT,
		max: MAX_ITEM_LIST_HEIGHT,
		defaultHeight: DEFAULT_ITEM_LIST_HEIGHT
	});

	const tableGridRows = $derived.by(() =>
		computeGridRows(
			tables?.length ?? 0,
			tableListResize.listHeight,
			ITEM_ROW_HEIGHT,
			ITEM_BUTTON_BAR_HEIGHT
		)
	);

	let asHex = $state(false);
	let selectedTableIndex = $state(0);
	let selectedTableRowIndices = $state<number[]>([]);
	let tableListScrollRef: HTMLDivElement | null = $state(null);

	function compareTableIds(a: Table, b: Table): number {
		return a.id - b.id;
	}

	function sortTablesAndSyncSelection(selectedId?: number): void {
		const sorted = [...tables].sort(compareTableIds);
		const needsSort = sorted.some((t, i) => t !== tables[i]);
		if (needsSort) {
			projectStore.tables = sorted;
		}
		if (selectedId !== undefined) {
			const newIndex = sorted.findIndex((t) => t.id === selectedId);
			if (newIndex >= 0) selectedTableIndex = newIndex;
		}
	}

	function isTableUsed(table: Table): boolean {
		if (table.rows.length === 0) return false;
		if (table.rows.length === 1 && table.rows[0] === 0 && table.loop === 0) return false;
		return true;
	}

	function handleTableChange(table: Table): void {
		const updated = [...tables];
		updated[selectedTableIndex] = { ...table };
		projectStore.tables = updated;
		services.audioService.updateTables(projectStore.tables);
	}

	function updateTableId(index: number, displayChar: string): void {
		const newId = tableDisplayCharToId(displayChar);
		if (newId < 0) return;
		const existingIds = tables.map((t, i) => (i === index ? -1 : t.id));
		if (existingIds.includes(newId)) return;
		const oldId = tables[index].id;
		migrateTableIdInSongs(songs, oldId, newId);
		const updated = [...tables];
		updated[index] = { ...updated[index], id: newId };
		projectStore.tables = updated;
		sortTablesAndSyncSelection(newId);
		services.audioService.updateTables(projectStore.tables);
		requestPatternRedraw?.();
	}

	async function addTable(): Promise<void> {
		const existingIds = tables.map((t) => t.id);
		const newId = getNextAvailableTableId(existingIds);
		if (newId < 0) return;
		const newTable = new TableModel(
			newId,
			[],
			0,
			`Table ${(newId + 1).toString(36).toUpperCase()}`
		);
		projectStore.tables = [...tables, newTable];
		sortTablesAndSyncSelection(newId);
		editorStateStore.setCurrentTable(newId);
		services.audioService.updateTables(projectStore.tables);
		await tick();
		tableListScrollRef
			?.querySelector(`[data-table-index="${selectedTableIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
	}

	function removeTable(index: number): void {
		if (tables.length <= 1) return;
		projectStore.tables = tables.filter((_, i) => i !== index);
		if (selectedTableIndex >= projectStore.tables.length) {
			selectedTableIndex = projectStore.tables.length - 1;
		}
		services.audioService.updateTables(projectStore.tables);
	}

	async function copyTable(copiedIndex: number): Promise<void> {
		const table = tables[copiedIndex];
		if (!table) return;
		const existingIds = tables.map((t) => t.id);
		const newId = getNextAvailableTableId(existingIds);
		if (newId < 0) return;
		const copy = new TableModel(newId, [...table.rows], table.loop, table.name + ' (Copy)');
		projectStore.tables = [...tables, copy];
		sortTablesAndSyncSelection(newId);
		editorStateStore.setCurrentTable(newId);
		services.audioService.updateTables(projectStore.tables);
		await tick();
		tableListScrollRef
			?.querySelector(`[data-table-index="${selectedTableIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
	}

	$effect(() => {
		if (editorStateStore.selectTableRequest !== null) return;
		if (tables.length > 0 && tables[selectedTableIndex]) {
			const tableId = tables[selectedTableIndex].id;
			untrack(() => {
				editorStateStore.setCurrentTable(tableId);
			});
		}
	});

	$effect(() => {
		const targetId = editorStateStore.currentTable;
		const idx = tables.findIndex((t) => t.id === targetId);
		if (idx >= 0 && idx !== selectedTableIndex) {
			selectedTableIndex = idx;
		}
		if (editorStateStore.selectTableRequest !== null) {
			editorStateStore.clearSelectTableRequest();
		}
	});

	$effect(() => {
		const index = selectedTableIndex;
		if (!tableListScrollRef || index < 0) return;
		tick().then(() => {
			const el = tableListScrollRef?.querySelector(
				`[data-table-index="${index}"]`
			) as HTMLElement | null;
			el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
		});
	});

	$effect(() => {
		if (selectedTableIndex >= tables.length) selectedTableIndex = 0;
	});

	$effect(() => {
		if (!tables?.length) return;
		sortTablesAndSyncSelection(tables[selectedTableIndex]?.id);
	});

	let editingTableId: number | null = $state(null);
	let editingTableIdValue = $state('');

	function startEditingTableId(index: number): void {
		editingTableId = index;
		editingTableIdValue = tableIdToDisplayChar(tables[index]?.id ?? 0);
	}

	function finishEditingTableId(): void {
		if (editingTableId !== null) {
			updateTableId(editingTableId, editingTableIdValue);
			editingTableId = null;
			editingTableIdValue = '';
		}
	}

	function cancelEditingTableId(): void {
		editingTableId = null;
		editingTableIdValue = '';
	}

	function getTableIdError(index: number, displayChar: string): string | null {
		if (!displayChar) return null;
		if (!isValidTableDisplayChar(displayChar)) {
			return 'Invalid (use 1-9 or A-Z)';
		}
		const newId = tableDisplayCharToId(displayChar);
		const existingIds = tables.map((t, i) => (i === index ? -1 : t.id));
		if (existingIds.includes(newId)) {
			return 'This ID is already used';
		}
		return null;
	}

	function saveTable(): void {
		if (tables.length === 0) return;
		const table = tables[selectedTableIndex];
		if (!table) return;
		downloadJson(`table-${tableIdToDisplayChar(table.id)}.json`, {
			name: table.name,
			loop: table.loop,
			rows: table.rows
		});
	}

	async function loadTable(): Promise<void> {
		if (tables.length === 0) return;
		try {
			const text = await pickFileAsText();
			const parsed: unknown = JSON.parse(text);
			const item = Array.isArray(parsed) ? parsed[0] : parsed;
			if (
				item == null ||
				typeof item !== 'object' ||
				!Array.isArray((item as Record<string, unknown>).rows)
			) {
				throw new Error('Invalid format: expected a table object');
			}
			const o = item as Record<string, unknown>;
			const rows = (o.rows as number[]).map((n) => (typeof n === 'number' ? n : 0));
			const loop = typeof o.loop === 'number' ? o.loop : 0;
			const name = o.name != null ? String(o.name) : '';
			const currentId = tables[selectedTableIndex]?.id ?? 0;
			const replacement = new TableModel(
				currentId,
				rows,
				loop,
				name || `Table ${tableIdToDisplayChar(currentId)}`
			);
			const updated = [...tables];
			updated[selectedTableIndex] = replacement;
			projectStore.tables = updated;
			services.audioService.updateTables(projectStore.tables);
		} catch (err) {
			if ((err as Error).message !== 'No file selected') {
				alert('Failed to load table: ' + (err as Error).message);
			}
		}
	}

	const hexIcon = $derived(asHex ? IconCarbonHexagonSolid : IconCarbonHexagonOutline);
	const expandIcon = $derived(isExpanded ? IconCarbonMinimize : IconCarbonMaximize);

	const cardActions = $derived([
		{
			label: 'Hex',
			icon: hexIcon,
			onClick: () => (asHex = !asHex),
			class: asHex ? 'text-[var(--color-app-primary)]' : ''
		},
		{
			label: isExpanded ? 'Collapse panel' : 'Expand panel',
			icon: expandIcon,
			onClick: () => (isExpanded = !isExpanded),
			class: ''
		}
	]);
</script>

<div class="flex h-full flex-col">
	<Card
		title="Tables (Arpeggios)"
		icon={IconCarbonDataTable}
		fullHeight={true}
		actions={cardActions}
		class="flex flex-col">
		{#snippet children()}
			<div
				class="flex shrink-0 flex-col border-b border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]"
				style="height: {tableListResize.listHeight}px">
				<div
					class="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden"
					bind:this={tableListScrollRef}>
					{#each tableGridRows as rowIndices}
						<div
							class="flex min-w-max shrink-0 items-stretch border-b border-[var(--color-app-border)]"
							style="height: {ITEM_ROW_HEIGHT}px">
							{#each rowIndices as index}
								{@const table = tables[index]}
								{#if table}
									{@const isUsed = isTableUsed(table)}
									{@const isSelected = selectedTableIndex === index}
									{@const isEditing = editingTableId === index}
									{#if isEditing}
										<div
											data-table-index={index}
											class="group relative flex min-w-[6rem] shrink-0 flex-col items-center justify-center border-r border-[var(--color-app-border)] p-3 {isSelected
												? 'bg-[var(--color-app-primary)]'
												: isUsed
													? 'bg-[var(--color-app-surface-secondary)]/40 hover:bg-[var(--color-app-surface-secondary)]/70'
													: 'bg-[var(--color-app-background)]/60 hover:bg-[var(--color-app-background)]/80'}">
											<EditableIdField
												bind:value={editingTableIdValue}
												error={editingTableIdValue
													? getTableIdError(index, editingTableIdValue)
													: null}
												onCommit={finishEditingTableId}
												onCancel={cancelEditingTableId}
												maxLength={1}
												inputFilter={(v) =>
													v
														.toUpperCase()
														.slice(0, 1)
														.replace(/[^1-9A-Z]/g, '')} />
										</div>
									{:else}
										<div
											data-table-index={index}
											class="group relative flex min-w-[6rem] shrink-0 flex-col items-center border-r border-[var(--color-app-border)]">
											<button
												class="flex h-full w-full shrink-0 cursor-pointer flex-col items-center justify-center p-3 {isSelected
													? 'bg-[var(--color-app-primary)]'
													: isUsed
														? 'bg-[var(--color-app-surface-secondary)]/40 hover:bg-[var(--color-app-surface-secondary)]/70'
														: 'bg-[var(--color-app-background)]/60 hover:bg-[var(--color-app-background)]/80'}"
												onclick={() => (selectedTableIndex = index)}
												ondblclick={() => startEditingTableId(index)}>
												<span
													class="font-mono text-xs font-semibold {isSelected
														? 'text-[var(--color-app-text-secondary)]'
														: isUsed
															? 'text-[var(--color-app-text-tertiary)] group-hover:text-[var(--color-app-text-primary)]'
															: 'text-[var(--color-app-text-muted)] group-hover:text-[var(--color-app-text-tertiary)]'}">
													{tableIdToDisplayChar(table.id)}
												</span>
												<span
													class="text-xs {isSelected
														? 'text-[var(--color-app-text-secondary)]'
														: isUsed
															? 'text-[var(--color-app-text-muted)] group-hover:text-[var(--color-app-text-tertiary)]'
															: 'text-[var(--color-app-text-muted)] group-hover:text-[var(--color-app-text-muted)]'}">
													{table.name}
												</span>
											</button>
											<div
												class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
												<button
													class="cursor-pointer rounded p-0.5 text-[var(--color-app-text-muted)] hover:text-[var(--color-app-text-primary)]"
													onclick={(e) => {
														e.stopPropagation();
														copyTable(index);
													}}
													title="Copy table">
													<IconCarbonCopy class="h-3 w-3" />
												</button>
												{#if tables.length > 1}
													<button
														class="cursor-pointer rounded p-0.5 text-[var(--color-app-text-muted)] hover:text-red-400"
														onclick={(e) => {
															e.stopPropagation();
															removeTable(index);
														}}
														title="Remove table">
														<IconCarbonTrashCan class="h-3 w-3" />
													</button>
												{/if}
											</div>
										</div>
									{/if}
								{/if}
							{/each}
						</div>
					{/each}
				</div>
				<div
					class="flex shrink-0 items-center gap-2 border-t border-[var(--color-app-border)] px-2 py-1.5">
					<button
						class="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-xs text-[var(--color-app-text-tertiary)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={addTable}
						disabled={tables.length > MAX_TABLE_ID}
						title={tables.length > MAX_TABLE_ID
							? 'Maximum 35 tables'
							: 'Add new table'}>
						<IconCarbonAdd class="h-3.5 w-3.5" />
						<span>Add</span>
					</button>
					<button
						class="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-xs text-[var(--color-app-text-tertiary)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={saveTable}
						disabled={tables.length === 0}
						title="Save selected table to JSON file">
						<IconCarbonSave class="h-3.5 w-3.5" />
						<span>Save</span>
					</button>
					<button
						class="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-xs text-[var(--color-app-text-tertiary)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={loadTable}
						disabled={tables.length === 0}
						title="Load table from JSON file into selected slot">
						<IconCarbonDocumentImport class="h-3.5 w-3.5" />
						<span>Load</span>
					</button>
				</div>
			</div>

			<div
				class="flex shrink-0 cursor-ns-resize items-center justify-center border-y border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] py-1 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)] {tableListResize.isResizing
					? 'bg-[var(--color-app-surface-hover)]'
					: ''}"
				role="button"
				tabindex="0"
				aria-label="Drag to resize table list"
				title="Drag to resize table list"
				onmousedown={tableListResize.beginResize}>
				<IconCarbonArrowsVertical class="h-3 w-3" />
			</div>

			<div class="min-h-0 flex-1 overflow-auto p-4">
				{#if tables[selectedTableIndex]}
					{#key tables[selectedTableIndex].id}
						<TableEditor
							table={tables[selectedTableIndex]}
							{asHex}
							{isExpanded}
							onTableChange={handleTableChange}
							bind:selectedRowIndices={selectedTableRowIndices} />
					{/key}
				{/if}
			</div>
		{/snippet}
	</Card>
</div>
