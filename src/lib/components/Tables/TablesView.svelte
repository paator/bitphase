<script lang="ts">
	import type { Table } from '../../models/project';
	import { Table as TableModel } from '../../models/project';
	import { migrateTableIdInSongs } from '../../services/project/id-migration';
	import IconCarbonHexagonSolid from '~icons/carbon/hexagon-solid';
	import IconCarbonHexagonOutline from '~icons/carbon/hexagon-outline';
	import IconCarbonDataTable from '~icons/carbon/data-table';
	import IconCarbonAdd from '~icons/carbon/add';
	import IconCarbonMaximize from '~icons/carbon/maximize';
	import IconCarbonMinimize from '~icons/carbon/minimize';
	import IconCarbonSave from '~icons/carbon/save';
	import IconCarbonDocumentImport from '~icons/carbon/document-import';
	import TableEditor from './TableEditor.svelte';
	import Card from '../Card/Card.svelte';
	import { ToolbarButton } from '../ToolbarButton';
	import { ItemGridCell } from '../ItemGridCell';
	import { ListResizeDivider } from '../ListResizeDivider';
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

	let pendingTableUpdateBefore: Table[] | null = null;
	let pendingTableUpdateLabel = '';
	let pendingTableUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

	function scheduleTableUpdateHistory(before: Table[], label: string): void {
		pendingTableUpdateBefore ??= before;
		pendingTableUpdateLabel = label;
		if (pendingTableUpdateTimeout !== null) {
			clearTimeout(pendingTableUpdateTimeout);
		}
		pendingTableUpdateTimeout = setTimeout(flushTableUpdateHistory, 120);
	}

	function flushTableUpdateHistory(): void {
		if (pendingTableUpdateTimeout !== null) {
			clearTimeout(pendingTableUpdateTimeout);
			pendingTableUpdateTimeout = null;
		}
		if (!pendingTableUpdateBefore) return;
		projectStore.recordHistory(
			{
				type: 'table.update',
				label: pendingTableUpdateLabel,
				affectedDomains: ['tables']
			},
			[projectStore.createSetDiff(['tables'], pendingTableUpdateBefore, projectStore.tables)]
		);
		pendingTableUpdateBefore = null;
		pendingTableUpdateLabel = '';
	}

	function handleTableChange(table: Table): void {
		const beforeTables = projectStore.cloneForHistory(projectStore.tables);
		const updated = [...tables];
		updated[selectedTableIndex] = { ...table };
		projectStore.tables = updated;
		scheduleTableUpdateHistory(beforeTables, `Edit table ${tableIdToDisplayChar(table.id)}`);
		services.audioService.updateTables(projectStore.tables);
	}

	function updateTableId(index: number, displayChar: string): void {
		flushTableUpdateHistory();
		const newId = tableDisplayCharToId(displayChar);
		if (newId < 0) return;
		const existingIds = tables.map((t, i) => (i === index ? -1 : t.id));
		if (existingIds.includes(newId)) return;
		const beforeTables = projectStore.cloneForHistory(projectStore.tables);
		const beforeSongs = projectStore.cloneForHistory(projectStore.songs);
		const beforePatterns = projectStore.cloneForHistory(projectStore.patterns);
		const oldId = tables[index].id;
		migrateTableIdInSongs(songs, oldId, newId);
		const updated = [...tables];
		updated[index] = { ...updated[index], id: newId };
		projectStore.tables = updated;
		sortTablesAndSyncSelection(newId);
		projectStore.recordHistory(
			{
				type: 'table.changeId',
				label: `Rename table ${tableIdToDisplayChar(oldId)} to ${tableIdToDisplayChar(newId)}`,
				affectedDomains: ['tables', 'patterns']
			},
			[
				projectStore.createSetDiff(['tables'], beforeTables, projectStore.tables),
				projectStore.createSetDiff(['songs'], beforeSongs, projectStore.songs),
				projectStore.createSetDiff(['patterns'], beforePatterns, projectStore.patterns)
			]
		);
		services.audioService.updateTables(projectStore.tables);
		requestPatternRedraw?.();
	}

	async function addTable(): Promise<void> {
		flushTableUpdateHistory();
		const existingIds = tables.map((t) => t.id);
		const newId = getNextAvailableTableId(existingIds);
		if (newId < 0) return;
		const newTable = new TableModel(
			newId,
			[],
			0,
			`Table ${(newId + 1).toString(36).toUpperCase()}`
		);
		const beforeTables = projectStore.cloneForHistory(projectStore.tables);
		projectStore.tables = [...tables, newTable];
		sortTablesAndSyncSelection(newId);
		editorStateStore.setCurrentTable(newId);
		projectStore.recordHistory(
			{
				type: 'table.add',
				label: `Add table ${tableIdToDisplayChar(newId)}`,
				affectedDomains: ['tables']
			},
			[projectStore.createSetDiff(['tables'], beforeTables, projectStore.tables)]
		);
		services.audioService.updateTables(projectStore.tables);
		await tick();
		tableListScrollRef
			?.querySelector(`[data-table-index="${selectedTableIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
	}

	function removeTable(index: number): void {
		flushTableUpdateHistory();
		if (tables.length <= 1) return;
		const beforeTables = projectStore.cloneForHistory(projectStore.tables);
		const removed = tables[index];
		projectStore.tables = tables.filter((_, i) => i !== index);
		if (selectedTableIndex >= projectStore.tables.length) {
			selectedTableIndex = projectStore.tables.length - 1;
		}
		projectStore.recordHistory(
			{
				type: 'table.remove',
				label: `Remove table ${tableIdToDisplayChar(removed.id)}`,
				affectedDomains: ['tables']
			},
			[projectStore.createSetDiff(['tables'], beforeTables, projectStore.tables)]
		);
		services.audioService.updateTables(projectStore.tables);
	}

	async function copyTable(copiedIndex: number): Promise<void> {
		flushTableUpdateHistory();
		const table = tables[copiedIndex];
		if (!table) return;
		const existingIds = tables.map((t) => t.id);
		const newId = getNextAvailableTableId(existingIds);
		if (newId < 0) return;
		const copy = new TableModel(
			newId,
			[...table.rows],
			table.loop,
			table.name + ' (Copy)',
			table.additive
		);
		const beforeTables = projectStore.cloneForHistory(projectStore.tables);
		projectStore.tables = [...tables, copy];
		sortTablesAndSyncSelection(newId);
		editorStateStore.setCurrentTable(newId);
		projectStore.recordHistory(
			{
				type: 'table.copy',
				label: `Copy table ${tableIdToDisplayChar(table.id)}`,
				affectedDomains: ['tables']
			},
			[projectStore.createSetDiff(['tables'], beforeTables, projectStore.tables)]
		);
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
			additive: table.additive,
			rows: table.rows
		});
	}

	async function loadTable(): Promise<void> {
		flushTableUpdateHistory();
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
			const additive = o.additive === true;
			const name = o.name != null ? String(o.name) : '';
			const currentId = tables[selectedTableIndex]?.id ?? 0;
			const replacement = new TableModel(
				currentId,
				rows,
				loop,
				name || `Table ${tableIdToDisplayChar(currentId)}`,
				additive
			);
			const beforeTables = projectStore.cloneForHistory(projectStore.tables);
			const updated = [...tables];
			updated[selectedTableIndex] = replacement;
			projectStore.tables = updated;
			projectStore.recordHistory(
				{
					type: 'table.replace',
					label: `Replace table ${tableIdToDisplayChar(currentId)}`,
					affectedDomains: ['tables']
				},
				[projectStore.createSetDiff(['tables'], beforeTables, projectStore.tables)]
			);
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
									{@const isSelected = selectedTableIndex === index}
									<ItemGridCell
										dataIndexKind="table"
										dataValue={index}
										{isSelected}
										isUsed={isTableUsed(table)}
										isEditing={editingTableId === index}
										idLabel={tableIdToDisplayChar(table.id)}
										nameLabel={table.name}
										copyTitle="Copy table"
										removeTitle="Remove table"
										showCopy={true}
										showRemove={tables.length > 1}
										onSelect={() => (selectedTableIndex = index)}
										onDoubleClick={() => startEditingTableId(index)}
										onCopy={(e) => {
											e.stopPropagation();
											copyTable(index);
										}}
										onRemove={(e) => {
											e.stopPropagation();
											removeTable(index);
										}}>
										{#snippet edit()}
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
										{/snippet}
									</ItemGridCell>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
				<div
					class="flex shrink-0 items-center gap-2 border-t border-[var(--color-app-border)] px-2 py-1.5">
					<ToolbarButton
						icon={IconCarbonAdd}
						label="Add"
						onclick={addTable}
						disabled={tables.length > MAX_TABLE_ID}
						title={tables.length > MAX_TABLE_ID ? 'Maximum 35 tables' : 'Add new table'} />
					<ToolbarButton
						icon={IconCarbonSave}
						label="Save"
						onclick={saveTable}
						disabled={tables.length === 0}
						title="Save selected table to JSON file" />
					<ToolbarButton
						icon={IconCarbonDocumentImport}
						label="Load"
						onclick={loadTable}
						disabled={tables.length === 0}
						title="Load table from JSON file into selected slot" />
				</div>
			</div>

			<ListResizeDivider
				isResizing={tableListResize.isResizing}
				label="Drag to resize table list"
				onmousedown={tableListResize.beginResize} />

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
