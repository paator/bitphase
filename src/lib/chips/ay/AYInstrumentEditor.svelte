<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import RowResizeHandle from '../../components/RowResizeHandle/RowResizeHandle.svelte';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonActivity from '~icons/carbon/activity';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonWarningAltFilled from '~icons/carbon/warning-alt-filled';
	import PillTabs, { type PillTab } from '../../components/PillTabs/PillTabs.svelte';
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
		RowEditorNameField,
		SelectableRowNumberCell,
		ValuePaintDrag
	} from '../../components/RowEditorTable';
	import { ROW_SELECTION_STYLES } from '../../utils/row-selection';
	import {
		formatRowEditorNumber,
		focusRowEditorInputInRow,
		parseRowEditorNumericText,
		shouldBlockRowEditorNumericKey
	} from '../../utils/row-editor-numeric';
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
	import AYTimerWaveformEditor from './AYTimerWaveformEditor.svelte';
	import AYTimerEffectsHeaderCells from './AYTimerEffectsHeaderCells.svelte';
	import AYTimerEffectsRowCells from './AYTimerEffectsRowCells.svelte';
	import AYTimerPwmControls from './AYTimerPwmControls.svelte';
	import AYInstrumentSamplePanel from './AYInstrumentSamplePanel.svelte';
	import { AlertBanner } from '../../components/AlertBanner';
	import { AyTimerEffectsController } from './ay-timer-effects-controller.svelte.js';
	import type { TimerEditPanel, TimerEffectDragField } from './ay-timer-effects-controller.svelte';
	import { setAyTimerEffectsContext } from './ay-timer-effects-context';
	import { type AyInstrumentFields } from './instrument';
	import { instrumentHasSample } from './sample-region';

	type InstrumentTab = 'mixer' | 'timer' | 'sample';

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

	let activeTab = $state<InstrumentTab>('mixer');

	const extendedInstrument = $derived(instrument as Instrument & Partial<AyInstrumentFields>);
	const hasSample = $derived(instrumentHasSample(extendedInstrument));

	const instrumentTabs = $derived.by((): PillTab[] => [
		{ id: 'mixer', label: 'Mixer', icon: IconCarbonVolumeUp, disabled: hasSample },
		{ id: 'timer', label: 'Timer Effects', icon: IconCarbonActivity, disabled: hasSample },
		{ id: 'sample', label: 'Sample', icon: IconCarbonWaveform }
	]);

	const timerEditTabs = $derived.by((): PillTab[] => [
		{ id: 'mix', label: 'Mix (SID / Sync)' },
		{ id: 'fm', label: 'FM' },
		{ id: 'envFm', label: 'Env+FM' }
	]);

	const VOLUME_VALUES = Array.from({ length: 16 }, (_, i) => i);
	const showVolumeGrid = $derived(isExpanded && activeTab === 'mixer');
	const FIXED_TABLE_COLUMNS = 3;
	const TIMER_EFFECT_COLUMNS = 7;
	const MIXER_EFFECT_COLUMNS = 13;
	const tableColSpan = $derived(
		activeTab === 'mixer'
			? FIXED_TABLE_COLUMNS + MIXER_EFFECT_COLUMNS
			: FIXED_TABLE_COLUMNS + TIMER_EFFECT_COLUMNS
	);

	const timerEffects = new AyTimerEffectsController(
		() => instrument,
		onInstrumentChange,
		() => asHex
	);
	setAyTimerEffectsContext(timerEffects);

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

	type AyMixerRow = typeof EMPTY_ROW;
	type BooleanInstrumentField =
		| 'tone'
		| 'noise'
		| 'envelope'
		| 'retriggerEnvelope'
		| 'toneAccumulation'
		| 'noiseAccumulation'
		| 'envelopeAccumulation';

	function createDefaultMixerRow() {
		return { ...EMPTY_ROW };
	}

	const booleanDrag = new BooleanPaintDrag();
	const volumeDrag = new ValuePaintDrag<number>();

	function ensureNonEmptyRows(rowsArray: AyMixerRow[]): AyMixerRow[] {
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

	let tableRef: HTMLTableElement | null = $state(null);
	let editorContainerRef: HTMLDivElement | null = $state(null);

	const selection = createRowEditorSelection({
		getSelectedIndices: () => selectedRowIndices,
		setSelectedIndices: (indices) => {
			selectedRowIndices = indices;
		},
		getRowCount: () =>
			activeTab === 'timer'
				? timerEffects.fields.timerRows.length
				: mixerSync.rows.length,
		focusContainer: () => editorContainerRef?.focus()
	});

	const mixerSync = new NamedRowEditorSync<AyMixerRow>({
		getSource: () => instrument,
		normalizeRows: (rows) => ensureNonEmptyRows(rows as AyMixerRow[]),
		onUpdate: (updates) => onInstrumentChange({ ...instrument, ...updates }),
		onSourceIdChange: () => {
			selectedRowIndices = [];
			selection.clearSelection();
		}
	});

	const displayRowCount = $derived(
		activeTab === 'timer' ? timerEffects.fields.timerRows.length : mixerSync.rows.length
	);

	const activeLoopRow = $derived(
		activeTab === 'timer' ? timerEffects.fields.timerLoop : mixerSync.loopRow
	);

	const loopMarker = createLoopMarkerMeasure(
		() => tableRef,
		() => activeLoopRow,
		() => displayRowCount,
		() => `${isExpanded}-${activeTab}`
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

	const NUMERIC_FIELDS = [
		{ key: 'toneAdd', min: -4096, max: 4095 },
		{ key: 'noiseAdd', min: -4096, max: 4095 },
		{ key: 'envelopeAdd', min: -4096, max: 4095 },
		{ key: 'volume', min: 0, max: 15 }
	] as const;

	function incrementSelectedRows(delta: number) {
		if (selectedRowIndices.length === 0) return;
		const nextRows = [...mixerSync.rows];
		for (const index of selectedRowIndices) {
			let updated = { ...nextRows[index] };
			for (const { key, min, max } of NUMERIC_FIELDS) {
				const current = key === 'envelopeAdd' ? (updated.envelopeAdd ?? 0) : updated[key];
				const next = Math.max(min, Math.min(max, current + delta));
				updated = { ...updated, [key]: next };
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

	function updateNumericField(index: number, field: string, event: Event) {
		const inputEl = event.target as HTMLInputElement;
		const limits =
			field === 'volume' ? { min: 0, max: 15, maxDigits: asHex ? 1 : undefined } : undefined;
		const parsed = parseRowEditorNumericText(inputEl.value, asHex, limits);
		if (parsed !== null) {
			const normalized = formatRowEditorNumber(parsed, asHex);
			if (inputEl.value !== normalized) {
				inputEl.value = normalized;
			}
			updateRow(index, field, parsed);
		}
	}

	function handleNumericKeyDown(index: number, event: KeyboardEvent) {
		const key = event.key;
		const inputEl = event.target as HTMLInputElement;

		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = index + 1;
			if (nextIndex < mixerSync.rows.length) {
				const currentRow = inputEl.closest('tr');
				focusRowEditorInputInRow(
					currentRow?.nextElementSibling as HTMLTableRowElement | null,
					inputEl
				);
			} else if (nextIndex === mixerSync.rows.length) {
				mixerSync.addRow(createDefaultMixerRow);
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

	function setActiveLoop(index: number): void {
		if (activeTab === 'timer') {
			timerEffects.setTimerLoop(index);
		} else {
			mixerSync.setLoop(index);
		}
	}

	function addDisplayRow(): void {
		if (activeTab === 'timer') {
			timerEffects.addTimerRow();
		} else {
			mixerSync.addRow(createDefaultMixerRow);
		}
	}

	function setDisplayRowCount(targetCount: number): void {
		if (activeTab === 'timer') {
			timerEffects.setTimerRowCount(targetCount);
		} else {
			mixerSync.setRowCount(targetCount, createDefaultMixerRow, ROW_EDITOR_MAX_ROWS);
		}
	}

	function removeDisplayRow(index: number): void {
		if (activeTab === 'timer') {
			timerEffects.removeTimerRow(index);
		} else {
			mixerSync.removeRow(index);
		}
	}

	function removeDisplayRowsFromBottom(index: number): void {
		if (activeTab === 'timer') {
			timerEffects.removeTimerRowsFromBottom(index);
		} else {
			mixerSync.removeRowsFromBottom(index);
		}
	}

	function paintTimerEffectAt(clientX: number, clientY: number): void {
		const target = document.elementFromPoint(clientX, clientY);
		const cell = target?.closest('[data-timer-effect-cell]') as HTMLElement | null;
		if (!cell) {
			return;
		}
		const rowIndex = Number(cell.dataset.rowIndex);
		const field = cell.dataset.timerEffectField as TimerEffectDragField | undefined;
		if (!field || Number.isNaN(rowIndex)) {
			return;
		}
		timerEffects.dragOverTimerEffect(rowIndex, field);
	}

	function handleTimerEffectPointerMove(event: PointerEvent): void {
		if (activeTab !== 'timer' || !timerEffects.isDragging) {
			return;
		}
		paintTimerEffectAt(event.clientX, event.clientY);
	}

	function handleTimerEffectPointerEnd(event: PointerEvent): void {
		if (!timerEffects.isDragging) {
			return;
		}
		paintTimerEffectAt(event.clientX, event.clientY);
		timerEffects.stopDrag();
		tableRef?.releasePointerCapture(event.pointerId);
	}

	const timerTableLayoutKey = $derived(
		activeTab === 'timer'
			? timerEffects.fields.timerRows
					.map((row) => `${row.sid ? 1 : 0}${row.syncbuzzer ? 1 : 0}${row.fm ? 1 : 0}`)
					.join('')
			: ''
	);

	export function addRowExternal() {
		mixerSync.addRow(createDefaultMixerRow);
	}

	export function removeLastRowExternal() {
		mixerSync.removeRow(mixerSync.rows.length - 1);
	}

	$effect(() => {
		void timerTableLayoutKey;
		void timerEffects.waveformEditorRowIndex;
		void loopMarker.style;
	});

	$effect(() => {
		timerEffects.handleInstrumentChange(instrument);
	});

	$effect(() => {
		if (hasSample && activeTab !== 'sample') {
			activeTab = 'sample';
			timerEffects.closeWaveformEditor();
		}
	});

	$effect(() => {
		const stop = () => timerEffects.stopDrag();
		window.addEventListener('mouseup', stop);
		return () => window.removeEventListener('mouseup', stop);
	});

	$effect(() => {
		const containerEl = editorContainerRef;
		if (!containerEl) return;

		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (selectedRowIndices.length > 0 && !containerEl!.contains(target)) {
				selection.clearSelection();
			}
		}

		function handleFocusOut(event: FocusEvent) {
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

<div
	class="w-full max-w-full min-w-0 overflow-x-auto outline-none focus:outline-none"
	bind:this={editorContainerRef}
	tabindex="-1">
	<RowEditorNameField bind:name={mixerSync.name} />

	<PillTabs
		bind:activeTabId={activeTab}
		tabs={instrumentTabs}
		class="mt-3 ml-2"
		onSelect={(tabId) => {
			if (tabId === 'sample') {
				timerEffects.closeWaveformEditor();
			}
		}} />

	{#if activeTab === 'timer'}
		<PillTabs
			activeTabId={timerEffects.timerEditPanel}
			tabs={timerEditTabs}
			size="sm"
			class="mt-2 ml-2"
			onSelect={(tabId) => timerEffects.setTimerEditPanel(tabId as TimerEditPanel)} />
		<AlertBanner variant="warning" class="mx-2 mt-2 px-3 py-2 text-xs">
			<div class="flex gap-2">
				<IconCarbonWarningAltFilled
					class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pattern-note-off)]" />
				<div class="min-w-0">
					<p class="font-medium text-[var(--color-pattern-note-off)]">
						Experimental — use at your own risk
					</p>
					<p class="mt-1 text-[var(--color-app-text-secondary)]">
						Timer effects are not supported on real AY/YM hardware yet. Playback is emulator-only
						for now, and breaking changes to the format and behavior are expected.
					</p>
				</div>
			</div>
		</AlertBanner>
	{/if}

	{#if activeTab === 'sample'}
		<AlertBanner variant="warning" class="mx-2 mt-2 px-3 py-2 text-xs">
			<div class="flex gap-2">
				<IconCarbonWarningAltFilled
					class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pattern-note-off)]" />
				<div class="min-w-0">
					<p class="font-medium text-[var(--color-pattern-note-off)]">
						Experimental — use at your own risk
					</p>
					<p class="mt-1 text-[var(--color-app-text-secondary)]">
						Sample instruments are not supported on real AY/YM hardware yet. Playback is
						emulator-only for now, and breaking changes to the format and behavior are expected.
					</p>
				</div>
			</div>
		</AlertBanner>
	{/if}

	{#if activeTab === 'timer' && timerEffects.waveformEditorRowIndex !== null}
		<AYTimerWaveformEditor
			rowIndex={timerEffects.waveformEditorRowIndex}
			{isExpanded}
			onclose={() => timerEffects.closeWaveformEditor()} />
	{/if}

	{#if activeTab === 'sample'}
		<div class="mt-3 mr-2 ml-2 box-border min-w-0">
			<AYInstrumentSamplePanel {instrument} {isExpanded} {onInstrumentChange} />
		</div>
	{:else}
		<div class="mt-3 flex items-start gap-2 overflow-x-auto">
			{#key `${isExpanded}-${activeTab}`}
				<div
					class="relative flex flex-col {activeTab === 'timer'
						? 'w-full min-w-0'
						: ''}">
					<LoopMarkerOverlay style={loopMarker.style} />
					<table
						bind:this={tableRef}
						onpointermove={handleTimerEffectPointerMove}
						onpointerup={handleTimerEffectPointerEnd}
						onpointercancel={handleTimerEffectPointerEnd}
						class="row-editor-table table-fixed border-collapse bg-[var(--color-app-surface)] font-mono text-xs select-none {activeTab ===
						'timer'
							? 'w-full'
							: ''}">
						<thead>
							<tr>
								<th
									class={isExpanded
										? 'w-14 min-w-14 px-2 py-1.5'
										: 'w-8 min-w-8 px-1 py-1'}>row</th>
								<th class={isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 min-w-10 px-0.5'}></th>
								<th
									class={isExpanded ? 'w-6 min-w-6 px-1.5' : 'w-4 min-w-4 px-0.5'}
									>{isExpanded ? 'loop' : 'lp'}</th>
								{#if activeTab === 'mixer'}
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
								{:else}
									<AYTimerEffectsHeaderCells {isExpanded} />
								{/if}
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
							{#each activeTab === 'timer' ? timerEffects.timerRows : mixerSync.rows as _, index (index)}
								{@const selected = selection.isRowSelected(index)}
								<tr
									class="{isExpanded ? 'h-8' : 'h-7'} {selected
										? ROW_SELECTION_STYLES.row
										: ''}">
									<SelectableRowNumberCell
										{index}
										{selected}
										sizeClass={isExpanded
											? 'w-14 min-w-14 px-2 py-1.5'
											: 'w-8 min-w-8 px-1 py-1 text-[0.65rem]'}
										onmousedown={(e) => selection.handleRowSelect(index, e)} />
									<RowEditorActionsCell
										{index}
										rowCount={displayRowCount}
										{selected}
										{isExpanded}
										onRemove={() => removeDisplayRow(index)}
										onRemoveFromBottom={() => removeDisplayRowsFromBottom(index)} />
									<RowEditorLoopCell
										{selected}
										{isExpanded}
										onSelect={() => setActiveLoop(index)} />
									{#if activeTab === 'mixer'}
										{@const row = mixerSync.rows[index]}
										<BooleanPaintableCell
											active={row.tone}
											{selected}
											{isExpanded}
											widthClass={isExpanded ? 'w-8 min-w-8' : 'w-8 min-w-8'}
											onPaintBegin={() =>
												booleanDrag.begin(
													() => row.tone,
													(value) => updateBooleanRow(index, 'tone', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'tone', value))} />
										<BooleanPaintableCell
											active={row.noise}
											{selected}
											{isExpanded}
											widthClass={isExpanded ? 'w-8 min-w-8' : 'w-8 min-w-8'}
											onPaintBegin={() =>
												booleanDrag.begin(
													() => row.noise,
													(value) => updateBooleanRow(index, 'noise', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'noise', value))} />
										<BooleanPaintableCell
											active={row.envelope}
											{selected}
											{isExpanded}
											widthClass={isExpanded ? 'w-8 min-w-8' : 'w-8 min-w-8'}
											onPaintBegin={() =>
												booleanDrag.begin(
													() => row.envelope,
													(value) => updateBooleanRow(index, 'envelope', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'envelope', value))} />
										<BooleanPaintableCell
											active={row.retriggerEnvelope ?? false}
											{selected}
											{isExpanded}
											title="Retrigger envelope when this row is played"
											widthClass={isExpanded ? 'w-8 min-w-8' : 'w-8 min-w-8'}
											onPaintBegin={() =>
												booleanDrag.begin(
													() => row.retriggerEnvelope ?? false,
													(value) =>
														updateBooleanRow(index, 'retriggerEnvelope', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'retriggerEnvelope', value))} />
										<!-- ToneAdd -->
										<td
											class={isExpanded
												? 'w-16 min-w-16 px-1.5'
												: 'w-12 px-0.5'}>
											<input
												type="text"
												class={compactTableInputClass({ selected, isExpanded })}
												value={formatRowEditorNumber(row.toneAdd, asHex)}
												onkeydown={(e) => handleNumericKeyDown(index, e)}
												onfocus={(e) =>
													(e.target as HTMLInputElement).select()}
												oninput={(e) =>
													updateNumericField(index, 'toneAdd', e)} />
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
													(value) =>
														updateBooleanRow(index, 'toneAccumulation', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'toneAccumulation', value))} />
										<!-- NoiseAdd -->
										<td
											class={isExpanded
												? 'w-16 min-w-16 px-1.5'
												: 'w-12 px-0.5'}>
											<input
												type="text"
												class={compactTableInputClass({ selected, isExpanded })}
												value={formatRowEditorNumber(row.noiseAdd, asHex)}
												onkeydown={(e) => handleNumericKeyDown(index, e)}
												onfocus={(e) =>
													(e.target as HTMLInputElement).select()}
												oninput={(e) =>
													updateNumericField(index, 'noiseAdd', e)} />
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
													(value) =>
														updateBooleanRow(index, 'noiseAccumulation', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'noiseAccumulation', value))} />
										<!-- EnvelopeAdd -->
										<td
											class={isExpanded
												? 'w-16 min-w-16 px-1.5'
												: 'w-12 px-0.5'}>
											<input
												type="text"
												class={compactTableInputClass({ selected, isExpanded })}
												value={formatRowEditorNumber(row.envelopeAdd ?? 0, asHex)}
												onkeydown={(e) => handleNumericKeyDown(index, e)}
												onfocus={(e) =>
													(e.target as HTMLInputElement).select()}
												oninput={(e) =>
													updateNumericField(index, 'envelopeAdd', e)} />
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
													(value) =>
														updateBooleanRow(index, 'envelopeAccumulation', value)
												)}
											onPaintOver={() =>
												booleanDrag.dragOver((value) =>
													updateBooleanRow(index, 'envelopeAccumulation', value))} />
										<!-- Volume -->
										<td
											class={isExpanded
												? 'w-12 min-w-12 px-1.5'
												: 'w-12 px-0.5'}>
											<input
												type="text"
												class={compactTableInputClass({ selected, isExpanded })}
												value={formatRowEditorNumber(row.volume, asHex)}
												onkeydown={(e) => handleNumericKeyDown(index, e)}
												onfocus={(e) =>
													(e.target as HTMLInputElement).select()}
												oninput={(e) =>
													updateNumericField(index, 'volume', e)} />
										</td>
										<!-- Amplitude Slide (merged: off/up/down) -->
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
												>{row.amplitudeSliding
													? row.amplitudeSlideUp
														? '↑'
														: '↓'
													: ''}</span>
										</td>
									{:else}
										<AYTimerEffectsRowCells {index} {selected} {isExpanded} />
									{/if}
								</tr>
							{/each}
						</tbody>
						<tfoot>
							{#if activeTab === 'timer'}
								<tr>
									<td
										colspan={tableColSpan}
										class="border-t border-[var(--color-app-border)] px-0 py-0">
										<AYTimerPwmControls {isExpanded} />
									</td>
								</tr>
							{/if}
							<tr>
								<td colspan={tableColSpan} class="px-2 py-1">
									<RowEditorAddRowButton onAdd={addDisplayRow} />
								</td>
							</tr>
							<tr>
								<td
									colspan={tableColSpan}
									class="border-t border-[var(--color-app-border)] p-0">
									<RowResizeHandle
										rowCount={displayRowCount}
										onRowCountChange={setDisplayRowCount}
										rowHeightPx={isExpanded ? 32 : 28}
										maxRows={ROW_EDITOR_MAX_ROWS} />
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
										{formatRowEditorNumber(v, asHex)}
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
							{#each mixerSync.rows as row, index}
								{@const selected = selection.isRowSelected(index)}
								<tr class="h-8 {selected ? ROW_SELECTION_STYLES.row : ''}">
									<td
										class="border border-[var(--color-app-border)] px-2 text-right {selected
											? ROW_SELECTION_STYLES.rowNumber
											: 'bg-[var(--color-app-surface-secondary)]'}"
										>{index}</td>
									{#each VOLUME_VALUES as v}
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
			{/key}
		</div>
	{/if}
</div>
