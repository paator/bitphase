<script lang="ts">
	import Button from '../Button/Button.svelte';
	import FormField from '../FormField/FormField.svelte';
	import Select from '../AppLayout/Select.svelte';
	import RangeInput from '../RangeInput/RangeInput.svelte';
	import Input from '../Input/Input.svelte';
	import {
		defaultWavExportSettings,
		sampleRateOptions,
		bitDepthOptions,
		channelModeOptions,
		type WavExportSettings
	} from '../../services/file/wav-export-settings';
	import type { Project } from '../../models/project';

	let {
		project,
		resolve,
		dismiss
	} = $props<{
		project: Project;
		resolve?: (value?: WavExportSettings) => void;
		dismiss?: (error?: any) => void;
	}>();

	let settings = $state<WavExportSettings>({
		...defaultWavExportSettings,
		title: project.name || '',
		artist: project.author || ''
	});

	let repeatCount = $state(Math.max(0, settings.loops - 1));

	function handleExport() {
		resolve?.({ ...settings, loops: repeatCount + 1 });
	}

	function handleCancel() {
		resolve?.(undefined);
	}
</script>

<div class="flex max-h-[90vh] w-[500px] flex-col overflow-hidden">
	<div
		class="flex shrink-0 items-center gap-2 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-4 py-3">
		<h2 class="text-sm font-bold text-[var(--color-app-text-primary)]">WAV Export Settings</h2>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-4">
		<FormField id="sample-rate" label="Sample Rate">
			<Select bind:value={settings.sampleRate} options={sampleRateOptions} />
		</FormField>

		<FormField id="bit-depth" label="Bit Depth">
			<Select bind:value={settings.bitDepth} options={bitDepthOptions} />
		</FormField>

		<FormField
			id="loops"
			label="Loop Repeats"
			description="Additional repeats after first play (0 = no repeat)">
			<RangeInput bind:value={repeatCount} min={0} max={9} step={1} />
		</FormField>

		<FormField
			id="channel-mode"
			label="Channels"
			description="Mixed: one stereo WAV. Separate: one WAV file per chip channel (e.g. AY A/B/C). Supports multiple chips (1xAY, 2xAY, etc.).">
			<select
				id="channel-mode"
				bind:value={settings.channelMode}
				class="w-full cursor-pointer rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1.5 text-xs text-[var(--color-app-text-primary)] focus:border-[var(--color-app-primary)] focus:outline-none"
			>
				{#each channelModeOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</FormField>

		<div class="mb-4 border-t border-[var(--color-app-border)] pt-4">
			<h3 class="mb-3 text-xs font-semibold text-[var(--color-app-text-secondary)]">
				Metadata (Optional)
			</h3>

			<FormField id="title" label="Title">
				<Input
					id="title"
					type="text"
					bind:value={settings.title}
					placeholder="Song title"
					class="w-full text-xs" />
			</FormField>

			<FormField id="artist" label="Artist">
				<Input
					id="artist"
					type="text"
					bind:value={settings.artist}
					placeholder="Artist name"
					class="w-full text-xs" />
			</FormField>

			<FormField id="album" label="Album">
				<Input
					id="album"
					type="text"
					bind:value={settings.album}
					placeholder="Album name"
					class="w-full text-xs" />
			</FormField>

			<FormField id="year" label="Year">
				<Input
					id="year"
					type="text"
					bind:value={settings.year}
					placeholder="YYYY"
					maxlength={4}
					class="w-full text-xs" />
			</FormField>

			<FormField id="comment" label="Comment">
				<textarea
					id="comment"
					bind:value={settings.comment}
					placeholder="Additional comments"
					rows="3"
					class="w-full rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 text-xs text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none resize-none"></textarea>
			</FormField>
		</div>
	</div>

	<div
		class="flex shrink-0 justify-end gap-2 border-t border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-4 py-3">
		<Button variant="secondary" onclick={handleCancel}>Cancel</Button>
		<Button variant="primary" onclick={handleExport}>Export</Button>
	</div>
</div>
