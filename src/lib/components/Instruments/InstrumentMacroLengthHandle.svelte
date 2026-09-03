<script lang="ts">
	import {
		INSTRUMENT_MACRO_MAX_LENGTH,
		INSTRUMENT_MACRO_MIN_LENGTH,
		MACRO_LENGTH_HANDLE_WIDTH
	} from './instrument-macro-ui';

	let {
		handleEl = $bindable(null),
		left,
		top = 2,
		height,
		sequenceLength,
		label,
		isDragging,
		onpointerdown,
		onpointermove,
		onpointerup,
		onpointercancel,
		onkeydown
	}: {
		handleEl?: HTMLDivElement | null;
		left: number;
		top?: number;
		height: number;
		sequenceLength: number;
		label: string;
		isDragging: boolean;
		onpointerdown: (event: PointerEvent) => void;
		onpointermove: (event: PointerEvent) => void;
		onpointerup: (event: PointerEvent) => void;
		onpointercancel: (event: PointerEvent) => void;
		onkeydown: (event: KeyboardEvent) => void;
	} = $props();

	const stepLabel = $derived(sequenceLength === 1 ? 'step' : 'steps');
	const dragAccent = $derived(
		isDragging
			? 'bg-[var(--color-app-primary)]'
			: 'bg-[var(--color-app-text-muted)] group-hover:bg-[var(--color-app-text-secondary)]'
	);
</script>

<div
	bind:this={handleEl}
	class={[
		'group absolute z-10 cursor-ew-resize touch-none transition-transform duration-150',
		isDragging && 'scale-105'
	]}
	style="left: {left}px; top: {top}px; width: {MACRO_LENGTH_HANDLE_WIDTH}px; height: {height}px"
	role="slider"
	tabindex="0"
	aria-orientation="horizontal"
	aria-label="{label} length"
	aria-valuemin={INSTRUMENT_MACRO_MIN_LENGTH}
	aria-valuemax={INSTRUMENT_MACRO_MAX_LENGTH}
	aria-valuenow={sequenceLength}
	aria-valuetext="{sequenceLength} {stepLabel}"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onpointercancel}
	{onkeydown}>
	<div class="relative h-full w-full">
		<div
			class={[
				'absolute top-0 left-1/2 h-px w-2 -translate-x-full rounded-full transition-colors duration-150',
				dragAccent
			]}>
		</div>
		<div
			class={[
				'absolute bottom-0 left-1/2 h-px w-2 -translate-x-full rounded-full transition-colors duration-150',
				dragAccent
			]}>
		</div>
		<div
			class={[
				'absolute inset-y-px left-1/2 w-px -translate-x-1/2 transition-colors duration-150',
				dragAccent
			]}>
		</div>
		<div
			class={[
				'absolute top-1/2 left-1/2 z-10 flex h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-sm border transition-transform duration-150',
				isDragging
					? 'scale-110 border-[var(--color-app-primary)] bg-[var(--color-app-primary)]'
					: 'border-[var(--color-app-text-muted)] bg-[var(--color-app-surface)] group-hover:scale-110 group-hover:border-[var(--color-app-text-secondary)]'
			]}>
			{#each { length: 3 } as _, index (index)}
				<span
					class={[
						'h-px w-1 rounded-full transition-colors duration-150',
						isDragging
							? 'bg-[var(--color-app-surface)]'
							: 'bg-[var(--color-app-text-muted)] group-hover:bg-[var(--color-app-text-secondary)]'
					]}>
				</span>
			{/each}
		</div>
	</div>
</div>
