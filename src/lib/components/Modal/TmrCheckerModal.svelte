<script lang="ts">
	import Button from '../Button/Button.svelte';
	import { ModalPanel } from '../ModalPanel';
	import { AlertBanner } from '../AlertBanner';
	import { EmptyState } from '../EmptyState';
	import { FilePickerButton } from '../FilePickerButton';
	import {
		attachEventListToTmrFile,
		buildTmrSchedule,
		collectEventFireSchedules,
		formatClockHz,
		formatEventFireSchedules,
		formatEventItemWrites,
		formatHex,
		formatHz,
		formatMaskRegisterDetails,
		formatMaskRegisters,
		formatScheduleTimeMs,
		formatTimerFrequencyHz,
		formatTimerSlotLabel,
		formatTimerSlotSummary,
		parseTMR,
		summarizeTmrFile,
		type ParsedTmrFile
	} from '../../services/file/tmr/tmr-parser';
	import { parseEventList } from '../../services/file/tmr/tmr-event-list';

	let { resolve } = $props<{
		resolve?: (value?: unknown) => void;
	}>();

	let fileName = $state('');
	let eventListFileName = $state('');
	let parseErrors = $state<string[]>([]);
	let parsedFile = $state<ParsedTmrFile | null>(null);
	let tmrWithoutEvents = $state<ParsedTmrFile | null>(null);
	let frameFilter = $state('');
	let showInactiveFrames = $state(false);
	let scheduleTimerFilter = $state<'all' | '0' | '1' | '2'>('all');
	let scheduleEventFilter = $state('');

	const summary = $derived(parsedFile ? summarizeTmrFile(parsedFile) : null);

	const schedule = $derived(parsedFile ? buildTmrSchedule(parsedFile) : null);

	const eventFireSchedules = $derived(
		schedule ? collectEventFireSchedules(schedule) : new Map()
	);

	const filteredScheduleEntries = $derived.by(() => {
		if (!schedule) {
			return [];
		}
		let entries = schedule.entries;
		if (scheduleTimerFilter !== 'all') {
			const timerIndex = Number.parseInt(scheduleTimerFilter, 10);
			entries = entries.filter((entry) => entry.timerIndex === timerIndex);
		}
		const query = scheduleEventFilter.trim();
		if (!query) {
			return entries;
		}
		const numeric = Number.parseInt(query, 10);
		if (!Number.isNaN(numeric)) {
			return entries.filter((entry) => entry.eventIndex === numeric);
		}
		return entries.filter((entry) => {
			const haystack = [
				entry.kind,
				formatTimerSlotLabel(entry.timerIndex),
				entry.eventIndex !== undefined ? String(entry.eventIndex) : '',
				entry.writes ?? '',
				entry.nextLabel ?? ''
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(query.toLowerCase());
		});
	});

	const filteredFrames = $derived.by(() => {
		if (!parsedFile) {
			return [];
		}
		const query = frameFilter.trim();
		let frames = parsedFile.frames;
		if (!showInactiveFrames) {
			frames = frames.filter(
				(frame) =>
					frame.psgApplyMask !== 0 ||
					frame.timers.some((timer) => timer.command !== 'none')
			);
		}
		if (!query) {
			return frames;
		}
		const numeric = Number.parseInt(query, 10);
		if (!Number.isNaN(numeric)) {
			return frames.filter((frame) => frame.index === numeric);
		}
		return frames.filter((frame) => {
			const haystack = [
				String(frame.index),
				formatHex(frame.psgApplyMask),
				...frame.timers.map((timer) => formatTimerSlotSummary(timer))
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(query.toLowerCase());
		});
	});

	function handleClose() {
		resolve?.();
	}

	function rebuildParsedFile() {
		if (!tmrWithoutEvents) {
			parsedFile = null;
			return;
		}
		parsedFile = tmrWithoutEvents;
	}

	async function handleTmrSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			return;
		}
		fileName = file.name;
		parseErrors = [];
		parsedFile = null;
		tmrWithoutEvents = null;
		eventListFileName = '';
		const buffer = await file.arrayBuffer();
		const result = parseTMR(buffer);
		if (result.ok) {
			tmrWithoutEvents = result.file;
			if (result.file.eventItems.length > 0) {
				parsedFile = result.file;
			} else {
				rebuildParsedFile();
			}
		} else {
			parseErrors = result.errors;
		}
		input.value = '';
	}

	async function handleEventListSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			return;
		}
		if (!tmrWithoutEvents) {
			parseErrors = ['Open a .tmr file before loading its .tel event list'];
			input.value = '';
			return;
		}
		eventListFileName = file.name;
		parseErrors = [];
		const buffer = await file.arrayBuffer();
		const result = parseEventList(buffer);
		if (result.ok) {
			parsedFile = attachEventListToTmrFile(tmrWithoutEvents, result.file.eventItems);
		} else {
			parseErrors = result.errors;
		}
		input.value = '';
	}
</script>

<ModalPanel
	title="TMR Checker"
	subtitle="Inspect timer companion files paired with PSG exports"
	width="w-[min(960px,92vw)]"
	maxHeightClass="max-h-[85vh]"
	bodyClass="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
	{#snippet headerActions()}
		<FilePickerButton label="Open .tmr" accept=".tmr" onchange={handleTmrSelect} />
		<FilePickerButton label="Open .tel" accept=".tel" onchange={handleEventListSelect} />
	{/snippet}

	{#snippet children()}
		{#if fileName}
			<AlertBanner variant="info">
				<span class="text-[var(--color-app-text-muted)]">TMR:</span>
				<span class="ml-2 font-mono text-[var(--color-app-text-primary)]">{fileName}</span>
				{#if eventListFileName}
					<span class="ml-4 text-[var(--color-app-text-muted)]">Event list:</span>
					<span class="ml-2 font-mono text-[var(--color-app-text-primary)]">{eventListFileName}</span>
				{:else if tmrWithoutEvents && tmrWithoutEvents.eventItems.length === 0}
					<span class="ml-4 text-[var(--color-pattern-note-off)]">Event list not loaded (.tel)</span>
				{/if}
			</AlertBanner>
		{/if}

		{#if parseErrors.length > 0}
			<AlertBanner variant="warning">
				<h3 class="mb-2 text-sm font-semibold text-[var(--color-pattern-note-off)]">
					Invalid TMR file
				</h3>
				<ul class="space-y-1 text-xs text-[var(--color-app-text-secondary)]">
					{#each parseErrors as error}
						<li>{error}</li>
					{/each}
				</ul>
			</AlertBanner>
		{/if}

		{#if parsedFile}
			<section
				class="grid gap-3 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-3 md:grid-cols-2">
				<div class="space-y-2">
					<h3 class="text-sm font-semibold text-[var(--color-app-text-primary)]">Header</h3>
					<dl class="space-y-1 text-xs">
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">Version</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{parsedFile.header.version}
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">Chip</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{parsedFile.header.isYm ? 'YM2149' : 'AY-8910'}
								{#if parsedFile.header.chipIndex > 0}
									<span class="text-[var(--color-app-text-muted)]">
										(index {parsedFile.header.chipIndex})
									</span>
								{/if}
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">Frame rate</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{formatHz(parsedFile.header.frameRateHz)}
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">PSG clock</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{formatClockHz(parsedFile.header.psgClockHz)}
							</dd>
						</div>
					</dl>
				</div>
				<div class="space-y-2">
					<h3 class="text-sm font-semibold text-[var(--color-app-text-primary)]">Summary</h3>
					<dl class="space-y-1 text-xs">
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">File size</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{parsedFile.fileSize.toLocaleString()} bytes
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">Player frames</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{parsedFile.frames.length.toLocaleString()}
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-[var(--color-app-text-muted)]">Event items</dt>
							<dd class="font-mono text-[var(--color-app-text-primary)]">
								{parsedFile.eventItems.length.toLocaleString()}
							</dd>
						</div>
						{#if summary}
							<div class="flex justify-between gap-4">
								<dt class="text-[var(--color-app-text-muted)]">Timer activity</dt>
								<dd class="font-mono text-[var(--color-app-text-primary)]">
									{summary.startCount} start, {summary.stopCount} stop
								</dd>
							</div>
						{/if}
					</dl>
				</div>
			</section>

			{#if parsedFile.eventItems.length > 0}
				<section class="rounded border border-[var(--color-app-border)]">
					<div
						class="border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2">
						<h3 class="text-sm font-semibold text-[var(--color-app-text-primary)]">
							Event list
						</h3>
						<p class="text-xs text-[var(--color-app-text-muted)]">
							Linked actions executed between player frames
						</p>
					</div>
					<div class="overflow-x-auto">
						<table class="w-full min-w-[720px] border-collapse text-xs">
							<thead>
								<tr class="bg-[var(--color-app-surface-secondary)] text-left">
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">#</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Timer</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Offset</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Writes</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Mask</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Frequency</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Next</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">
										Scheduled at (f)
									</th>
								</tr>
							</thead>
							<tbody>
								{#each parsedFile.eventItems as item}
									<tr
										class="border-t border-[var(--color-app-border)] hover:bg-[var(--color-app-surface-hover)]">
										<td class="px-3 py-2 font-mono text-[var(--color-app-primary)]">
											{item.index}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{formatTimerSlotLabel(item.timerIndex)}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											@ {item.byteOffset}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{formatEventItemWrites(item)}
										</td>
										<td
											class="px-3 py-2 text-[var(--color-app-text-secondary)]"
											title={formatMaskRegisterDetails(item.registerApplyMask)}>
											{formatHex(item.psgApplyMask)}
											<span class="ml-1 text-[var(--color-app-text-muted)]">
												{formatMaskRegisters(item.registerApplyMask)}
											</span>
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{item.frequencyHz === 0
												? 'inherit'
												: formatTimerFrequencyHz(item.frequencyHz)}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{#if item.timerEventIndex === 0xffff}
												STOP
											{:else}
												→ #{item.timerEventIndex}
											{/if}
										</td>
										<td
											class="px-3 py-2 text-[var(--color-app-text-secondary)]"
											title={formatEventFireSchedules(eventFireSchedules.get(item.index), 20)}>
											{formatEventFireSchedules(eventFireSchedules.get(item.index))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}

			{#if schedule && schedule.entries.length > 0}
				<section class="flex min-h-0 flex-col rounded border border-[var(--color-app-border)]">
					<div
						class="flex flex-wrap items-center gap-3 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2">
						<div>
							<h3 class="text-sm font-semibold text-[var(--color-app-text-primary)]">Schedule</h3>
							<p class="text-xs text-[var(--color-app-text-muted)]">
								When timers start, stop, and fire events ({filteredScheduleEntries.length.toLocaleString()}
								of {schedule.entries.length.toLocaleString()} entries, {schedule.chipTicksPerFrame.toLocaleString()}
								ticks/frame)
							</p>
						</div>
						<select
							class="ml-auto rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1 text-xs text-[var(--color-app-text-secondary)] focus:border-[var(--color-app-primary)] focus:outline-none"
							bind:value={scheduleTimerFilter}>
							<option value="all">All timers</option>
							<option value="0">Timer A</option>
							<option value="1">Timer B</option>
							<option value="2">Timer C</option>
						</select>
						<input
							type="text"
							placeholder="Filter by event #…"
							class="min-w-36 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1 text-xs text-[var(--color-app-text-secondary)] focus:border-[var(--color-app-primary)] focus:outline-none"
							bind:value={scheduleEventFilter} />
					</div>
					{#if schedule.truncated}
						<div
							class="border-b border-[var(--color-app-border)] bg-[var(--color-pattern-note-off)]/10 px-3 py-2 text-xs text-[var(--color-pattern-note-off)]">
							Schedule truncated at 5,000 entries. Use filters to narrow results.
						</div>
					{/if}
					<div class="min-h-0 max-h-80 flex-1 overflow-auto">
						<table class="w-full min-w-[860px] border-collapse text-xs">
							<thead class="sticky top-0 z-10 bg-[var(--color-app-surface-secondary)]">
								<tr class="text-left">
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Time</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Frame</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Tick</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Timer</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Action</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">f</th>
									<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Detail</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredScheduleEntries as entry, index (index)}
									<tr
										class="border-t border-[var(--color-app-border)] hover:bg-[var(--color-app-surface-hover)]">
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-primary)]">
											{formatScheduleTimeMs(entry.timeMs)}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											#{entry.frame}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-muted)]">
											{entry.tickInFrame}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{formatTimerSlotLabel(entry.timerIndex)}
										</td>
										<td
											class="px-3 py-2 font-mono uppercase {entry.kind === 'start'
												? 'text-[var(--color-pattern-note)]'
												: entry.kind === 'stop'
													? 'text-[var(--color-pattern-note-off)]'
													: 'text-[var(--color-app-primary)]'}">
											{entry.kind}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{#if entry.frequencyHz !== undefined}
												{formatTimerFrequencyHz(entry.frequencyHz)}
											{:else}
												—
											{/if}
										</td>
										<td class="px-3 py-2 font-mono text-[var(--color-app-text-secondary)]">
											{#if entry.kind === 'start'}
												event #{entry.eventIndex}
											{:else if entry.kind === 'stop'}
												—
											{:else}
												#{entry.eventIndex}: {entry.writes ?? '—'} → {entry.nextLabel ?? '—'}
												{#if entry.eventTimerIndex !== undefined}
													<span class="ml-1 text-[var(--color-app-text-muted)]">
														(T{formatTimerSlotLabel(entry.eventTimerIndex)})
													</span>
												{/if}
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}

			<section class="flex min-h-0 flex-1 flex-col rounded border border-[var(--color-app-border)]">
				<div
					class="flex flex-wrap items-center gap-3 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2">
					<div>
						<h3 class="text-sm font-semibold text-[var(--color-app-text-primary)]">
							Player frames
						</h3>
						<p class="text-xs text-[var(--color-app-text-muted)]">
							Showing {filteredFrames.length.toLocaleString()} of
							{parsedFile.frames.length.toLocaleString()}
						</p>
					</div>
					<input
						type="text"
						placeholder="Filter by frame # or text…"
						class="ml-auto min-w-48 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1 text-xs text-[var(--color-app-text-secondary)] focus:border-[var(--color-app-primary)] focus:outline-none"
						bind:value={frameFilter} />
					<label class="flex items-center gap-2 text-xs text-[var(--color-app-text-muted)]">
						<input type="checkbox" bind:checked={showInactiveFrames} />
						Show idle frames
					</label>
				</div>
				<div class="min-h-0 flex-1 overflow-auto">
					<table class="w-full min-w-[860px] border-collapse text-xs">
						<thead class="sticky top-0 z-10 bg-[var(--color-app-surface-secondary)]">
							<tr class="text-left">
								<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Frame</th>
								<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">PSG mask</th>
								<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Timer A</th>
								<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Timer B</th>
								<th class="px-3 py-2 font-medium text-[var(--color-app-text-muted)]">Timer C</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredFrames as frame (frame.index)}
								<tr
									class="border-t border-[var(--color-app-border)] hover:bg-[var(--color-app-surface-hover)]">
									<td class="px-3 py-2 font-mono text-[var(--color-app-primary)]">
										#{frame.index}
									</td>
									<td
										class="px-3 py-2 text-[var(--color-app-text-secondary)]"
										title={formatMaskRegisterDetails(frame.psgApplyMask)}>
										<span class="font-mono">{formatHex(frame.psgApplyMask)}</span>
										<div class="mt-0.5 text-[var(--color-app-text-muted)]">
											{formatMaskRegisters(frame.psgApplyMask)}
										</div>
									</td>
									{#each frame.timers as timer, timerIndex}
										<td
											class="px-3 py-2 font-mono {timer.command === 'start'
												? 'text-[var(--color-pattern-note)]'
												: timer.command === 'stop'
													? 'text-[var(--color-pattern-note-off)]'
													: 'text-[var(--color-app-text-muted)]'}">
											<span class="text-[var(--color-app-text-muted)]">
												{formatTimerSlotLabel(timerIndex)}:
											</span>
											{formatTimerSlotSummary(timer)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{:else if !fileName}
			<EmptyState
				class="flex-1 border p-8"
				message="No file loaded"
				hint="Open a `.tmr` file and its paired `.tel` event list to inspect player frames, event chains, and timer scheduling." />
		{/if}
	{/snippet}

	{#snippet footer()}
		<Button variant="primary" onclick={handleClose}>Close</Button>
	{/snippet}
</ModalPanel>
