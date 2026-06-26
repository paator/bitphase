<script lang="ts">
	import type { LoopMarkerStyle } from './loop-marker-style';

	let { style }: { style: LoopMarkerStyle | null } = $props();
</script>

{#if style}
	<div
		class="pointer-events-none absolute z-0 -translate-x-1/2"
		style="left: {style.left}px; top: {style.top}px; height: {style.height}px;">
		<div class="relative h-full">
			<div class="absolute top-0 left-0 h-full w-0.5 border-l-2 border-[var(--color-app-primary)]">
			</div>
			<div
				class="absolute top-0 left-0 h-2 w-2 border-t-2 border-l-2 border-[var(--color-app-primary)]">
			</div>
			<div
				class="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-[var(--color-app-primary)]">
			</div>
		</div>
	</div>
{/if}
