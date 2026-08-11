<script lang="ts">
	import { playbackStore } from '../../stores/playback.svelte';
	import MenuButton from './MenuButton.svelte';
	import type { MenuItem } from './types';
	import IconCarbonPlayFilledAlt from '~icons/carbon/play-filled-alt';
	import IconCarbonPauseFilled from '~icons/carbon/pause-filled';
	import IconCarbonSkipBackFilled from '~icons/carbon/skip-back-filled';
	import IconCarbonPlay from '~icons/carbon/play';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonLayers from '~icons/carbon/layers';
	import IconCarbonArrowDown from '~icons/carbon/arrow-down';
	import IconCarbonVolumeMute from '~icons/carbon/volume-mute';
	import IconCarbonVolumeDown from '~icons/carbon/volume-down';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonAutomatic from '~icons/carbon/automatic';
	import IconCarbonMusic from '~icons/carbon/music';
	import { settingsStore } from '../../stores/settings.svelte';
	import { editorStateStore } from '../../stores/editor-state.svelte';
	import Checkbox from '../Checkbox/Checkbox.svelte';
	import { NumberStepper } from '../NumberStepper';
	import { CommitNumericInput } from '../CommitNumericInput';
	import { IconButton } from '../IconButton';
	import { autoEnvStore, AUTO_ENV_PRESETS } from '../../stores/auto-env.svelte';
	import { projectStore } from '../../stores/project.svelte';

	let activeMenu = $state('');
	let {
		menuItems = [],
		onAction
	}: {
		menuItems: MenuItem[];
		onAction?: (data: { action: string }) => void;
	} = $props();

	const hasAYSong = $derived(projectStore.songs.some((song) => song.chipType === 'ay'));
	function handleVolumeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		settingsStore.set('volume', Number(target.value));
	}

	function handleMenuOpen(data: { label: string }) {
		activeMenu = data.label;
	}

	function handleMenuClose(data: { label?: string; all?: boolean }) {
		if (data.all) {
			activeMenu = '';
		} else if (data.label && activeMenu === data.label) {
			activeMenu = '';
		}
	}

	function handleAction(data: { action: string }) {
		onAction?.(data);
	}

	function commitOctave() {
		const raw = editorStateStore.octave;
		const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
		if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 8) {
			editorStateStore.setOctave(parsed);
		} else {
			editorStateStore.setOctave(4);
		}
	}

	function commitStep() {
		const raw = editorStateStore.step;
		const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
		if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 255) {
			editorStateStore.setStep(parsed);
		} else {
			editorStateStore.setStep(0);
		}
	}

	function incrementOctave() {
		if (editorStateStore.octave < 8) {
			editorStateStore.setOctave(editorStateStore.octave + 1);
		}
	}

	function decrementOctave() {
		if (editorStateStore.octave > 1) {
			editorStateStore.setOctave(editorStateStore.octave - 1);
		}
	}

	function incrementStep() {
		editorStateStore.setStep(editorStateStore.step + 1);
	}

	function decrementStep() {
		if (editorStateStore.step > 0) {
			editorStateStore.setStep(editorStateStore.step - 1);
		}
	}

	let showAutoEnvPresets = $state(false);

	$effect(() => {
		if (showAutoEnvPresets) {
			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.auto-env-presets-container')) {
					showAutoEnvPresets = false;
				}
			};
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div
	class="flex w-full items-center border-b border-[var(--color-app-border)] bg-[var(--color-app-surface-hover)] px-2 text-center">
	{#each menuItems as item}
		<MenuButton
			label={item.label}
			items={item.items || []}
			action={item.action}
			{activeMenu}
			onAction={handleAction}
			onMenuOpen={handleMenuOpen}
			onMenuClose={handleMenuClose} />
	{/each}

	<div class="ml-auto flex items-center gap-1.5 min-[1880px]:gap-3">
		<NumberStepper
			id="octave-input"
			label="Octave"
			icon={IconCarbonLayers}
			title="Octave"
			bind:value={editorStateStore.octave}
			min={1}
			max={8}
			onCommit={commitOctave}
			onIncrement={incrementOctave}
			onDecrement={decrementOctave} />
		<NumberStepper
			id="step-input"
			label="Step"
			icon={IconCarbonArrowDown}
			title="Step"
			bind:value={editorStateStore.step}
			min={0}
			max={255}
			onCommit={commitStep}
			onIncrement={incrementStep}
			onDecrement={decrementStep}
			onKeyDown={(e: KeyboardEvent) => {
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					incrementStep();
				} else if (e.key === 'ArrowDown') {
					e.preventDefault();
					decrementStep();
				}
			}} />
		{#if hasAYSong}
			<div
				class="auto-env-presets-container relative flex items-center gap-1.5"
				title="Auto Envelope">
				<label class="flex cursor-pointer items-center gap-1.5">
					<IconCarbonAutomatic
						class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)]" />
					<Checkbox
						showStatus={false}
						checked={autoEnvStore.enabled}
						onchange={() => {
							autoEnvStore.toggle();
						}}
						title="Auto Envelope" />
					<span
						class="hidden text-xs font-medium text-[var(--color-app-text-tertiary)] min-[1880px]:inline"
						>Auto Env</span>
				</label>
				{#if autoEnvStore.enabled}
					<div
						class="flex items-center gap-0.5 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)]">
						<CommitNumericInput
							bind:value={autoEnvStore.numerator}
							live={false}
							min={1}
							max={999}
							class="h-6 w-10 cursor-pointer border-0 bg-transparent text-center font-mono text-xs focus:ring-0"
							title="Auto Env Numerator"
							oncommit={(v) => autoEnvStore.setNumerator(v)} />
						<span class="text-xs text-[var(--color-app-text-muted)]">:</span>
						<CommitNumericInput
							bind:value={autoEnvStore.denominator}
							live={false}
							min={1}
							max={999}
							class="h-6 w-10 cursor-pointer border-0 bg-transparent text-center font-mono text-xs focus:ring-0"
							title="Auto Env Denominator"
							oncommit={(v) => autoEnvStore.setDenominator(v)} />
						<button
							type="button"
							class="cursor-pointer border-l border-[var(--color-app-border)] px-1.5 py-1 text-xs text-[var(--color-app-text-muted)] transition-colors hover:bg-[var(--color-app-surface-hover)]"
							onclick={() => (showAutoEnvPresets = !showAutoEnvPresets)}
							title="Show presets">
							▾
						</button>
					</div>
					{#if showAutoEnvPresets}
						<div
							class="absolute top-full left-0 z-50 mt-1 flex flex-wrap gap-1 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] p-2 shadow-lg"
							style="width: 200px;">
							{#each AUTO_ENV_PRESETS as preset}
								<button
									type="button"
									class="cursor-pointer rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 font-mono text-xs text-[var(--color-app-text-primary)] transition-colors hover:bg-[var(--color-app-surface-hover)]"
									onclick={() => {
										autoEnvStore.setPreset(preset);
										showAutoEnvPresets = false;
									}}
									title="Set ratio to {preset.label}">
									{preset.label}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
			<div class="flex items-center gap-1.5" title="Envelope as Note">
				<label class="flex cursor-pointer items-center gap-1.5">
					<IconCarbonMusic
						class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)]" />
					<Checkbox
						showStatus={false}
						bind:checked={editorStateStore.envelopeAsNote}
						onchange={() => {
							editorStateStore.setEnvelopeAsNote(!editorStateStore.envelopeAsNote);
						}}
						title="Envelope as Note" />
					<span
						class="hidden text-xs font-medium text-[var(--color-app-text-tertiary)] min-[1880px]:inline"
						>Env as Note</span>
				</label>
			</div>
		{/if}
		<div
			class="flex items-center gap-1 border-l border-[var(--color-app-border)]"
			title="Volume: {settingsStore.volume}%">
			{#if settingsStore.volume === 0}
				<IconCarbonVolumeMute
					class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)]" />
			{:else if settingsStore.volume < 50}
				<IconCarbonVolumeDown
					class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)]" />
			{:else}
				<IconCarbonVolumeUp
					class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-muted)]" />
			{/if}
			<input
				type="range"
				min={0}
				max={100}
				step={1}
				value={settingsStore.volume}
				oninput={handleVolumeChange}
				class="w-20 cursor-pointer min-[1880px]:w-32"
				title="Volume: {settingsStore.volume}%" />
			<span
				class="mr-1 hidden w-4 text-right font-mono text-xs text-[var(--color-app-text-tertiary)] min-[1880px]:inline"
				>{settingsStore.volume}</span>
		</div>
	</div>

	<div class="absolute top-3.5 left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1">
		<IconButton
			icon={IconCarbonRepeat}
			title="Play pattern (loop)"
			onclick={() => onAction?.({ action: 'playPattern' })} />
		<IconButton
			icon={IconCarbonSkipBackFilled}
			title="Play from beginning"
			onclick={() => onAction?.({ action: 'playFromBeginning' })} />
		<IconButton
			title={playbackStore.isPlaying ? 'Pause' : 'Play/Resume'}
			onclick={() => onAction?.({ action: 'togglePlayback' })}>
			{#snippet children()}
				{#if !playbackStore.isPlaying}
					<IconCarbonPlayFilledAlt class="h-4 w-4" />
				{:else}
					<IconCarbonPauseFilled class="h-4 w-4" />
				{/if}
			{/snippet}
		</IconButton>
		<IconButton
			icon={IconCarbonPlay}
			title="Play from cursor position"
			onclick={() => onAction?.({ action: 'playFromCursor' })} />
	</div>
</div>
