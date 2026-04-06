<script lang="ts">
	import type { Pattern } from '../../models/song';
	import type {
		ChipProcessor,
		TuningTableSupport,
		InstrumentSupport,
		VirtualChannelSupport
	} from '../../chips/base/processor';
	import type { AudioService } from '../../services/audio/audio-service';
	import Card from '../Card/Card.svelte';
	import PatternEditor from './PatternEditor.svelte';
	import PatternOrder from './PatternOrder.svelte';
	import { TabView } from '../TabView';
	import { TablesView } from '../Tables';
	import { DetailsView } from '../Details';
	import { InstrumentsView } from '../Instruments';
	import IconCarbonChip from '~icons/carbon/chip';
	import IconCarbonListBoxes from '~icons/carbon/list-boxes';
	import IconCarbonDataTable from '~icons/carbon/data-table';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonInformationSquare from '~icons/carbon/information-square';
	import IconCarbonChevronUp from '~icons/carbon/chevron-up';
	import IconCarbonChevronDown from '~icons/carbon/chevron-down';
	import IconCarbonClose from '~icons/carbon/close';
	import { PATTERN_EDITOR_CONSTANTS } from './types';
	import { getContext, setContext, tick } from 'svelte';
	import Input from '../Input/Input.svelte';
	import { playbackStore } from '../../stores/playback.svelte';
	import StatusBar from './StatusBar.svelte';
	import ChannelOscilloscopes from './ChannelOscilloscopes.svelte';
	import { PatternService } from '../../services/pattern/pattern-service';
	import { settingsStore } from '../../stores/settings.svelte';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import { isEditableElement } from '../../utils/shortcut-input-exclusion';
	import { ACTION_TOGGLE_PLAYBACK } from '../../config/keybindings';

	let {
		chipProcessors,
		patternEditor = $bindable(),
		activeEditorIndex = $bindable(0),
		onaction
	}: {
		chipProcessors: ChipProcessor[];
		patternEditor?: PatternEditor | null;
		activeEditorIndex?: number;
		onaction?: (data: { action: string; songIndex?: number }) => void;
	} = $props();

	let sharedPatternOrderIndex = $state(0);
	let sharedSelectedRow = $state(0);
	let songViewContainer: HTMLDivElement;
	let patternEditors: PatternEditor[] = $state([]);
	let tuningTableVersion = $state(0);
	let rightPanelActiveTabId = $state('instruments');
	let isRightPanelExpanded = $state(false);
	let selectedColumn = $state(0);
	let selectedFieldKey = $state<string | null>(null);

	$effect(() => {
		if (rightPanelActiveTabId === 'details') {
			isRightPanelExpanded = false;
		}
	});

	$effect(() => {
		if (!isRightPanelExpanded) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key !== 'Escape') return;
			isRightPanelExpanded = false;
			tick().then(() => {
				patternEditor?.focusCanvas?.();
			});
			e.preventDefault();
		}
		window.addEventListener('keydown', handleKeyDown, { capture: true });
		return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
	});

	$effect(() => {
		const activeEditor = patternEditors[activeEditorIndex];
		if (activeEditor) {
			patternEditor = activeEditor;
		}
	});

	$effect(() => {
		const activeEditor = patternEditors[activeEditorIndex];
		if (activeEditor) {
			selectedColumn = activeEditor.getSelectedColumn();
			selectedFieldKey = activeEditor.getSelectedFieldKey();
			const interval = setInterval(() => {
				selectedColumn = activeEditor.getSelectedColumn();
				selectedFieldKey = activeEditor.getSelectedFieldKey();
			}, 100);
			return () => clearInterval(interval);
		}
	});

	let patternLengthValue = $state('');

	const blurredContentClass = $derived(
		isRightPanelExpanded ? 'pointer-events-none opacity-50' : ''
	);

	const services: { audioService: AudioService } = getContext('container');

	let previewSpaceHandler = $state<(() => void) | null>(null);
	let rightPanelEl: HTMLDivElement | null = $state(null);
	setContext('registerPreviewSpaceHandler', (fn: (() => void) | null) => {
		previewSpaceHandler = fn;
	});

	setContext('requestPatternRedraw', () => {
		patternEditors.forEach((editor) => editor?.requestRedraw?.());
	});

	$effect(() => {
		if (editorStateStore.selectInstrumentRequest) {
			rightPanelActiveTabId = 'instruments';
		}
	});

	$effect(() => {
		if (editorStateStore.selectTableRequest !== null) {
			rightPanelActiveTabId = 'tables';
		}
	});

	$effect(() => {
		const el = rightPanelEl;
		const handler = previewSpaceHandler;
		if (!el) return;
		const container = el;
		function onKeyDownCapture(e: KeyboardEvent) {
			if (e.repeat) return;
			const shortcut = ShortcutString.fromEvent(e);
			const action = keybindingsStore.getActionForShortcut(shortcut);
			if (action !== ACTION_TOGGLE_PLAYBACK) return;
			if (!container.contains(document.activeElement)) return;
			if (isEditableElement(document.activeElement)) return;
			if (handler) {
				e.preventDefault();
				e.stopPropagation();
				const active = document.activeElement as HTMLElement | null;
				if (active && active !== container) {
					active.blur?.();
					container.focus();
				}
				handler();
			}
		}
		container.addEventListener('keydown', onKeyDownCapture, { capture: true });
		return () => container.removeEventListener('keydown', onKeyDownCapture, { capture: true });
	});

	const SPEED_EFFECT_TYPE = 'S'.charCodeAt(0);

	function handleMakeUnique(index: number): void {
		const result = PatternService.makePatternUniqueMultiChip(
			projectStore.patterns,
			projectStore.patternOrder,
			index,
			(i) => chipProcessors[i]?.chip?.schema
		);
		result.updatedPatterns.forEach((newPatterns, i) => {
			projectStore.updatePatterns(i, newPatterns);
		});
		projectStore.patternOrder = result.newPatternOrder;
		if (index === sharedPatternOrderIndex) {
			sharedSelectedRow = 0;
		}
		patternEditors.forEach((editor) => editor?.requestRedraw?.());
	}

	function findLastSpeedCommand(
		songPatterns: Pattern[],
		order: number[],
		startPatternOrderIndex: number,
		startRow: number
	): number | null {
		for (
			let patternOrderIdx = startPatternOrderIndex;
			patternOrderIdx >= 0;
			patternOrderIdx--
		) {
			const patternId = order[patternOrderIdx];
			const pattern = songPatterns.find((p) => p.id === patternId);
			if (!pattern) continue;

			const startRowIdx =
				patternOrderIdx === startPatternOrderIndex ? startRow : pattern.length - 1;

			for (let rowIdx = startRowIdx; rowIdx >= 0; rowIdx--) {
				for (const channel of pattern.channels) {
					const row = channel.rows[rowIdx];
					if (row.effects[0] && row.effects[0].effect === SPEED_EFFECT_TYPE) {
						const speed = row.effects[0].parameter;
						if (speed > 0) {
							return speed;
						}
					}
				}
			}
		}

		return null;
	}

	function getSpeedForChip(chipIndex: number): number | null {
		const song = projectStore.songs[chipIndex];
		const songPatterns = projectStore.patterns[chipIndex];
		if (!song || !songPatterns) return null;

		const lastSpeed = findLastSpeedCommand(
			songPatterns,
			projectStore.patternOrder,
			sharedPatternOrderIndex,
			sharedSelectedRow
		);
		return lastSpeed !== null ? lastSpeed : song.initialSpeed;
	}

	function initAllChips(playPattern: boolean) {
		const patternId = projectStore.patternOrder[sharedPatternOrderIndex];
		const patternOrderIndexForInit = playPattern ? 0 : sharedPatternOrderIndex;

		if (playPattern) {
			services.audioService.setPlayPatternRestoreOrder(
				[...projectStore.patternOrder],
				patternId,
				projectStore.loopPointId
			);
			services.audioService.updateOrder([patternId], 0);
		}

		chipProcessors.forEach((chipProcessor, index) => {
			const song = projectStore.songs[index];
			const songPatterns = projectStore.patterns[index];
			if (!song || !songPatterns) return;

			const currentPattern = songPatterns.find((p) => p.id === patternId);
			if (!currentPattern) return;

			const withVirtual = chipProcessor as ChipProcessor & Partial<VirtualChannelSupport>;
			if (withVirtual.sendVirtualChannelConfig) {
				const hwLabels = chipProcessor.chip?.schema?.channelLabels ?? ['A', 'B', 'C'];
				withVirtual.sendVirtualChannelConfig(
					song.virtualChannelMap ?? {},
					hwLabels.length
				);
			}

			chipProcessor.sendInitPattern(currentPattern, patternOrderIndexForInit);
			chipProcessor.sendInitTables(projectStore.tables);

			const withTuningTables = chipProcessor as ChipProcessor & Partial<TuningTableSupport>;
			const withInstruments = chipProcessor as ChipProcessor & Partial<InstrumentSupport>;
			if ('sendInitTuningTable' in chipProcessor && withTuningTables.sendInitTuningTable) {
				withTuningTables.sendInitTuningTable(song.tuningTable);
			}
			if ('sendInitInstruments' in chipProcessor && withInstruments.sendInitInstruments) {
				withInstruments.sendInitInstruments(projectStore.instruments);
			}
		});

		if (!playPattern) {
			services.audioService.updateOrder(projectStore.patternOrder, projectStore.loopPointId);
		}
	}

	$effect(() => {
		projectStore.patternOrder;
		projectStore.loopPointId;
		if (services.audioService.getPlayPatternId() !== null) return;
		services.audioService.updateOrder(
			[...projectStore.patternOrder],
			projectStore.loopPointId
		);
	});

	function initAllChipsForPlayback() {
		initAllChips(false);
	}

	function initAllChipsForPlayPattern() {
		initAllChips(true);
	}

	function getSpeedForPlayPattern(chipIndex: number): number | null {
		const song = projectStore.songs[chipIndex];
		const songPatterns = projectStore.patterns[chipIndex];
		if (!song || !songPatterns) return null;

		const lastSpeed = findLastSpeedCommand(
			songPatterns,
			projectStore.patternOrder,
			sharedPatternOrderIndex,
			0
		);
		return lastSpeed !== null ? lastSpeed : song.initialSpeed;
	}

	let patternOrderHeight = $state(PATTERN_EDITOR_CONSTANTS.DEFAULT_CANVAS_HEIGHT);

	const rightPanelTabs = [
		{ id: 'instruments', label: 'Instruments', icon: IconCarbonWaveform },
		{ id: 'tables', label: 'Tables', icon: IconCarbonDataTable },
		{ id: 'details', label: 'Details', icon: IconCarbonInformationSquare }
	];

	$effect(() => {
		if (!songViewContainer) return;

		const resizeObserver = new ResizeObserver(() => {
			if (songViewContainer.clientHeight > 0) {
				const availableHeight = songViewContainer.clientHeight;
				const gap = 8;
				patternOrderHeight = Math.max(
					PATTERN_EDITOR_CONSTANTS.MIN_CANVAS_HEIGHT,
					availableHeight - gap
				);
			}
		});

		resizeObserver.observe(songViewContainer);

		return () => {
			resizeObserver.disconnect();
		};
	});

	const currentPatternId = $derived(projectStore.patternOrder[sharedPatternOrderIndex]);
	const currentPatternLength = $derived.by(() => {
		const songPatterns = projectStore.patterns[0];
		if (!songPatterns) return null;
		const pattern = songPatterns.find((p) => p.id === currentPatternId);
		return pattern?.length ?? null;
	});

	$effect(() => {
		const el = document.activeElement;
		if (el?.id?.startsWith?.('pattern-length-input')) return;
		patternLengthValue = currentPatternLength !== null ? currentPatternLength.toString() : '';
	});

	$effect(() => {
		const len = currentPatternLength;
		if (len !== null && sharedSelectedRow >= len) {
			sharedSelectedRow = Math.max(0, len - 1);
		}
	});

	function applyLengthToAllSongs(length: number) {
		const patternId = projectStore.patternOrder[sharedPatternOrderIndex];
		for (let j = 0; j < projectStore.patterns.length; j++) {
			const songPatterns = projectStore.patterns[j];
			const pattern = songPatterns.find((p) => p.id === patternId);
			if (!pattern || pattern.length === length) continue;
			const schema = chipProcessors[j].chip.schema;
			const resized = PatternService.resizePattern(pattern, length, schema);
			projectStore.updatePatterns(
				j,
				PatternService.updatePatternInArray(songPatterns, resized)
			);
		}
		if (sharedSelectedRow >= length) {
			sharedSelectedRow = Math.max(0, length - 1);
		}
		patternEditors.forEach((editor) => editor?.requestRedraw?.());
	}

	function commitPatternLength() {
		const length = parseInt(patternLengthValue, 10);
		if (!isNaN(length) && length >= 1 && length <= 256) {
			applyLengthToAllSongs(length);
			patternLengthValue = length.toString();
		} else {
			patternLengthValue =
				currentPatternLength !== null ? currentPatternLength.toString() : '';
		}
	}

	function incrementPatternLength() {
		const current = parseInt(patternLengthValue, 10);
		if (isNaN(current) || current < 1 || current >= 256) return;
		const newLength = current + 1;
		applyLengthToAllSongs(newLength);
		patternLengthValue = newLength.toString();
	}

	function decrementPatternLength() {
		const current = parseInt(patternLengthValue, 10);
		if (isNaN(current) || current <= 1 || current > 256) return;
		const newLength = current - 1;
		applyLengthToAllSongs(newLength);
		patternLengthValue = newLength.toString();
	}
</script>

<div bind:this={songViewContainer} class="relative flex h-full flex-col overflow-hidden">
	<div class="flex flex-1 overflow-hidden">
		<div class="relative flex min-w-0 flex-1 flex-nowrap overflow-x-auto overflow-y-hidden">
			<div
				class="sticky left-0 z-20 h-full shrink-0 bg-[var(--color-app-surface-secondary)] transition-all duration-300 {blurredContentClass}">
				<Card
					title="Order"
					fullHeight={true}
					icon={IconCarbonListBoxes}
					class="overflow-hidden p-0">
					<PatternOrder
						bind:currentPatternOrderIndex={sharedPatternOrderIndex}
						bind:selectedRow={sharedSelectedRow}
						canvasHeight={patternOrderHeight}
						onMakeUnique={handleMakeUnique}
						onPatternOrderEdited={async () => {
							await tick();
							patternEditors.forEach((e) => e?.requestRedraw?.());
						}}
						onPatternSelect={(index) =>
							patternEditors[0]?.markPatternChangeFromUser?.(index)} />
				</Card>
			</div>
			<div
				class="flex min-h-0 min-w-max flex-1 flex-col overflow-hidden transition-all duration-300 {blurredContentClass}">
				<div class="flex min-h-0 min-w-0 flex-1 flex-nowrap justify-center">
					{#each projectStore.songs as song, i}
						<Card
							title={`${chipProcessors[i].chip.name} - (${i + 1})`}
							fullHeight={true}
							icon={IconCarbonChip}
							class="flex shrink-0 flex-col p-0">
							{#snippet headerContent()}
								<div class="flex items-center gap-1">
									<div
										class="flex items-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] {playbackStore.isPlaying
											? 'opacity-50'
											: ''}">
										<Input
											value={patternLengthValue}
											id="pattern-length-input-{i}"
											type="number"
											min="1"
											max="256"
											step="1"
											disabled={playbackStore.isPlaying}
											class="h-5 w-10 border-0 bg-transparent px-1 py-0 text-center font-mono text-xs leading-none focus:ring-0 disabled:cursor-not-allowed"
											onfocus={() => {
												if (!playbackStore.isPlaying) {
													activeEditorIndex = i;
													patternEditor = patternEditors[i];
												}
											}}
											oninput={(e) => {
												if (!playbackStore.isPlaying) {
													patternLengthValue = (
														e.target as HTMLInputElement
													).value;
												}
											}}
											onblur={() => {
												if (!playbackStore.isPlaying) {
													commitPatternLength();
												}
											}}
											onkeydown={(e: KeyboardEvent) => {
												if (playbackStore.isPlaying) {
													e.preventDefault();
													return;
												}
												if (e.key === 'Enter') {
													e.preventDefault();
													commitPatternLength();
													(e.target as HTMLInputElement)?.blur();
												}
											}} />
										<div
											class="flex flex-col border-l border-[var(--color-app-border)]">
											<button
												type="button"
												disabled={playbackStore.isPlaying}
												class="flex h-2.5 w-3.5 cursor-pointer items-center justify-center border-b border-[var(--color-app-border)] transition-colors hover:bg-[var(--color-app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
												onclick={() => {
													if (!playbackStore.isPlaying) {
														activeEditorIndex = i;
														patternEditor = patternEditors[i];
														incrementPatternLength();
													}
												}}
												title="Increment pattern length">
												<IconCarbonChevronUp
													class="h-2 w-2 text-[var(--color-app-text-muted)]" />
											</button>
											<button
												type="button"
												disabled={playbackStore.isPlaying}
												class="flex h-2.5 w-3.5 cursor-pointer items-center justify-center transition-colors hover:bg-[var(--color-app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
												onclick={() => {
													if (!playbackStore.isPlaying) {
														activeEditorIndex = i;
														patternEditor = patternEditors[i];
														decrementPatternLength();
													}
												}}
												title="Decrement pattern length">
												<IconCarbonChevronDown
													class="h-2 w-2 text-[var(--color-app-text-muted)]" />
											</button>
										</div>
									</div>
									{#if projectStore.songs.length > 1}
										<button
											type="button"
											disabled={playbackStore.isPlaying}
											class="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--color-pattern-note-off)] transition-colors hover:bg-[var(--color-app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
											title="Remove song"
											onclick={() =>
												onaction?.({
													action: 'remove-song',
													songIndex: i
												})}>
											<IconCarbonClose class="h-3.5 w-3.5" />
										</button>
									{/if}
								</div>
							{/snippet}
							<div class="flex flex-1 flex-col overflow-hidden">
								<PatternEditor
									bind:this={patternEditors[i]}
									songIndex={i}
									bind:currentPatternOrderIndex={sharedPatternOrderIndex}
									bind:selectedRow={sharedSelectedRow}
									isActive={activeEditorIndex === i}
									isPlaybackMaster={i === 0}
									onfocus={() => {
										activeEditorIndex = i;
										patternEditor = patternEditors[i];
									}}
									canFocusOnHover={() =>
										!patternEditors.some((e) => e?.getCanvas?.() === document.activeElement)}
									{onaction}
									initAllChips={initAllChipsForPlayback}
									{initAllChipsForPlayPattern}
									{getSpeedForChip}
									{getSpeedForPlayPattern}
									{tuningTableVersion}
									chip={chipProcessors[i].chip}
									chipProcessor={chipProcessors[i]} />
							</div>
						</Card>
					{/each}
				</div>
			</div>
			{#if isRightPanelExpanded}
				<button
					type="button"
					class="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0"
					onclick={() => (isRightPanelExpanded = false)}
					aria-label="Collapse panel"></button>
			{/if}
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={rightPanelEl}
			role="region"
			aria-label="Instruments and tables"
			tabindex={0}
			class="relative z-10 flex h-full shrink-0 flex-col border-l border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] outline-none transition-all duration-300 focus:outline-none {isRightPanelExpanded
				? 'w-[1200px]'
				: 'w-[32rem]'}"
			onmousedown={(e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest('input, textarea, button, select, [contenteditable="true"], a')) {
					rightPanelEl?.focus();
				}
			}}>
			<div class="min-h-0 flex-1 overflow-hidden">
				<TabView tabs={rightPanelTabs} bind:activeTabId={rightPanelActiveTabId}>
					{#snippet children(tabId)}
						{#if tabId === 'tables'}
							<TablesView bind:isExpanded={isRightPanelExpanded} />
						{:else if tabId === 'instruments'}
							<InstrumentsView
								bind:isExpanded={isRightPanelExpanded}
								chip={chipProcessors[0].chip} />
						{:else if tabId === 'details'}
							<DetailsView
								{chipProcessors}
								onChipSettingsApplied={() => {
									tuningTableVersion++;
								}} />
						{/if}
					{/snippet}
				</TabView>
			</div>
			{#if projectStore.songs.length > 0 && activeEditorIndex < projectStore.songs.length}
				<div class="flex shrink-0 flex-col border-t border-[var(--color-app-border)]/50">
					{#if settingsStore.showInstrumentPreview && chipProcessors[activeEditorIndex].chip.previewRow}
						{@const PreviewRow = chipProcessors[activeEditorIndex].chip.previewRow}
						<div class="flex flex-col gap-2 bg-[var(--color-app-surface)] px-2 py-3">
							<PreviewRow
								chip={chipProcessors[activeEditorIndex].chip}
								instrumentId={editorStateStore.currentInstrument}
								tuningTable={projectStore.songs[activeEditorIndex]?.tuningTable ??
									[]} />
						</div>
					{/if}
					{#if settingsStore.showOscilloscopes}
						<div class="border-t border-[var(--color-app-border)]/50">
							<ChannelOscilloscopes
								channelLabels={projectStore.songs.flatMap((_, i) =>
									(
										chipProcessors[i]?.chip.schema.channelLabels ?? [
											'A',
											'B',
											'C'
										]
									).map((l) =>
										projectStore.songs.length > 1 ? `${i + 1}${l}` : l
									)
								)} />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
	{#if projectStore.songs.length > 0 && activeEditorIndex < projectStore.songs.length}
		<StatusBar
			songIndex={activeEditorIndex}
			selectedRow={sharedSelectedRow}
			{selectedFieldKey}
			currentPatternOrderIndex={sharedPatternOrderIndex}
			chip={chipProcessors[activeEditorIndex].chip} />
	{/if}
</div>
