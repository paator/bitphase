<script lang="ts">
	import type { Instrument } from '../../models/song';
	import { Instrument as InstrumentModel } from '../../models/song';
	import { InstrumentRow } from '../../models/song';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonHexagonSolid from '~icons/carbon/hexagon-solid';
	import IconCarbonHexagonOutline from '~icons/carbon/hexagon-outline';
	import IconCarbonAdd from '~icons/carbon/add';
	import IconCarbonCopy from '~icons/carbon/copy';
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import IconCarbonMaximize from '~icons/carbon/maximize';
	import IconCarbonMinimize from '~icons/carbon/minimize';
	import IconCarbonSave from '~icons/carbon/save';
	import IconCarbonDocumentImport from '~icons/carbon/document-import';
	import IconCarbonFolder from '~icons/carbon/folder';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import Card from '../Card/Card.svelte';
	import PresetsModal from '../Modal/PresetsModal.svelte';
	import { open } from '../../services/modal/modal-service';
	import { downloadJson, pickFileAsText } from '../../utils/file-download';
	import EditableIdField from '../EditableIdField/EditableIdField.svelte';
	import { getContext, tick, untrack } from 'svelte';
	import type { AudioService } from '../../services/audio/audio-service';
	import type { Chip } from '../../chips/types';
	import {
		isValidInstrumentId,
		normalizeInstrumentId,
		getNextAvailableInstrumentId,
		isInstrumentIdInRange,
		MAX_INSTRUMENT_ID_NUM
	} from '../../utils/instrument-id';
	import { migrateInstrumentIdInSong } from '../../services/project/id-migration';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { projectStore } from '../../stores/project.svelte';
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
		chip
	}: {
		isExpanded: boolean;
		chip: Chip;
	} = $props();

	let instruments = $derived(projectStore.instruments);
	const songs = $derived(projectStore.songs);

	const instrumentListResize = createPersistedResizableListHeight({
		storageKey: 'instrumentListHeight',
		min: MIN_ITEM_LIST_HEIGHT,
		max: MAX_ITEM_LIST_HEIGHT,
		defaultHeight: DEFAULT_ITEM_LIST_HEIGHT
	});

	const instrumentGridRows = $derived.by(() =>
		computeGridRows(
			instruments?.length ?? 0,
			instrumentListResize.listHeight,
			ITEM_ROW_HEIGHT,
			ITEM_BUTTON_BAR_HEIGHT
		)
	);

	let asHex = $state(false);
	let selectedInstrumentIndex = $state(0);
	let selectedInstrumentRowIndices = $state<number[]>([]);
	let instrumentListScrollRef: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (editorStateStore.selectInstrumentRequest) return;
		if (instruments.length > 0 && instruments[selectedInstrumentIndex]) {
			const instrumentId = instruments[selectedInstrumentIndex].id;
			untrack(() => {
				editorStateStore.setCurrentInstrument(instrumentId);
			});
		}
	});

	$effect(() => {
		const targetId = editorStateStore.currentInstrument;
		const idx = instruments.findIndex((inst) => inst.id === targetId);
		if (idx >= 0 && idx !== selectedInstrumentIndex) {
			selectedInstrumentIndex = idx;
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

	const InstrumentEditor = $derived(chip.instrumentEditor);

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
		const sorted = [...instruments].sort(compareInstrumentIds);
		const needsSort = sorted.some((inst, i) => inst !== instruments[i]);
		if (needsSort) {
			projectStore.instruments = sorted;
		}
		if (selectedId !== undefined) {
			const newIndex = sorted.findIndex((inst) => inst.id === selectedId);
			if (newIndex >= 0) selectedInstrumentIndex = newIndex;
		}
	}

	function isInstrumentUsed(instrument: Instrument): boolean {
		if (instrument.rows.length === 0) return false;
		if (instrument.rows.length === 1) {
			const row = instrument.rows[0];
			const isEmpty =
				!row.tone &&
				!row.noise &&
				!row.envelope &&
				row.toneAdd === 0 &&
				row.noiseAdd === 0 &&
				row.volume === 0;
			if (isEmpty && instrument.loop === 0) return false;
		}
		return true;
	}

	function handleInstrumentChange(instrument: Instrument): void {
		const id = instrument.id;
		const idx = instruments.findIndex((inst) => inst.id === id);
		if (idx >= 0) {
			const updated = [...instruments];
			updated[idx] = { ...instrument };
			projectStore.instruments = updated;
		}
		services.audioService.updateInstruments(projectStore.instruments);
	}

	async function addInstrument(): Promise<void> {
		const existingIds = instruments.map((inst) => inst.id);
		const newId = getNextAvailableInstrumentId(existingIds);
		if (!newId) return;
		const newInstrument = new InstrumentModel(newId, [], 0, `Instrument ${newId}`);
		projectStore.instruments = [...instruments, newInstrument];
		sortInstrumentsAndSyncSelection(newId);
		editorStateStore.setCurrentInstrument(newId);
		services.audioService.updateInstruments(projectStore.instruments);
		await tick();
		instrumentListScrollRef
			?.querySelector(`[data-instrument-index="${selectedInstrumentIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
	}

	function removeInstrument(index: number): void {
		const toRemove = instruments[index];
		if (!toRemove || instruments.length <= 1) return;
		projectStore.instruments = instruments.filter((inst) => inst.id !== toRemove.id);
		if (selectedInstrumentIndex >= projectStore.instruments.length) {
			selectedInstrumentIndex = Math.max(0, projectStore.instruments.length - 1);
		}
		services.audioService.updateInstruments(projectStore.instruments);
	}

	async function copyInstrument(copiedIndex: number): Promise<void> {
		const instrument = instruments[copiedIndex];
		if (!instrument) return;
		const existingIds = instruments.map((inst) => inst.id);
		const newId = getNextAvailableInstrumentId(existingIds);
		if (!newId) return;
		const copiedRows = instrument.rows.map((r) => new InstrumentRow({ ...r }));
		const copy = new InstrumentModel(
			newId,
			copiedRows,
			instrument.loop,
			instrument.name + ' (Copy)'
		);

		projectStore.instruments = [...instruments, copy];
		sortInstrumentsAndSyncSelection(newId);
		editorStateStore.setCurrentInstrument(newId);
		services.audioService.updateInstruments(projectStore.instruments);
		await tick();
		instrumentListScrollRef
			?.querySelector(`[data-instrument-index="${selectedInstrumentIndex}"]`)
			?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
	}

	function updateInstrumentId(index: number, newId: string): void {
		const normalizedId = normalizeInstrumentId(newId);
		if (!isValidInstrumentId(normalizedId) || !isInstrumentIdInRange(normalizedId)) {
			return;
		}
		const oldId = instruments[index].id;
		const existingIds = instruments.map((inst) => inst.id).filter((id) => id !== oldId);
		if (existingIds.includes(normalizedId)) {
			return;
		}
		for (const song of songs) {
			migrateInstrumentIdInSong(song, oldId, normalizedId);
		}
		const updated = [...instruments];
		updated[index] = { ...updated[index], id: normalizedId };
		projectStore.instruments = updated;
		sortInstrumentsAndSyncSelection(normalizedId);
		services.audioService.updateInstruments(instruments);
		requestPatternRedraw?.();
	}

	let editingInstrumentId: number | null = $state(null);
	let editingInstrumentIdValue = $state('');

	function startEditingInstrumentId(index: number): void {
		editingInstrumentId = index;
		editingInstrumentIdValue = instruments[index]?.id || '';
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
		if (instruments.length === 0) return;
		const inst = instruments[selectedInstrumentIndex];
		if (!inst) return;
		downloadJson(`instrument-${inst.id}.json`, {
			name: inst.name,
			loop: inst.loop,
			rows: inst.rows.map((r) => ({ ...r }))
		});
	}

	async function loadInstrument(): Promise<void> {
		if (instruments.length === 0) return;
		try {
			const text = await pickFileAsText();
			const parsed: unknown = JSON.parse(text);
			const item = Array.isArray(parsed) ? parsed[0] : parsed;
			if (
				item == null ||
				typeof item !== 'object' ||
				!Array.isArray((item as Record<string, unknown>).rows)
			) {
				throw new Error('Invalid format: expected an instrument object');
			}
			const o = item as Record<string, unknown>;
			const rows = (o.rows as Record<string, unknown>[]).map((r) => new InstrumentRow(r));
			const loop = typeof o.loop === 'number' ? o.loop : 0;
			const name = o.name != null ? String(o.name) : '';
			const currentId = instruments[selectedInstrumentIndex]?.id ?? '01';
			const replacement = new InstrumentModel(
				currentId,
				rows,
				loop,
				name || `Instrument ${currentId}`
			);
			const idx = instruments.findIndex((inst) => inst.id === currentId);
			if (idx >= 0) {
				const updated = [...instruments];
				updated[idx] = new InstrumentModel(
					currentId,
					replacement.rows.map((r) => new InstrumentRow({ ...r })),
					replacement.loop,
					replacement.name
				);
				projectStore.instruments = updated;
			}
			services.audioService.updateInstruments(projectStore.instruments);
			requestPatternRedraw?.();
		} catch (err) {
			if ((err as Error).message !== 'No file selected') {
				alert('Failed to load instrument: ' + (err as Error).message);
			}
		}
	}

	async function openPresets(): Promise<void> {
		if (instruments.length === 0) return;
		const item = await open(PresetsModal, { presetType: 'instrument' });
		if (
			item == null ||
			typeof item !== 'object' ||
			!Array.isArray((item as Record<string, unknown>).rows)
		) {
			return;
		}
		const o = item as Record<string, unknown>;
		const rows = (o.rows as Record<string, unknown>[]).map((r) => new InstrumentRow(r));
		const loop = typeof o.loop === 'number' ? o.loop : 0;
		const name = o.name != null ? String(o.name) : '';
		const currentId = instruments[selectedInstrumentIndex]?.id ?? '01';
		const replacement = new InstrumentModel(
			currentId,
			rows,
			loop,
			name || `Instrument ${currentId}`
		);
		const idx = instruments.findIndex((inst) => inst.id === currentId);
		if (idx >= 0) {
			const updated = [...instruments];
			updated[idx] = new InstrumentModel(
				currentId,
				replacement.rows.map((r) => new InstrumentRow({ ...r })),
				replacement.loop,
				replacement.name
			);
			projectStore.instruments = updated;
		}
		services.audioService.updateInstruments(projectStore.instruments);
		requestPatternRedraw?.();
	}

	function getInstrumentIdError(index: number, id: string): string | null {
		const normalizedId = normalizeInstrumentId(id);
		if (!isValidInstrumentId(normalizedId)) {
			return 'Invalid format (must be 2 characters: 0-9, A-Z)';
		}
		if (!isInstrumentIdInRange(normalizedId)) {
			return 'ID must be between 01 and ZZ';
		}
		const existingIds = instruments.map((inst, i) => (i === index ? '' : inst.id));
		if (existingIds.includes(normalizedId)) {
			return 'This ID is already used';
		}
		return null;
	}

	$effect(() => {
		const currentInstruments = instruments;
		if (currentInstruments && selectedInstrumentIndex >= currentInstruments.length) {
			selectedInstrumentIndex = 0;
		}
	});

	$effect(() => {
		if (!instruments || instruments.length === 0) return;
		sortInstrumentsAndSyncSelection(instruments[selectedInstrumentIndex]?.id);
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
			<div
				class="flex shrink-0 flex-col border-b border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]"
				style="height: {instrumentListResize.listHeight}px">
				<div
					class="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden"
					bind:this={instrumentListScrollRef}>
					{#each instrumentGridRows as rowIndices}
						<div
							class="flex min-w-max shrink-0 items-stretch border-b border-[var(--color-app-border)]"
							style="height: {ITEM_ROW_HEIGHT}px">
							{#each rowIndices as index}
								{@const instrument = instruments[index]}
								{#if instrument}
									{@const isUsed = isInstrumentUsed(instrument)}
									{@const isSelected = selectedInstrumentIndex === index}
									{@const isEditing = editingInstrumentId === index}
									{#if isEditing}
										<div
											data-instrument-index={index}
											class="group relative flex min-w-[6rem] shrink-0 flex-col items-center justify-center border-r border-[var(--color-app-border)] p-3 {isSelected
												? 'bg-[var(--color-app-primary)]'
												: isUsed
													? 'bg-[var(--color-app-surface-secondary)]/40 hover:bg-[var(--color-app-surface-secondary)]/70'
													: 'bg-[var(--color-app-background)]/60 hover:bg-[var(--color-app-background)]/80'}">
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
										</div>
									{:else}
										<div
											data-instrument-index={index}
											class="group relative flex min-w-[6rem] shrink-0 flex-col items-center border-r border-[var(--color-app-border)]">
											<button
												class="flex h-full w-full shrink-0 cursor-pointer flex-col items-center justify-center p-3 {isSelected
													? 'bg-[var(--color-app-primary)]'
													: isUsed
														? 'bg-[var(--color-app-surface-secondary)]/40 hover:bg-[var(--color-app-surface-secondary)]/70'
														: 'bg-[var(--color-app-background)]/60 hover:bg-[var(--color-app-background)]/80'}"
												onclick={() => (selectedInstrumentIndex = index)}
												ondblclick={() => startEditingInstrumentId(index)}>
												<span
													class="font-mono text-xs font-semibold {isSelected
														? 'text-[var(--color-app-text-secondary)]'
														: isUsed
															? 'text-[var(--color-app-text-tertiary)] group-hover:text-[var(--color-app-text-primary)]'
															: 'text-[var(--color-app-text-muted)] group-hover:text-[var(--color-app-text-tertiary)]'}">
													{instrument.id}
												</span>
												<span
													class="text-xs {isSelected
														? 'text-[var(--color-app-text-secondary)]'
														: isUsed
															? 'text-[var(--color-app-text-muted)] group-hover:text-[var(--color-app-text-tertiary)]'
															: 'text-[var(--color-app-text-muted)] group-hover:text-[var(--color-app-text-muted)]'}">
													{instrument.name}
												</span>
											</button>
											<div
												class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
												<button
													class="cursor-pointer rounded p-0.5 text-[var(--color-app-text-muted)] hover:text-[var(--color-app-text-primary)]"
													onclick={(e) => {
														e.stopPropagation();
														copyInstrument(index);
													}}
													title="Copy instrument">
													<IconCarbonCopy class="h-3 w-3" />
												</button>
												{#if instruments.length > 1}
													<button
														class="cursor-pointer rounded p-0.5 text-[var(--color-app-text-muted)] hover:text-red-400"
														onclick={(e) => {
															e.stopPropagation();
															removeInstrument(index);
														}}
														title="Remove instrument">
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
						onclick={addInstrument}
						disabled={instruments.length >= MAX_INSTRUMENT_ID_NUM}
						title={instruments.length >= MAX_INSTRUMENT_ID_NUM
							? 'Maximum 1295 instruments (01–ZZ)'
							: 'Add new instrument'}>
						<IconCarbonAdd class="h-3.5 w-3.5" />
						<span>Add</span>
					</button>
					<button
						class="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-xs text-[var(--color-app-text-tertiary)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={saveInstrument}
						disabled={instruments.length === 0}
						title="Save selected instrument to JSON file">
						<IconCarbonSave class="h-3.5 w-3.5" />
						<span>Save</span>
					</button>
					<button
						class="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-xs text-[var(--color-app-text-tertiary)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)]"
						onclick={loadInstrument}
						disabled={instruments.length === 0}
						title="Load instrument from JSON file into selected slot">
						<IconCarbonDocumentImport class="h-3.5 w-3.5" />
						<span>Load</span>
					</button>
					<button
						class="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-xs text-[var(--color-app-text-tertiary)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={openPresets}
						disabled={instruments.length === 0}
						title="Load instrument from built-in presets">
						<IconCarbonFolder class="h-3.5 w-3.5" />
						<span>Presets</span>
					</button>
				</div>
			</div>

			<div
				class="flex shrink-0 cursor-ns-resize items-center justify-center border-y border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] py-1 text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)] {instrumentListResize.isResizing
					? 'bg-[var(--color-app-surface-hover)]'
					: ''}"
				role="button"
				tabindex="0"
				aria-label="Drag to resize instrument list"
				title="Drag to resize instrument list"
				onmousedown={instrumentListResize.beginResize}>
				<IconCarbonArrowsVertical class="h-3 w-3" />
			</div>

			<div class="min-h-0 flex-1 overflow-auto p-4">
				{#if instruments && instruments[selectedInstrumentIndex]}
					{#key instruments[selectedInstrumentIndex].id}
						<InstrumentEditor
							instrument={instruments[selectedInstrumentIndex]}
							{asHex}
							{isExpanded}
							onInstrumentChange={handleInstrumentChange}
							bind:selectedRowIndices={selectedInstrumentRowIndices} />
					{/key}
				{/if}
			</div>
		{/snippet}
	</Card>
</div>
