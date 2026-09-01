<script lang="ts">
	import { getContext } from 'svelte';
	import IconCarbonDocument from '~icons/carbon/document';
	import IconCarbonDocumentImport from '~icons/carbon/document-import';
	import IconCarbonRenew from '~icons/carbon/renew';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonSettingsAdjust from '~icons/carbon/settings-adjust';
	import IconCarbonTime from '~icons/carbon/time';
	import IconCarbonTrashCan from '~icons/carbon/trash-can';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import Button from '../../components/Button/Button.svelte';
	import { LabeledMonoInput } from '../../components/LabeledMonoInput';
	import { EmptyState } from '../../components/EmptyState';
	import AudioSampleRegionEditor from '../../components/Audio/AudioSampleRegionEditor.svelte';
	import type { Instrument } from '../../models/song';
	import type { AudioService } from '../../services/audio/audio-service';
	import type { AyInstrumentFields } from './instrument';
	import {
		buildWaveformPeaksFromUint8MonoWithLut,
		type AyChipVariant
	} from './ay-sample-lut';
	import { resolveAyChipVariant } from './sid-waveform-volume';
	import {
		clampInstrumentSampleRate,
		defaultSampleRegionFields,
		MAX_INSTRUMENT_SAMPLE_RATE,
		MIN_INSTRUMENT_SAMPLE_RATE,
		normalizeSamplePlaybackBounds,
		resolveSampleLoopEnabled
	} from './sample-region';
	import {
		decodeAudioSampleFile,
		formatAudioDuration,
		InstrumentSampleTooLargeError,
		MAX_INSTRUMENT_SAMPLE_BYTES,
		type DecodedAudioSample
	} from '../../utils/audio-sample-decode';

	const containerContext: { audioService: AudioService } = getContext('container');

	const AUDIO_ACCEPT =
		'audio/*,.wav,.wave,.aiff,.aif,.raw,.pcm';

	let {
		instrument,
		isExpanded = false,
		onInstrumentChange
	}: {
		instrument: Instrument & Partial<AyInstrumentFields>;
		isExpanded?: boolean;
		onInstrumentChange: (instrument: Instrument & Partial<AyInstrumentFields>) => void;
	} = $props();

	let fileInputEl: HTMLInputElement | null = $state(null);
	let decodedSample = $state<DecodedAudioSample | null>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let chipVariant = $state<AyChipVariant>('AY');

	let regionStart = $state(0);
	let regionEnd = $state(0);
	let loopStart = $state(0);
	let loopEnabled = $state(true);
	let loadedSampleRate = $state<number | null>(null);

	const previewHeight = $derived(isExpanded ? 168 : 128);
	const instrumentSampleRate = $derived(
		clampInstrumentSampleRate(instrument.sampleRate ?? loadedSampleRate ?? 44_100)
	);
	const isSampleRateTuned = $derived(
		loadedSampleRate != null && instrumentSampleRate !== loadedSampleRate
	);

	const sampleBounds = $derived(normalizeSamplePlaybackBounds(instrument));

	$effect(() => {
		regionStart = sampleBounds?.start ?? 0;
		regionEnd = sampleBounds?.end ?? 0;
		loopStart = sampleBounds?.loopStart ?? 0;
		loopEnabled = resolveSampleLoopEnabled(instrument);
	});

	$effect(() => {
		const chipSettings = containerContext.audioService.chipSettings.forChip('ay');
		return chipSettings.subscribe('chipVariant', (value) => {
			chipVariant = resolveAyChipVariant(value);
		});
	});

	$effect(() => {
		const sampleData = instrument.sampleData;
		if (sampleData && sampleData.length > MAX_INSTRUMENT_SAMPLE_BYTES) {
			decodedSample = null;
			loadError = `Stored 8-bit mono sample exceeds the ${MAX_INSTRUMENT_SAMPLE_BYTES.toLocaleString()} byte (16 KB) limit.`;
			return;
		}
		if (!sampleData?.length) {
			if (decodedSample !== null) {
				decodedSample = null;
			}
			loadedSampleRate = null;
			return;
		}
		if (loadedSampleRate == null && instrument.sampleRate && instrument.sampleRate > 0) {
			loadedSampleRate = Math.round(instrument.sampleRate);
		}
		const data = Uint8Array.from(sampleData);
		const rate = instrumentSampleRate;
		const durationSeconds = rate > 0 ? data.length / rate : 0;
		const nextSample: DecodedAudioSample = {
			fileName: instrument.name || 'Sample',
			data,
			sampleRate: rate,
			durationSeconds,
			channelCount: 1,
			peaks: buildWaveformPeaksFromUint8MonoWithLut(data, chipVariant)
		};
		if (
			decodedSample?.data.length === nextSample.data.length &&
			decodedSample.sampleRate === nextSample.sampleRate &&
			decodedSample.fileName === nextSample.fileName
		) {
			return;
		}
		decodedSample = nextSample;
	});

	const previewPeaks = $derived(
		decodedSample
			? buildWaveformPeaksFromUint8MonoWithLut(decodedSample.data, chipVariant)
			: []
	);

	const playbackModeLabel = $derived.by(() => {
		if (!sampleBounds) return '';
		if (!loopEnabled) {
			return `One-shot ${sampleBounds.start}→${sampleBounds.end}`;
		}
		if (sampleBounds.loopStart === sampleBounds.start) {
			return `Loop ${sampleBounds.start}→${sampleBounds.end}`;
		}
		return `Play ${sampleBounds.start}→${sampleBounds.end}, loop from ${sampleBounds.loopStart}`;
	});

	function commitInstrumentSampleFields(
		start: number,
		end: number,
		loopPoint: number,
		loop: boolean
	): void {
		if (!instrument.sampleData?.length) return;
		const bounds = normalizeSamplePlaybackBounds({
			sampleData: instrument.sampleData,
			sampleStart: start,
			sampleEnd: end,
			sampleLoopStart: loopPoint
		});
		if (!bounds) return;
		onInstrumentChange({
			...instrument,
			sampleStart: bounds.start,
			sampleEnd: bounds.end,
			sampleLoopStart: bounds.loopStart,
			sampleLoopEnabled: loop
		});
	}

	function handleRegionCommit(start: number, end: number, loopPoint: number): void {
		commitInstrumentSampleFields(start, end, loopPoint, loopEnabled);
	}

	function commitSampleRate(rawValue: number): void {
		if (!instrument.sampleData?.length) return;
		const nextRate = clampInstrumentSampleRate(rawValue);
		if (instrument.sampleRate === nextRate) return;
		onInstrumentChange({
			...instrument,
			sampleRate: nextRate
		});
	}

	function handleSampleRateCommit(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		commitSampleRate(Number.parseInt(input.value, 10));
	}

	function handleSampleRateKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		handleSampleRateCommit(event);
		(event.currentTarget as HTMLInputElement).blur();
	}

	function resetSampleRate(): void {
		if (loadedSampleRate == null) return;
		commitSampleRate(loadedSampleRate);
	}

	$effect(() => {
		const loop = loopEnabled;
		if (!instrument.sampleData?.length) return;
		if (resolveSampleLoopEnabled(instrument) === loop) return;
		commitInstrumentSampleFields(regionStart, regionEnd, loopStart, loop);
	});

	function persistSample(sample: DecodedAudioSample | null): void {
		if (!sample) {
			const next = { ...instrument };
			delete next.sampleData;
			delete next.sampleRate;
			delete next.sampleStart;
			delete next.sampleEnd;
			delete next.sampleLoopStart;
			delete next.sampleLength;
			delete next.sampleLoopEnabled;
			delete next.sampleLoop;
			onInstrumentChange(next);
			return;
		}
		loadedSampleRate = Math.round(sample.sampleRate);
		const regionDefaults = defaultSampleRegionFields(sample.data.length);
		onInstrumentChange({
			...instrument,
			sampleData: Array.from(sample.data),
			sampleRate: loadedSampleRate,
			sampleStart: regionDefaults.sampleStart,
			sampleEnd: regionDefaults.sampleEnd,
			sampleLoopStart: regionDefaults.sampleLoopStart,
			sampleLoopEnabled: regionDefaults.sampleLoopEnabled
		});
	}

	function openFilePicker(): void {
		fileInputEl?.click();
	}

	function clearSample(): void {
		decodedSample = null;
		loadedSampleRate = null;
		loadError = null;
		if (fileInputEl) {
			fileInputEl.value = '';
		}
		persistSample(null);
	}

	async function handleFileSelect(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isLoading = true;
		loadError = null;

		try {
			const sample = await decodeAudioSampleFile(file);
			decodedSample = sample;
			persistSample(sample);
		} catch (error) {
			decodedSample = null;
			loadError =
				error instanceof InstrumentSampleTooLargeError
					? error.message
					: 'Could not decode this audio file.';
			persistSample(null);
		} finally {
			isLoading = false;
		}
	}
</script>

<input
	bind:this={fileInputEl}
	type="file"
	accept={AUDIO_ACCEPT}
	class="hidden"
	onchange={handleFileSelect} />

<div class="box-border flex w-full min-w-0 flex-col gap-3 py-1">
	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-app-text-secondary)] transition-colors hover:border-[var(--color-app-primary)]/40 hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-primary)] disabled:pointer-events-none disabled:opacity-60"
			disabled={isLoading}
			onclick={openFilePicker}>
			{#if isLoading}
				<IconCarbonRenew class="h-3.5 w-3.5 shrink-0 animate-spin" />
				Loading…
			{:else}
				<IconCarbonDocumentImport class="h-3.5 w-3.5 shrink-0" />
				Load sample
			{/if}
		</button>
		{#if decodedSample}
			<Button variant="secondary" onclick={clearSample}>
				<IconCarbonTrashCan class="mr-1 inline h-3.5 w-3.5" />
				Clear
			</Button>
		{/if}
	</div>

	{#if loadError}
		<p class="text-xs text-[var(--color-pattern-note-off)]">{loadError}</p>
	{/if}

	{#if decodedSample && sampleBounds}
		<div
			class="flex min-w-0 flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]/80 px-3 py-2">
			<div class="min-w-0">
				<div
					class="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs text-[var(--color-app-text-primary)]">
					<IconCarbonDocument class="h-3.5 w-3.5 shrink-0 text-[var(--color-app-text-tertiary)]" />
					<span class="truncate">{decodedSample.fileName}</span>
				</div>
				<div
					class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-app-text-muted)]">
					<span class="inline-flex items-center gap-1">
						<IconCarbonTime class="h-3 w-3 shrink-0 text-[var(--color-app-text-tertiary)]" />
						{formatAudioDuration(decodedSample.durationSeconds)}
					</span>
					<span class="inline-flex items-center gap-1">
						<IconCarbonWaveform class="h-3 w-3 shrink-0 text-[var(--color-app-text-tertiary)]" />
						{decodedSample.data.length.toLocaleString()} samples
					</span>
				</div>
			</div>
			<div
				class="flex max-w-[min(100%,20rem)] items-center justify-end gap-1 text-right text-[11px] text-[var(--color-app-text-tertiary)]">
				<IconCarbonRepeat class="h-3 w-3 shrink-0" />
				<span>{playbackModeLabel}</span>
			</div>
		</div>

		{#key `${decodedSample.fileName}-${chipVariant}-${decodedSample.data.length}`}
			<AudioSampleRegionEditor
				peaks={previewPeaks}
				sampleData={decodedSample.data}
				{chipVariant}
				height={previewHeight}
				totalSamples={decodedSample.data.length}
				bind:regionStart
				bind:regionEnd
				bind:loopStart
				bind:loopEnabled
				onRegionCommit={handleRegionCommit} />
		{/key}

		<div class="px-0.5">
			<LabeledMonoInput
				icon={IconCarbonSettingsAdjust}
				label="Sample rate"
				width="w-[6.5rem]"
				value={instrumentSampleRate}
				min={MIN_INSTRUMENT_SAMPLE_RATE}
				max={MAX_INSTRUMENT_SAMPLE_RATE}
				onchange={handleSampleRateCommit}
				onkeydown={handleSampleRateKeydown}>
				{#snippet suffix()}
					<span class="text-xs text-[var(--color-app-text-tertiary)]">Hz</span>
					{#if isSampleRateTuned}
						<button
							type="button"
							class="cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--color-app-primary)] hover:underline"
							onclick={resetSampleRate}>
							Reset ({loadedSampleRate?.toLocaleString()} Hz)
						</button>
					{/if}
				{/snippet}
			</LabeledMonoInput>
		</div>
	{:else if !isLoading && !loadError}
		<EmptyState
			icon={IconCarbonWaveform}
			message="Load an audio file to trim and loop"
			hint="8-bit mono PCM WAV keeps native sample rate; rejected if over 16 KB"
			class="min-w-0"
			style="height: {previewHeight + 48}px" />
	{/if}
</div>
