<script lang="ts">
	import { MACRO_LOOP_HANDLE_WIDTH } from './instrument-macro-ui';

	let {
		handleEl = $bindable(null),
		left,
		height,
		loopIndex,
		maxIndex,
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
		height: number;
		loopIndex: number;
		maxIndex: number;
		label: string;
		isDragging: boolean;
		onpointerdown: (event: PointerEvent) => void;
		onpointermove: (event: PointerEvent) => void;
		onpointerup: (event: PointerEvent) => void;
		onpointercancel: (event: PointerEvent) => void;
		onkeydown: (event: KeyboardEvent) => void;
	} = $props();
</script>

<div
	bind:this={handleEl}
	class={[
		'group absolute top-0 z-10 flex cursor-ew-resize touch-none flex-col items-center transition-opacity duration-150',
		isDragging ? 'opacity-100' : 'opacity-90 hover:opacity-100'
	]}
	style="left: {left}px; width: {MACRO_LOOP_HANDLE_WIDTH}px; height: {height}px"
	role="slider"
	tabindex="0"
	aria-orientation="horizontal"
	aria-label="{label} loop start"
	aria-valuemin={0}
	aria-valuemax={maxIndex}
	aria-valuenow={loopIndex}
	aria-valuetext="step {loopIndex}"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onpointercancel}
	{onkeydown}>
	<div
		class="h-2 w-2.5 shrink-0 rounded-[2px] bg-[var(--color-app-primary)] shadow-sm transition-transform duration-150 group-hover:scale-110">
	</div>
	<div class="w-0.5 flex-1 bg-[var(--color-app-primary)]"></div>
	<div
		class="h-2 w-2.5 shrink-0 rounded-[2px] bg-[var(--color-app-primary)] shadow-sm transition-transform duration-150 group-hover:scale-110">
	</div>
</div>
