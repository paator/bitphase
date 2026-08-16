<script lang="ts">
	import IconCarbonDownload from '~icons/carbon/download';
	import { onMount, onDestroy } from 'svelte';
	import { ModalPanel } from '../ModalPanel';
	import { exportToWAV } from '../../services/file/wav/wav-export';
	import { exportToPSG } from '../../services/file/ay/psg-export';
	import { exportToTaym } from '../../services/file/taym/taym-export';
	import { exportToSNDH } from '../../services/file/ay/sndh-export';
	import { exportToVGM } from '../../services/file/vgm/vgm-export';
	import type { Project } from '../../models/project';
	import type { WavExportSettings } from '../../services/file/wav/wav-export-settings';

	let {
		project,
		exportType = 'wav',
		wavSettings,
		resolve,
		dismiss
	} = $props<{
		project: Project;
		exportType?: 'wav' | 'psg' | 'sndh' | 'taym' | 'vgm';
		wavSettings?: WavExportSettings;
		resolve?: (value?: any) => void;
		dismiss?: (error?: any) => void;
	}>();

	let progress = $state(0);
	let message = $state('Starting export...');
	const abortController = $state(new AbortController());

	const progressPercent = $derived(Math.min(100, Math.max(0, progress)));
	const exportLabel = $derived(exportType.toUpperCase());

	onDestroy(() => {
		abortController.abort();
	});

	onMount(async () => {
		const startTime = Date.now();

		try {
			if (exportType === 'psg') {
				await exportToPSG(
					project,
					0,
					(progressValue, messageValue) => {
						progress = progressValue;
						message = messageValue;
					},
					abortController.signal
				);
			} else if (exportType === 'taym') {
				await exportToTaym(
					project,
					0,
					(progressValue, messageValue) => {
						progress = progressValue;
						message = messageValue;
					},
					abortController.signal
				);
			} else if (exportType === 'sndh') {
				await exportToSNDH(
					project,
					0,
					(progressValue, messageValue) => {
						progress = progressValue;
						message = messageValue;
					},
					abortController.signal
				);
			} else if (exportType === 'vgm') {
				await exportToVGM(
					project,
					0,
					(progressValue, messageValue) => {
						progress = progressValue;
						message = messageValue;
					},
					abortController.signal
				);
			} else {
				await exportToWAV(
					project,
					wavSettings,
					(progressValue, messageValue) => {
						progress = progressValue;
						message = messageValue;
					},
					abortController.signal
				);
			}

			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 1000 - elapsed);
			await new Promise((resolve) => setTimeout(resolve, remaining));
			message = 'Export completed!';
			await new Promise((resolve) => setTimeout(resolve, 500));
			resolve?.();
		} catch (error) {
			if (error instanceof Error && error.message === 'Export cancelled') {
				message = 'Export cancelled';
			} else {
				message = `Error: ${error instanceof Error ? error.message : 'Export failed'}`;
			}
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 2000 - elapsed);
			await new Promise((resolve) => setTimeout(resolve, remaining));
			dismiss?.(error);
		}
	});
</script>

<ModalPanel
	title="Exporting {exportLabel}"
	width="w-auto"
	maxHeightClass=""
	compact
	bodyClass="p-3">
	{#snippet headerActions()}
		<IconCarbonDownload class="h-3 w-3 text-[var(--color-app-primary)]" />
	{/snippet}

	{#snippet children()}
		{#if message}
			<p class="mb-3 text-xs text-[var(--color-app-text-muted)]">{message}</p>
		{/if}

		<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-app-surface-secondary)]">
			<div
				class="h-full bg-[var(--color-app-primary)] transition-all duration-300 ease-out"
				style="width: {progressPercent}%">
				<div
					class="absolute inset-0 bg-[var(--color-app-primary)] opacity-30"
					style="width: 100%; animation: shimmer 1.5s ease-in-out infinite;">
				</div>
			</div>
		</div>
	{/snippet}
</ModalPanel>

<style>
	@keyframes shimmer {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.6;
		}
	}
</style>
