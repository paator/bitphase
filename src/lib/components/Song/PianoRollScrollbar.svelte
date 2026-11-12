<script lang="ts">
	import {
		scrollAfterThumbDrag,
		scrollFromThumbOffset,
		scrollbarThumb
	} from '../../services/piano-roll/piano-roll-scrollbar';

	interface Props {
		orientation: 'horizontal' | 'vertical';
		viewport: number;
		extent: number;
		scroll: number;
		controls: string;
		class?: string;
		onScroll: (value: number) => void;
	}

	let {
		orientation,
		viewport,
		extent,
		scroll,
		controls,
		class: className = '',
		onScroll
	}: Props = $props();

	const horizontal = $derived(orientation === 'horizontal');
	const thumb = $derived(scrollbarThumb(viewport, extent, scroll));
	const maxScroll = $derived(Math.max(0, extent - viewport));

	function onTrackPointerDown(event: PointerEvent): void {
		const track = event.currentTarget;
		if (!(track instanceof HTMLElement)) return;
		const rect = track.getBoundingClientRect();
		const local = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
		const hitThumb = local >= thumb.offset && local < thumb.offset + thumb.size;
		const startScroll = hitThumb
			? scroll
			: scrollFromThumbOffset(viewport, extent, thumb.size, local - thumb.size / 2);
		if (!hitThumb) onScroll(startScroll);
		const start = horizontal ? event.clientX : event.clientY;
		const thumbSize = thumb.size;
		const pointerId = event.pointerId;
		track.setPointerCapture(pointerId);
		const onMove = (ev: PointerEvent) => {
			if (ev.pointerId !== pointerId) return;
			const delta = (horizontal ? ev.clientX : ev.clientY) - start;
			onScroll(scrollAfterThumbDrag(viewport, extent, thumbSize, startScroll, delta));
		};
		const onUp = (ev: PointerEvent) => {
			if (ev.pointerId !== pointerId) return;
			track.removeEventListener('pointermove', onMove);
			track.removeEventListener('pointerup', onUp);
			track.removeEventListener('pointercancel', onUp);
		};
		track.addEventListener('pointermove', onMove);
		track.addEventListener('pointerup', onUp);
		track.addEventListener('pointercancel', onUp);
	}

	function keepCanvasFocus(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<div
	role="scrollbar"
	tabindex="-1"
	aria-orientation={orientation}
	aria-controls={controls}
	aria-valuemin={0}
	aria-valuemax={maxScroll}
	aria-valuenow={Math.round(Math.min(maxScroll, Math.max(0, scroll)))}
	class="relative touch-none bg-[var(--color-app-background)] select-none {className}"
	onpointerdown={onTrackPointerDown}
	onmousedown={keepCanvasFocus}>
	{#if thumb.size > 0}
		<div
			class="absolute rounded-sm bg-[var(--color-app-border)] hover:bg-[var(--color-app-border-hover)] {horizontal
				? 'top-0 h-full'
				: 'left-0 w-full'}"
			style:width={horizontal ? `${thumb.size}px` : undefined}
			style:height={horizontal ? undefined : `${thumb.size}px`}
			style:left={horizontal ? `${thumb.offset}px` : undefined}
			style:top={horizontal ? undefined : `${thumb.offset}px`}>
		</div>
	{/if}
</div>
