<script lang="ts">
	import type { Component } from 'svelte';
	import type { ChipProcessor } from '../../chips/base/processor';
	import type {
		ChipPlaybackDebugSpec,
		PlaybackDebugMetricIcon,
		PlaybackDebugMetricSpec
	} from '../../chips/base/playback-debug';
	import { playbackToneDebugStore } from '../../stores/playback-tone-debug.svelte';
	import type { ChipPlaybackHzState } from '../../stores/playback-tone-debug.svelte';
	import { projectStore } from '../../stores/project.svelte';
	import IconCarbonActivity from '~icons/carbon/activity';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonMusic from '~icons/carbon/music';

	let { chipProcessors }: { chipProcessors: ChipProcessor[] } = $props();

	type ChannelColumn = {
		label: string;
		channelIndex: number;
	};

	type ChipDebugSection = {
		chipIndex: number;
		chipName: string;
		showChipName: boolean;
		debugSpec: ChipPlaybackDebugSpec;
		columns: ChannelColumn[];
		playbackHz: ChipPlaybackHzState | undefined;
	};

	const metricIcons: Record<PlaybackDebugMetricIcon, Component<{ class?: string }>> = {
		tone: IconCarbonMusic,
		sid: IconCarbonChartWinLoss,
		sync: IconCarbonActivity
	};

	const chipSections = $derived.by((): ChipDebugSection[] => {
		const multiSong = projectStore.songs.length > 1;
		const sections: ChipDebugSection[] = [];

		chipProcessors.forEach((processor, chipIndex) => {
			const debugSpec = processor.chip.playbackDebug;
			if (!debugSpec) return;

			const song = projectStore.songs[chipIndex];
			if (!song) return;

			const labels = song.getEffectiveChannelLabels();
			const playbackHz = playbackToneDebugStore.allChipPlaybackHz[chipIndex];
			const count = Math.max(
				labels.length,
				playbackHz?.toneHz.length ?? 0,
				playbackHz?.sidTimerHz.length ?? 0,
				playbackHz?.syncbuzzerTimerHz.length ?? 0
			);

			const columns: ChannelColumn[] = [];
			for (let channelIndex = 0; channelIndex < count; channelIndex++) {
				const baseLabel = labels[channelIndex] ?? String(channelIndex + 1);
				columns.push({
					label: multiSong ? `${chipIndex + 1}${baseLabel}` : baseLabel,
					channelIndex
				});
			}

			sections.push({
				chipIndex,
				chipName: processor.chip.name,
				showChipName: multiSong,
				debugSpec,
				columns,
				playbackHz
			});
		});

		return sections;
	});

	function hzCellClass(hz: number | null, accentClass: string): string {
		if (hz === null || hz <= 0) {
			return 'text-[var(--color-app-text-muted)]/35';
		}
		return `tabular-nums ${accentClass}`;
	}

	function formatRegisterByte(value: number): string {
		return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
	}

	function readMetricHz(
		metric: PlaybackDebugMetricSpec,
		playbackHz: ChipPlaybackHzState | undefined,
		channelIndex: number
	): number | null {
		return metric.readHz(playbackHz, channelIndex);
	}
</script>

{#if chipSections.length > 0}
	<div class="shrink-0 px-2 pb-1 pt-0.5">
		<div
			class="overflow-hidden rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)]">
			<div class="overflow-x-auto px-1.5 py-1 font-sans text-[11px] leading-tight">
				{#each chipSections as section (section.chipIndex)}
					<div
						class={section.chipIndex > 0
							? 'mt-1 border-t border-[var(--color-app-border)]/60 pt-1'
							: ''}>
						{#if section.showChipName}
							<div
								class="mb-0.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-app-text-muted)]">
								{section.chipName}
							</div>
						{/if}

						{#if section.columns.length > 0}
							<div
								class="grid min-w-max gap-x-0.5 gap-y-0"
								style="grid-template-columns: 6.25rem repeat({section.columns.length}, minmax(3.25rem, 1fr));">
								<div></div>
								{#each section.columns as column (column.label)}
									<div
										class="truncate px-0.5 text-center font-semibold text-[var(--color-pattern-note)]">
										{column.label}
									</div>
								{/each}

								{#each section.debugSpec.metrics as metric (metric.key)}
									{@const MetricIcon = metricIcons[metric.icon]}
									<div
										class="flex items-center gap-0.5 px-0.5 text-[var(--color-app-text-muted)]">
										<MetricIcon class="h-3 w-3 shrink-0 {metric.accentClass}" />
										<span class="whitespace-nowrap">{metric.label}</span>
									</div>
									{#each section.columns as column (metric.key + column.label)}
										{@const hz = readMetricHz(
											metric,
											section.playbackHz,
											column.channelIndex
										)}
										<div class="px-0.5 text-center {hzCellClass(hz, metric.accentClass)}">
											{metric.formatHz(hz)}
										</div>
									{/each}
								{/each}
							</div>
						{/if}

						{#if section.debugSpec.registers}
							{@const registerSpec = section.debugSpec.registers}
							{@const registers = registerSpec.normalizeRegisters(
								section.playbackHz?.registers
							)}
							<div
								class={section.columns.length > 0
									? 'mt-1 border-t border-[var(--color-app-border)]/40 pt-1'
									: ''}>
								<div
									class="grid gap-x-0.5 gap-y-0"
									style="grid-template-columns: repeat({registerSpec.count}, minmax(1.625rem, 1fr));">
									{#each Array.from({ length: registerSpec.count }, (_, regIndex) => regIndex) as regIndex (regIndex)}
										<div
											class="px-0.5 text-center text-[var(--color-app-text-muted)]"
											title={registerSpec.names[regIndex]}>
											{regIndex}
										</div>
									{/each}
									{#each Array.from({ length: registerSpec.count }, (_, regIndex) => regIndex) as regIndex (regIndex + 'v')}
										<div
											class="px-0.5 text-center tabular-nums text-[var(--color-pattern-effect)]"
											title={registerSpec.names[regIndex]}>
											{formatRegisterByte(registers[regIndex] ?? 0)}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
