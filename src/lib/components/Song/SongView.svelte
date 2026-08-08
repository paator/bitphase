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
	import { getContext, setContext, tick } from 'svelte';
	import Input from '../Input/Input.svelte';
	import { playbackStore } from '../../stores/playback.svelte';
	import StatusBar from './StatusBar.svelte';
	import PlaybackToneDebug from './PlaybackToneDebug.svelte';
	import ChannelOscilloscopes from './ChannelOscilloscopes.svelte';
	import { PatternService } from '../../services/pattern/pattern-service';
	import { settingsStore } from '../../stores/settings.svelte';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import { channelMuteStore } from '../../stores/channel-mute.svelte';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { undoRedoStore } from '../../stores/undo-redo.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import { isEditableElement } from '../../utils/shortcut-input-exclusion';
	import { ACTION_REDO, ACTION_TOGGLE_PLAYBACK, ACTION_UNDO } from '../../config/keybindings';
	import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
	import { EmptyState } from '../EmptyState';
	import { newSongOptions } from '../../config/app-menu';
	import IconCarbonChevronRight from '~icons/carbon/chevron-right';
	import EmptySongPatternBackdrop from './EmptySongPatternBackdrop.svelte';

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

	function clampPatternOrderIndex(index: number, patternOrderLength: number): number {
		if (patternOrderLength <= 0) return 0;
		return Math.min(Math.max(index, 0), patternOrderLength - 1);
	}

	$effect(() => {
		const clampedIndex = clampPatternOrderIndex(
			sharedPatternOrderIndex,
			projectStore.patternOrder.length
		);
		if (sharedPatternOrderIndex !== clampedIndex) {
			sharedPatternOrderIndex = clampedIndex;
		}
	});

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

	export function resetEditorState(): void {
		activeEditorIndex = 0;
		sharedPatternOrderIndex = 0;
		sharedSelectedRow = 0;
		selectedColumn = 0;
		selectedFieldKey = null;
		tick().then(() => {
			const firstEditor = patternEditors[0];
			patternEditor = firstEditor ?? null;
			firstEditor?.resetToBeginning?.();
			firstEditor?.requestRedraw?.();
		});
	}

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

	const activeChipProcessor = $derived(chipProcessors[activeEditorIndex]);

	function toggleOscilloscopeChannelMute(flatIndex: number): void {
		let remaining = flatIndex;
		for (let chipIndex = 0; chipIndex < chipProcessors.length; chipIndex++) {
			const channelCount =
				chipProcessors[chipIndex]?.chip.schema.channelLabels?.length ?? 3;
			if (remaining < channelCount) {
				channelMuteStore.toggleChannel(chipIndex, remaining);
				const isMuted = channelMuteStore.isChannelMuted(chipIndex, remaining);
				chipProcessors[chipIndex]?.updateParameter(`channelMute_${remaining}`, isMuted);
				patternEditors.forEach((editor) => editor?.requestRedraw?.());
				return;
			}
			remaining -= channelCount;
		}
	}
	const previewInstrumentId = $derived.by(() => {
		const chipType = activeChipProcessor?.chip.type;
		if (!chipType) return '';
		const chipInstruments = filterInstrumentsForChip(projectStore.instruments, chipType);
		const selectedId = editorStateStore.getCurrentInstrument(chipType);
		if (selectedId && chipInstruments.some((instrument) => instrument.id === selectedId)) {
			return selectedId;
		}
		return chipInstruments[0]?.id ?? '';
	});

	const services: { audioService: AudioService } = getContext('container');

	let previewSpaceHandler = $state<(() => void) | null>(null);
	let rightPanelEl: HTMLDivElement | null = $state(null);
	setContext('registerPreviewSpaceHandler', (fn: (() => void) | null) => {
		previewSpaceHandler = fn;
	});

	setContext('requestPatternRedraw', () => {
		patternEditors.forEach((editor) => editor?.requestRedraw?.());
	});

	const undoRedoActionIds = new Set([ACTION_UNDO, ACTION_REDO]);
	const previewPlaybackActionIds = new Set([ACTION_TOGGLE_PLAYBACK]);

	function getScopedShortcutAction(
		event: KeyboardEvent,
		container: HTMLElement,
		actionIds: ReadonlySet<string>
	): string | null {
		const shortcut = ShortcutString.fromEvent(event);
		const action = keybindingsStore.getActionForShortcut(shortcut);
		if (!action || !actionIds.has(action)) return null;
		if (!container.contains(document.activeElement)) return null;
		if (isEditableElement(document.activeElement)) return null;
		return action;
	}

	function addScopedShortcutListener(
		container: HTMLElement,
		actionIds: ReadonlySet<string>,
		onAction: (event: KeyboardEvent, action: string, container: HTMLElement) => void
	): () => void {
		function onKeyDownCapture(event: KeyboardEvent) {
			const action = getScopedShortcutAction(event, container, actionIds);
			if (!action) return;
			onAction(event, action, container);
		}
		container.addEventListener('keydown', onKeyDownCapture, { capture: true });
		return () => container.removeEventListener('keydown', onKeyDownCapture, { capture: true });
	}

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
		const container = songViewContainer;
		if (!container) return;
		return addScopedShortcutListener(container, undoRedoActionIds, (event, action) => {
			if (playbackStore.isPlaying) return;

			event.preventDefault();
			event.stopPropagation();
			if (action === ACTION_UNDO) {
				undoRedoStore.undo();
			} else {
				undoRedoStore.redo();
			}
		});
	});

	$effect(() => {
		const el = rightPanelEl;
		const handler = previewSpaceHandler;
		if (!el) return;
		return addScopedShortcutListener(
			el,
			previewPlaybackActionIds,
			(event, _action, container) => {
				if (event.repeat) return;
				if (handler) {
					event.preventDefault();
					event.stopPropagation();
					const active = document.activeElement as HTMLElement | null;
					if (active && active !== container) {
						active.blur?.();
						container.focus();
					}
					handler();
				}
			}
		);
	});

	const SPEED_EFFECT_TYPE = 'S'.charCodeAt(0);

	function handleMakeUnique(index: number): void {
		const beforePatterns = projectStore.patterns.map((songPatterns) => [...songPatterns]);
		const beforePatternOrder = [...projectStore.patternOrder];
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
		projectStore.recordHistory(
			{
				type: 'patternOrder.makeUnique',
				label: `Make pattern ${beforePatternOrder[index]} unique`,
				affectedDomains: ['patterns', 'patternOrder']
			},
			[
				projectStore.createSetDiff(['patterns'], beforePatterns, projectStore.patterns),
				projectStore.createSetDiff(
					['patternOrder'],
					beforePatternOrder,
					projectStore.patternOrder
				)
			]
		);
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

			const withVirtual = chipProcessor as ChipProcessor & Partial<VirtualChannelSupport>;
			if (withVirtual.sendVirtualChannelConfig) {
				const hwLabels = chipProcessor.chip?.schema?.channelLabels ?? ['A', 'B', 'C'];
				withVirtual.sendVirtualChannelConfig(song.virtualChannelMap ?? {}, hwLabels.length);
			}

			chipProcessor.sendInitTables(projectStore.tables);

			const withTuningTables = chipProcessor as ChipProcessor & Partial<TuningTableSupport>;
			const withInstruments = chipProcessor as ChipProcessor & Partial<InstrumentSupport>;
			if ('sendInitTuningTable' in chipProcessor && withTuningTables.sendInitTuningTable) {
				withTuningTables.sendInitTuningTable(song.tuningTable);
			}
			if ('sendInitInstruments' in chipProcessor && withInstruments.sendInitInstruments) {
				withInstruments.sendInitInstruments(
					filterInstrumentsForChip(projectStore.instruments, chipProcessor.chip.type)
				);
			}

			const currentPattern = songPatterns.find((p) => p.id === patternId);
			if (!currentPattern) return;

			chipProcessor.sendInitPattern(currentPattern, patternOrderIndexForInit);
		});

		if (!playPattern) {
			services.audioService.updateOrder(projectStore.patternOrder, projectStore.loopPointId);
		}
	}

	$effect(() => {
		projectStore.patternOrder;
		projectStore.loopPointId;
		if (services.audioService.getPlayPatternId() !== null) return;
		services.audioService.updateOrder([...projectStore.patternOrder], projectStore.loopPointId);
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

	const rightPanelTabs = [
		{ id: 'instruments', label: 'Instruments', icon: IconCarbonWaveform },
		{ id: 'tables', label: 'Tables', icon: IconCarbonDataTable },
		{ id: 'details', label: 'Details', icon: IconCarbonInformationSquare }
	];

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
		const beforePatterns = projectStore.patterns.map((songPatterns) => [...songPatterns]);
		let changed = false;
		for (let j = 0; j < projectStore.patterns.length; j++) {
			const songPatterns = projectStore.patterns[j];
			const pattern = songPatterns.find((p) => p.id === patternId);
			if (!pattern || pattern.length === length) continue;
			const schema = chipProcessors[j]?.chip.schema;
			if (!schema) continue;
			const resized = PatternService.resizePattern(pattern, length, schema);
			changed = true;
			projectStore.updatePatterns(
				j,
				PatternService.updatePatternInArray(songPatterns, resized)
			);
		}
		if (changed) {
			projectStore.recordHistory(
				{
					type: 'pattern.resize',
					label: `Resize pattern ${patternId}`,
					affectedDomains: ['patterns']
				},
				[projectStore.createSetDiff(['patterns'], beforePatterns, projectStore.patterns)]
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
					{#if projectStore.songs.length === 0}
						<div class="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
							<EmptySongPatternBackdrop />
							<div
								class="pointer-events-none absolute inset-0 bg-[var(--color-app-surface-secondary)]/50">
							</div>
							<div class="relative z-10 flex items-center justify-center p-8 pointer-events-auto">
								<EmptyState
									icon={IconCarbonChip}
									title="No songs yet"
									message="Add a song to start tracking."
									class="w-full max-w-sm gap-3 border-[var(--color-app-border)] bg-[var(--color-app-surface)]/90 px-8 py-10 shadow-lg backdrop-blur-sm">
									<div class="flex flex-col gap-2">
										{#each newSongOptions as option (option.action)}
											<button
												type="button"
												class="group flex w-full cursor-pointer items-center gap-3 rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2.5 text-left text-[var(--color-app-text-secondary)] transition-colors hover:border-[var(--color-app-border-hover)] hover:bg-[var(--color-app-surface-hover)]"
												onclick={() => onaction?.({ action: option.action })}>
												<span
													class="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-app-surface-secondary)]">
													<IconCarbonChip
														class="h-3.5 w-3.5 text-[var(--color-app-text-muted)]" />
												</span>
												<span class="min-w-0 flex-1">
													<span
														class="block text-xs font-medium text-[var(--color-app-text-primary)]">
														{option.label}
														{#if option.workInProgress}
															<span
																class="ml-1 font-normal text-[var(--color-app-text-tertiary)]">
																(WIP)
															</span>
														{/if}
													</span>
													<span
														class="mt-0.5 block text-[10px] text-[var(--color-app-text-tertiary)]">
														{option.examples}
													</span>
												</span>
												<IconCarbonChevronRight
													class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)] opacity-60 transition-transform group-hover:translate-x-0.5" />
											</button>
										{/each}
									</div>
								</EmptyState>
							</div>
						</div>
					{:else}
						{#each projectStore.songs as song, i (song)}
							{@const chipProcessor = chipProcessors[i]}
							{#if chipProcessor}
								<Card
									title={`${chipProcessor.chip.name} - (${i + 1})`}
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
										</div>
									{/snippet}
									<div class="flex flex-1 flex-col overflow-hidden">
										{#key `${i}-${chipProcessor.chip.type}`}
											<PatternEditor
												bind:this={patternEditors[i]}
												songIndex={i}
												bind:currentPatternOrderIndex={
													sharedPatternOrderIndex
												}
												bind:selectedRow={sharedSelectedRow}
												isActive={activeEditorIndex === i}
												isPlaybackMaster={i === 0}
												onfocus={() => {
													activeEditorIndex = i;
													patternEditor = patternEditors[i];
												}}
												canFocusOnHover={() =>
													!patternEditors.some(
														(e) =>
															e?.getCanvas?.() ===
															document.activeElement
													)}
												{onaction}
												initAllChips={initAllChipsForPlayback}
												{initAllChipsForPlayPattern}
												{getSpeedForChip}
												{getSpeedForPlayPattern}
												{tuningTableVersion}
												chip={chipProcessor.chip}
												{chipProcessor} />
										{/key}
									</div>
								</Card>
							{/if}
						{/each}
					{/if}
				</div>
				{#if settingsStore.debugMode}
					<PlaybackToneDebug {chipProcessors} />
				{/if}
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
			class="relative z-10 flex h-full shrink-0 flex-col border-l border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] transition-all duration-300 outline-none focus:outline-none {isRightPanelExpanded
				? 'w-[1200px]'
				: 'w-[32rem]'}"
			onmousedown={(e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (
					!target.closest('input, textarea, button, select, [contenteditable="true"], a')
				) {
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
								{chipProcessors}
								{activeEditorIndex}
								syncChipType={activeChipProcessor?.chip.type} />
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
					{#if settingsStore.showInstrumentPreview && activeChipProcessor?.chip.previewRow}
						{@const PreviewRow = activeChipProcessor.chip.previewRow}
						<div class="flex flex-col gap-2 bg-[var(--color-app-surface)] px-2 py-3">
							<PreviewRow
								chip={activeChipProcessor.chip}
								instrumentId={previewInstrumentId}
								tuningTable={projectStore.songs[activeEditorIndex]?.tuningTable ??
									[]} />
						</div>
					{/if}
					{#if settingsStore.showOscilloscopes}
						{@const muteTick = channelMuteStore.muteState}
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
								)}
								channelMuted={projectStore.songs.flatMap((_, i) => {
									muteTick;
									return (
										chipProcessors[i]?.chip.schema.channelLabels ?? [
											'A',
											'B',
											'C'
										]
									).map((__, ch) => channelMuteStore.isChannelMuted(i, ch));
								})}
								onChannelClick={toggleOscilloscopeChannelMute} />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
	{#if projectStore.songs.length > 0 && activeEditorIndex < projectStore.songs.length && activeChipProcessor}
		<StatusBar
			songIndex={activeEditorIndex}
			selectedRow={sharedSelectedRow}
			{selectedFieldKey}
			currentPatternOrderIndex={sharedPatternOrderIndex}
			chip={activeChipProcessor.chip} />
	{/if}
</div>
