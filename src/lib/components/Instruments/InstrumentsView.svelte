<script lang="ts">
	import type { Instrument } from '../../models/song';
	import { Instrument as InstrumentModel } from '../../models/song';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonHexagonSolid from '~icons/carbon/hexagon-solid';
	import IconCarbonHexagonOutline from '~icons/carbon/hexagon-outline';
	import IconCarbonAdd from '~icons/carbon/add';
	import IconCarbonMaximize from '~icons/carbon/maximize';
	import IconCarbonMinimize from '~icons/carbon/minimize';
	import IconCarbonSave from '~icons/carbon/save';
	import IconCarbonDocumentImport from '~icons/carbon/document-import';
	import IconCarbonFolder from '~icons/carbon/folder';
	import Card from '../Card/Card.svelte';
	import { ToolbarButton } from '../ToolbarButton';
	import { ItemGridCell } from '../ItemGridCell';
	import { ListResizeDivider } from '../ListResizeDivider';
	import PresetsModal from '../Modal/PresetsModal.svelte';
	import { open } from '../../services/modal/modal-service';
	import { downloadJson, pickFileAsText } from '../../utils/file-download';
	import EditableIdField from '../EditableIdField/EditableIdField.svelte';
	import { getContext, tick, untrack } from 'svelte';
	import type { AudioService } from '../../services/audio/audio-service';
	import type { ChipProcessor } from '../../chips/base/processor';
	import { getChipByType } from '../../chips/registry';
	import { instrumentHasSample } from '../../chips/ay/sample-region';
	import PillTabs, { type PillTab } from '../PillTabs/PillTabs.svelte';
	import {
		isValidInstrumentId,
		normalizeInstrumentId,
		getNextAvailableInstrumentId,
		isInstrumentIdInRange,
		MAX_INSTRUMENT_ID_NUM
	} from '../../utils/instrument-id';
	import { migrateInstrumentIdInSong } from '../../services/project/id-migration';
	import {
		filterInstrumentsForChip,
		getOrderedProjectChipTypes,
		resolveInstrumentChipType
	} from '../../services/instrument/instrument-filter';
	import {
		applyInstrumentPreset,
		parseInstrumentPreset,
		serializeInstrumentPreset,
		type InstrumentPresetPayload
	} from '../../services/instrument/instrument-preset';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import { settingsStore } from '../../stores/settings.svelte';
	import InstrumentListModeToggle from './InstrumentListModeToggle.svelte';
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
		isExpanded = $bindable(false),
		chipProcessors,
		syncChipType,
		activeEditorIndex = 0
	}: {
		isExpanded: boolean;
		chipProcessors: ChipProcessor[];
		syncChipType?: string;
		activeEditorIndex?: number;
	} = $props();

	let allInstruments = $derived(projectStore.instruments);
	const chipTypeTabs = $derived.by((): PillTab[] => {
		return getOrderedProjectChipTypes(chipProcessors).flatMap((chipType) => {
			const chip = getChipByType(chipType);
			return chip ? [{ id: chipType, label: chip.name }] : [];
		});
	});
	let selectedChipType = $state('');
	let lastSyncedEditorIndex = $state(-1);
	const chip = $derived.by(() => {
		const chipType = selectedChipType || chipTypeTabs[0]?.id || syncChipType || 'ay';
		return getChipByType(chipType);
	});
	const chipInstruments = $derived(
		chip ? filterInstrumentsForChip(allInstruments, chip.type) : []
	);
	const songs = $derived(projectStore.songs);
	const hasSongs = $derived(songs.length > 0);

	const instrumentListResize = createPersistedResizableListHeight({
		storageKey: 'instrumentListHeight',
		min: MIN_ITEM_LIST_HEIGHT,
		max: MAX_ITEM_LIST_HEIGHT,
		defaultHeight: DEFAULT_ITEM_LIST_HEIGHT
	});

	const compactInstrumentList = $derived(settingsStore.compactInstrumentList);
	const instrumentGridRows = $derived.by(() =>
		compactInstrumentList
			? []
			: computeGridRows(
					chipInstruments?.length ?? 0,
					instrumentListResize.listHeight,
					ITEM_ROW_HEIGHT,
					ITEM_BUTTON_BAR_HEIGHT
				)
	);

	let asHex = $state(false);
	let selectedInstrumentIndex = $state(0);
	let instrumentListScrollRef: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (chipTypeTabs.length === 0) return;
		if (!selectedChipType || !chipTypeTabs.some((tab) => tab.id === selectedChipType)) {
			selectedChipType = syncChipType ?? chipTypeTabs[0].id;
		}
	});

	$effect(() => {
		const editorIndex = activeEditorIndex;
		if (editorIndex === lastSyncedEditorIndex) return;
		lastSyncedEditorIndex = editorIndex;
		if (syncChipType) {
			selectedChipType = syncChipType;
		}
	});

	$effect(() => {
		const request = editorStateStore.selectInstrumentRequest;
		if (!request) return;
		if (request.chipType) {
			selectedChipType = request.chipType;
			return;
		}
		const instrument = allInstruments.find((inst) => inst.id === request.instrumentId);
		if (instrument) {
			selectedChipType = resolveInstrumentChipType(instrument);
		}
	});

	$effect(() => {
		chip?.type;
		if (editorStateStore.selectInstrumentRequest) return;
		if (chipInstruments.length > 0 && chipInstruments[selectedInstrumentIndex]) {
			const instrumentId = chipInstruments[selectedInstrumentIndex].id;
			untrack(() => {
				editorStateStore.setCurrentInstrumentForChip(
					chipInstruments[selectedInstrumentIndex].chipType,
					instrumentId
				);
			});
		}
	});

	$effect(() => {
		const targetId = chip ? editorStateStore.getCurrentInstrument(chip.type) : null;
		const idx = chipInstruments.findIndex((inst) => inst.id === targetId);
		if (idx >= 0 && idx !== selectedInstrumentIndex) {
			selectedInstrumentIndex = idx;
		} else if (idx < 0 && chipInstruments.length > 0) {
			selectedInstrumentIndex = 0;
			untrack(() => {
				editorStateStore.setCurrentInstrumentForChip(
					chipInstruments[0].chipType,
					chipInstruments[0].id
				);
			});
		}
		if (editorStateStore.selectInstrumentRequest) {
			editorStateStore.clearSelectInstrumentRequest();
		}
	});

	$effect(() => {
		const index = selectedInstrumentIndex;
		if (!instrumentListScrollRef || index < 0) return;
		tick().then(() => {
			const el = instrumentListScrollRef?.querySelector(
				`[data-instrument-index="${index}"]`
			) as HTMLElement | null;
			el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
		});
	});

	const InstrumentEditor = $derived(chip?.instrumentEditor);

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

	function compareInstrumentIds(a: Instrument, b: Instrument): number {
		return parseInt(a.id, 36) - parseInt(b.id, 36);
	}

	function sortInstrumentsAndSyncSelection(selectedId?: string): void {
		const sorted = [...allInstruments].sort(compareInstrumentIds);
		const needsSort = sorted.some((inst, i) => inst !== allInstruments[i]);
		if (needsSort) {
			projectStore.instruments = sorted;
		}
		if (selectedId !== undefined && chip) {
			const filtered = filterInstrumentsForChip(projectStore.instruments, chip.type);
			const newIndex = filtered.findIndex((inst) => inst.id === selectedId);
			if (newIndex >= 0) selectedInstrumentIndex = newIndex;
		}
	}

	function isInstrumentUsed(instrument: Instrument): boolean {
		if (instrumentHasSample(instrument as { sampleData?: number[] })) return true;
		const extra = instrument as Instrument & { timerMacros?: typeof instrument.macros };
		if (extra.timerMacros && Object.values(extra.timerMacros).some((macro) => macro.values.length > 0)) {
			return true;
		}
		if (instrument.macros) {
			return Object.values(instrument.macros).some((macro) => macro.values.length > 0);
		}
		return false;
	}

	let pendingInstrumentUpdateBefore: Instrument[] | null = null;
	let pendingInstrumentUpdateLabel = '';
	let pendingInstrumentUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

	function scheduleInstrumentUpdateHistory(before: Instrument[], label: string): void {
		pendingInstrumentUpdateBefore ??= before;
		pendingInstrumentUpdateLabel = label;
		if (pendingInstrumentUpdateTimeout !== null) {
			clearTimeout(pendingInstrumentUpdateTimeout);
		}
		pendingInstrumentUpdateTimeout = setTimeout(flushInstrumentUpdateHistory, 120);
	}

	function flushInstrumentUpdateHistory(): void {
		if (pendingInstrumentUpdateTimeout !== null) {
			clearTimeout(pendingInstrumentUpdateTimeout);
			pendingInstrumentUpdateTimeout = null;
		}
		if (!pendingInstrumentUpdateBefore) return;
		projectStore.recordHistory(
			{
				type: 'instrument.update',
				label: pendingInstrumentUpdateLabel,
				affectedDomains: ['instruments']
			},
			[
				projectStore.createSetDiff(
					['instruments'],
					pendingInstrumentUpdateBefore,
					projectStore.instruments
				)
			]
		);
		pendingInstrumentUpdateBefore = null;
		pendingInstrumentUpdateLabel = '';
	}

	function handleInstrumentChange(instrument: Instrument): void {
		if (!hasSongs) return;
		const id = instrument.id;
		const idx = allInstruments.findIndex((inst) => inst.id === id);
		if (idx >= 0) {
			const beforeInstruments = projectStore.cloneForHistory(projectStore.instruments);
			const updated = [...allInstruments];
			updated[idx] = { ...instrument };
			projectStore.instruments = updated;
			scheduleInstrumentUpdateHistory(beforeInstruments, `Edit instrument ${id}`);
		}
		services.audioService.updateInstruments(projectStore.instruments);
	}

	async function addInstrument(): Promise<void> {
		if (!hasSongs) return;
		flushInstrumentUpdateHistory();
		const existingIds = allInstruments.map((inst) => inst.id);
		const newId = getNextAvailableInstrumentId(existingIds);
		if (!newId) return;
		if (!chip) return;
		const newInstrument = new InstrumentModel(newId, `Instrument ${newId}`, chip.type);
		const beforeInstruments = projectStore.cloneForHistory(projectStore.instruments);
		projectStore.instruments = [...allInstruments, newInstrument];
		sortInstrumentsAndSyncSelection(newId);
		editorStateStore.setCurrentInstrumentForChip(chip.type, newId);
		projectStore.recordHistory(
			{
				type: 'instrument.add',
				label: `Add instrument ${newId}`,
				affectedDomains: ['instruments']
			},
			[
				projectStore.createSetDiff(
					['instruments'],
					beforeInstruments,
					projectStore.instruments
				)
			]
		);
		services.audioService.updateInstruments(projectStore.instruments);
		await tick();
		instrumentListScrollRef
			?.querySelector(`[data-instrument-index="${selectedInstrumentIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
	}

	function removeInstrument(index: number): void {
		if (!hasSongs) return;
		flushInstrumentUpdateHistory();
		const toRemove = chipInstruments[index];
		if (!toRemove || chipInstruments.length <= 1) return;
		const beforeInstruments = projectStore.cloneForHistory(projectStore.instruments);
		projectStore.instruments = allInstruments.filter((inst) => inst.id !== toRemove.id);
		if (selectedInstrumentIndex >= chipInstruments.length - 1) {
			selectedInstrumentIndex = Math.max(0, chipInstruments.length - 2);
		}
		projectStore.recordHistory(
			{
				type: 'instrument.remove',
				label: `Remove instrument ${toRemove.id}`,
				affectedDomains: ['instruments']
			},
			[
				projectStore.createSetDiff(
					['instruments'],
					beforeInstruments,
					projectStore.instruments
				)
			]
		);
		services.audioService.updateInstruments(projectStore.instruments);
	}

	async function copyInstrument(copiedIndex: number): Promise<void> {
		if (!hasSongs) return;
		flushInstrumentUpdateHistory();
		const instrument = chipInstruments[copiedIndex];
		if (!instrument || !chip) return;
		const existingIds = allInstruments.map((inst) => inst.id);
		const newId = getNextAvailableInstrumentId(existingIds);
		if (!newId) return;
		const copy = new InstrumentModel(newId, instrument.name + ' (Copy)', chip.type);
		if (instrument.macros) {
			copy.macros = Object.fromEntries(
				Object.entries(instrument.macros).map(([id, macro]) => [
					id,
					{ values: [...macro.values], loop: macro.loop }
				])
			);
		}
		const sourceExtended = instrument as Instrument & { timerMacros?: typeof instrument.macros };
		if (sourceExtended.timerMacros) {
			(copy as typeof sourceExtended).timerMacros = Object.fromEntries(
				Object.entries(sourceExtended.timerMacros).map(([id, macro]) => [
					id,
					{ values: [...macro.values], loop: macro.loop }
				])
			);
		}
		chip.copyInstrumentFields?.(instrument, copy);

		const beforeInstruments = projectStore.cloneForHistory(projectStore.instruments);
		projectStore.instruments = [...allInstruments, copy];
		sortInstrumentsAndSyncSelection(newId);
		editorStateStore.setCurrentInstrumentForChip(chip.type, newId);
		projectStore.recordHistory(
			{
				type: 'instrument.copy',
				label: `Copy instrument ${instrument.id}`,
				affectedDomains: ['instruments']
			},
			[
				projectStore.createSetDiff(
					['instruments'],
					beforeInstruments,
					projectStore.instruments
				)
			]
		);
		services.audioService.updateInstruments(projectStore.instruments);
		await tick();
		instrumentListScrollRef
			?.querySelector(`[data-instrument-index="${selectedInstrumentIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
	}

	function updateInstrumentId(index: number, newId: string): void {
		flushInstrumentUpdateHistory();
		const normalizedId = normalizeInstrumentId(newId);
		if (!isValidInstrumentId(normalizedId) || !isInstrumentIdInRange(normalizedId)) {
			return;
		}
		const oldId = chipInstruments[index].id;
		const existingIds = allInstruments.map((inst) => inst.id).filter((id) => id !== oldId);
		if (existingIds.includes(normalizedId)) {
			return;
		}
		const beforeInstruments = projectStore.cloneForHistory(projectStore.instruments);
		const beforeSongs = projectStore.cloneForHistory(projectStore.songs);
		const beforePatterns = projectStore.cloneForHistory(projectStore.patterns);
		for (const song of songs) {
			migrateInstrumentIdInSong(song, oldId, normalizedId);
		}
		const globalIndex = allInstruments.findIndex((inst) => inst.id === oldId);
		if (globalIndex < 0) return;
		const updated = [...allInstruments];
		updated[globalIndex] = { ...updated[globalIndex], id: normalizedId };
		projectStore.instruments = updated;
		sortInstrumentsAndSyncSelection(normalizedId);
		projectStore.recordHistory(
			{
				type: 'instrument.changeId',
				label: `Rename instrument ${oldId} to ${normalizedId}`,
				affectedDomains: ['instruments', 'patterns']
			},
			[
				projectStore.createSetDiff(
					['instruments'],
					beforeInstruments,
					projectStore.instruments
				),
				projectStore.createSetDiff(['songs'], beforeSongs, projectStore.songs),
				projectStore.createSetDiff(['patterns'], beforePatterns, projectStore.patterns)
			]
		);
		services.audioService.updateInstruments(projectStore.instruments);
		requestPatternRedraw?.();
	}

	let editingInstrumentId: number | null = $state(null);
	let editingInstrumentIdValue = $state('');

	function startEditingInstrumentId(index: number): void {
		editingInstrumentId = index;
		editingInstrumentIdValue = chipInstruments[index]?.id || '';
	}

	function finishEditingInstrumentId(): void {
		if (editingInstrumentId !== null) {
			updateInstrumentId(editingInstrumentId, editingInstrumentIdValue);
			editingInstrumentId = null;
			editingInstrumentIdValue = '';
		}
	}

	function cancelEditingInstrumentId(): void {
		editingInstrumentId = null;
		editingInstrumentIdValue = '';
	}

	function saveInstrument(): void {
		if (chipInstruments.length === 0) return;
		const inst = chipInstruments[selectedInstrumentIndex];
		if (!inst) return;
		downloadJson(`instrument-${inst.id}.json`, serializeInstrumentPreset(inst));
	}

	function replaceInstrumentFromPreset(
		id: string,
		payload: InstrumentPresetPayload,
		label: string
	): void {
		if (!chip) return;
		const updated = applyInstrumentPreset(allInstruments, payload, id, chip.type);
		if (updated) {
			const beforeInstruments = projectStore.cloneForHistory(projectStore.instruments);
			projectStore.instruments = updated;
			projectStore.recordHistory(
				{
					type: 'instrument.replace',
					label,
					affectedDomains: ['instruments']
				},
				[
					projectStore.createSetDiff(
						['instruments'],
						beforeInstruments,
						projectStore.instruments
					)
				]
			);
		}
		services.audioService.updateInstruments(projectStore.instruments);
		requestPatternRedraw?.();
	}

	async function loadInstrument(): Promise<void> {
		flushInstrumentUpdateHistory();
		if (!chip || chipInstruments.length === 0) return;
		try {
			const text = await pickFileAsText();
			const payload = parseInstrumentPreset(JSON.parse(text));
			if (!payload) {
				throw new Error('Invalid format: expected an instrument object');
			}
			const currentId = chipInstruments[selectedInstrumentIndex]?.id ?? '01';
			replaceInstrumentFromPreset(currentId, payload, `Replace instrument ${currentId}`);
		} catch (err) {
			if ((err as Error).message !== 'No file selected') {
				alert('Failed to load instrument: ' + (err as Error).message);
			}
		}
	}

	async function openPresets(): Promise<void> {
		flushInstrumentUpdateHistory();
		if (!chip || chipInstruments.length === 0) return;
		const payload = parseInstrumentPreset(
			await open(PresetsModal, { presetType: 'instrument' })
		);
		if (!payload) {
			return;
		}
		const currentId = chipInstruments[selectedInstrumentIndex]?.id ?? '01';
		replaceInstrumentFromPreset(currentId, payload, `Apply preset to instrument ${currentId}`);
	}

	function getInstrumentIdError(index: number, id: string): string | null {
		const normalizedId = normalizeInstrumentId(id);
		if (!isValidInstrumentId(normalizedId)) {
			return 'Invalid format (must be 2 characters: 0-9, A-Z)';
		}
		if (!isInstrumentIdInRange(normalizedId)) {
			return 'ID must be between 01 and ZZ';
		}
		const editingInstrument = chipInstruments[index];
		const existingIds = allInstruments
			.map((inst) => inst.id)
			.filter((instId) => instId !== editingInstrument?.id);
		if (existingIds.includes(normalizedId)) {
			return 'This ID is already used';
		}
		return null;
	}

	$effect(() => {
		const currentInstruments = chipInstruments;
		if (currentInstruments && selectedInstrumentIndex >= currentInstruments.length) {
			selectedInstrumentIndex = 0;
		}
	});

	$effect(() => {
		if (!chipInstruments || chipInstruments.length === 0) return;
		sortInstrumentsAndSyncSelection(chipInstruments[selectedInstrumentIndex]?.id);
	});
</script>

<div class="flex h-full flex-col">
	<Card
		title="Instruments"
		icon={IconCarbonWaveform}
		fullHeight={true}
		class="flex flex-col"
		actions={cardActions}>
		{#snippet children()}
			{#if chipTypeTabs.length > 1}
				<div
					class="shrink-0 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-3 py-2">
					<PillTabs bind:activeTabId={selectedChipType} tabs={chipTypeTabs} size="sm" />
				</div>
			{/if}
			<div
				class="flex shrink-0 flex-col border-b border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]"
				style="height: {instrumentListResize.listHeight}px">
				<div
					class="flex min-h-0 flex-1 flex-col {compactInstrumentList
						? 'overflow-x-hidden overflow-y-auto'
						: 'overflow-x-auto overflow-y-hidden'}"
					bind:this={instrumentListScrollRef}>
					{#snippet instrumentCell(index: number, layout: 'grid' | 'list')}
						{@const instrument = chipInstruments[index]}
						{#if instrument}
							{@const isSelected = selectedInstrumentIndex === index}
							<ItemGridCell
								dataIndexKind="instrument"
								dataValue={index}
								{isSelected}
								isUsed={isInstrumentUsed(instrument)}
								isEditing={editingInstrumentId === index}
								idLabel={instrument.id}
								nameLabel={instrument.name}
								copyTitle="Copy instrument"
								removeTitle="Remove instrument"
								showCopy={hasSongs}
								showRemove={hasSongs && chipInstruments.length > 1}
								{layout}
								onSelect={() => (selectedInstrumentIndex = index)}
								onDoubleClick={() => {
									if (hasSongs) startEditingInstrumentId(index);
								}}
								onCopy={(e) => {
									e.stopPropagation();
									copyInstrument(index);
								}}
								onRemove={(e) => {
									e.stopPropagation();
									removeInstrument(index);
								}}>
								{#snippet edit()}
									<EditableIdField
										bind:value={editingInstrumentIdValue}
										error={editingInstrumentIdValue
											? getInstrumentIdError(index, editingInstrumentIdValue)
											: null}
										onCommit={finishEditingInstrumentId}
										onCancel={cancelEditingInstrumentId}
										maxLength={2}
										inputFilter={(v) =>
											v
												.toUpperCase()
												.slice(0, 2)
												.replace(/[^0-9A-Z]/g, '')} />
								{/snippet}
							</ItemGridCell>
						{/if}
					{/snippet}
					{#if compactInstrumentList}
						{#each chipInstruments as instrument, index (instrument.id)}
							{@render instrumentCell(index, 'list')}
						{/each}
					{:else}
						{#each instrumentGridRows as rowIndices, rowIndex (rowIndex)}
							<div
								class="flex min-w-max shrink-0 items-stretch border-b border-[var(--color-app-border)]"
								style="height: {ITEM_ROW_HEIGHT}px">
								{#each rowIndices as index (index)}
									{@render instrumentCell(index, 'grid')}
								{/each}
							</div>
						{/each}
					{/if}
				</div>
				<div
					class="flex shrink-0 items-center gap-2 border-t border-[var(--color-app-border)] px-2 py-1.5">
					<ToolbarButton
						icon={IconCarbonAdd}
						label="Add"
						onclick={addInstrument}
						disabled={!hasSongs || allInstruments.length >= MAX_INSTRUMENT_ID_NUM}
						title={!hasSongs
							? 'Add a song before creating instruments'
							: allInstruments.length >= MAX_INSTRUMENT_ID_NUM
								? 'Maximum 1295 instruments (01–ZZ)'
								: 'Add new instrument'} />
					<ToolbarButton
						icon={IconCarbonSave}
						label="Save"
						onclick={saveInstrument}
						disabled={!hasSongs || chipInstruments.length === 0}
						title="Save selected instrument to JSON file" />
					<ToolbarButton
						icon={IconCarbonDocumentImport}
						label="Load"
						onclick={loadInstrument}
						disabled={!hasSongs || chipInstruments.length === 0}
						title="Load instrument from JSON file into selected slot" />
					<ToolbarButton
						icon={IconCarbonFolder}
						label="Presets"
						onclick={openPresets}
						disabled={!hasSongs || chipInstruments.length === 0}
						title="Load instrument from built-in presets" />
					<div class="ml-auto">
						<InstrumentListModeToggle />
					</div>
				</div>
			</div>

			<ListResizeDivider
				isResizing={instrumentListResize.isResizing}
				label="Drag to resize instrument list"
				onmousedown={instrumentListResize.beginResize} />

			<div
				id="instrument-detail-panel"
				class="relative min-h-0 flex-1 overflow-hidden"
				class:pointer-events-none={!hasSongs}
				class:opacity-50={!hasSongs}>
				<div class="h-full overflow-auto p-4">
					{#if chipInstruments[selectedInstrumentIndex] && InstrumentEditor}
						{#key chipInstruments[selectedInstrumentIndex].id}
							<InstrumentEditor
								instrument={chipInstruments[selectedInstrumentIndex]}
								{asHex}
								{isExpanded}
								onInstrumentChange={handleInstrumentChange} />
						{/key}
					{:else if chipInstruments[selectedInstrumentIndex] && chip}
						<p class="text-sm text-[var(--color-app-text-muted)]">
							Instrument editor for {chip.name} is not available yet.
						</p>
					{/if}
				</div>
			</div>
		{/snippet}
	</Card>
</div>
