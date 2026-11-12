<script lang="ts">
	import type { Project } from '../../models/project';
	import { loadPT3File } from '../../services/file/modules/vt-converter';
	import { themeService } from '../../services/theme/theme-service';
	import { exportPatternVideo } from '../../services/visualize/export-pattern-video';
	import { createPatternRollFrame } from '../../services/visualize/pattern-frame';
	import { settingsStore } from '../../stores/settings.svelte';
	import { themeStore } from '../../stores/theme.svelte';
	import { downloadFile, sanitizeFilename } from '../../utils/file-download';

	settingsStore.init();
	themeStore.init(themeService);
	document.title = 'Pattern video';

	let project = $state.raw<Project | null>(null);
	let summary = $state('');
	let status = $state('Choose a PT3 module.');
	let error = $state('');
	let progress = $state(0);
	let busy = $state(false);
	let fileName = $state('');
	let preview = $state<HTMLCanvasElement | null>(null);
	let cancelExport: AbortController | null = null;

	function previewCanvas(element: HTMLCanvasElement) {
		preview = element;
		return () => {
			preview = null;
		};
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const selected = input.files?.[0];
		if (!selected) return;
		void loadModule(selected);
	}

	async function loadModule(file: File) {
		error = '';
		status = 'Reading module…';
		try {
			const loaded = await loadPT3File(file);
			project = loaded;
			fileName = file.name;
			summary = describeProject(loaded, file.name);
			status = 'Ready to export.';
			await drawPreview();
		} catch (caught) {
			project = null;
			summary = '';
			error = caught instanceof Error ? caught.message : 'Could not read that PT3 file.';
			status = 'Choose a PT3 module.';
		}
	}

	async function drawPreview() {
		if (!project || !preview) return;
		preview.width = 1280;
		preview.height = 720;
		const frame = await createPatternRollFrame({
			canvas: preview,
			project,
			songIndex: leaderSongIndex(project),
			fontFamily: settingsStore.patternEditorFontFamily || 'JetBrains Mono',
			selectionStyle: settingsStore.selectionStyle,
			emptyNoteAlignment: settingsStore.emptyNoteAlignment
		});
		frame.draw({ orderIndex: 0, row: 0, fraction: 0 });
	}

	async function startExport() {
		if (!project || busy) return;
		error = '';
		const destination = await chooseDestination(mp4Name(project, fileName));
		if (destination === 'cancelled') return;
		busy = true;
		progress = 0;
		const controller = new AbortController();
		cancelExport = controller;
		try {
			const blob = await exportPatternVideo({
				project,
				fontFamily: settingsStore.patternEditorFontFamily || 'JetBrains Mono',
				selectionStyle: settingsStore.selectionStyle,
				emptyNoteAlignment: settingsStore.emptyNoteAlignment,
				writable: destination ?? undefined,
				signal: controller.signal,
				onProgress: (value, message) => {
					progress = value;
					status = message;
				},
				onFrame: (canvas) => {
					const context = preview?.getContext('2d', { alpha: false });
					if (!context || !preview) return;
					context.drawImage(canvas, 0, 0, preview.width, preview.height);
				}
			});
			if (blob) downloadFile(blob, mp4Name(project, fileName));
			if (!controller.signal.aborted) {
				status = 'Saved.';
				progress = 100;
			}
		} catch (caught) {
			if (
				controller.signal.aborted ||
				(caught instanceof Error && caught.message === 'Export cancelled')
			) {
				status = 'Cancelled.';
				error = '';
			} else {
				error = caught instanceof Error ? caught.message : 'Export failed.';
			}
		} finally {
			busy = false;
			cancelExport = null;
		}
	}

	function cancel() {
		cancelExport?.abort();
	}

	function leaderSongIndex(loaded: Project): number {
		const index = loaded.songs.findIndex((song) => song.chipType && song.patterns.length > 0);
		return index >= 0 ? index : 0;
	}

	function describeProject(loaded: Project, sourceName: string): string {
		const title = loaded.name?.trim() || sourceName;
		const author = loaded.author?.trim();
		const songs = loaded.songs.length;
		const orders = loaded.patternOrder?.length ?? 0;
		const heading = author ? `${title} · ${author}` : title;
		return `${heading} · ${songs} song${songs === 1 ? '' : 's'} · ${orders} orders`;
	}

	function mp4Name(loaded: Project, sourceName: string): string {
		const base = loaded.name?.trim() || sourceName.replace(/\.pt3$/i, '') || 'pattern';
		const safe = sanitizeFilename(base).replace(/^_+|_+$/g, '');
		return `${safe || 'pattern'}.mp4`;
	}

	async function chooseDestination(
		name: string
	): Promise<FileSystemWritableFileStream | null | 'cancelled'> {
		const picker = (
			window as Window & {
				showSaveFilePicker?: (options: {
					suggestedName?: string;
					types?: { description?: string; accept: Record<string, string[]> }[];
				}) => Promise<FileSystemFileHandle>;
			}
		).showSaveFilePicker;
		if (!picker) return null;
		try {
			const handle = await picker({
				suggestedName: name,
				types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }]
			});
			return await handle.createWritable();
		} catch (caught) {
			if (caught instanceof DOMException && caught.name === 'AbortError') return 'cancelled';
			return null;
		}
	}
</script>

<main
	class="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-8 text-[var(--color-app-text-primary)]">
	<h1 class="text-lg font-medium">Pattern video</h1>

	<label class="flex flex-col gap-2 text-sm text-[var(--color-app-text-secondary)]">
		PT3 module
		<input
			type="file"
			accept=".pt3"
			disabled={busy}
			onchange={onPick}
			class="text-[var(--color-app-text-primary)] file:mr-3 file:rounded-sm file:border file:border-[var(--color-app-border)] file:bg-[var(--color-app-surface)] file:px-3 file:py-1.5 file:text-[var(--color-app-text-primary)]" />
	</label>

	{#if summary}
		<p class="text-sm">{summary}</p>
	{/if}
	{#if error}
		<p class="text-sm text-[var(--color-pattern-note-off)]">{error}</p>
	{/if}

	<canvas
		{@attach previewCanvas}
		class={[
			'w-full max-w-full border border-[var(--color-app-border)] bg-[var(--color-pattern-bg)]',
			{ hidden: !project }
		]}
		width="1280"
		height="720"
		aria-label="Pattern preview"></canvas>

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			onclick={startExport}
			disabled={!project || busy}
			class="rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface-active)] px-3 py-1.5 text-sm disabled:opacity-50">
			Export MP4
		</button>
		{#if busy}
			<button
				type="button"
				onclick={cancel}
				class="rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-1.5 text-sm">
				Cancel
			</button>
		{/if}
	</div>

	<p class="text-sm text-[var(--color-app-text-secondary)]">{status}</p>
	{#if busy}
		<progress class="h-2 w-full max-w-xl" max="100" value={progress}>{Math.round(progress)}%</progress>
	{/if}
</main>
