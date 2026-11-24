<script lang="ts">
	import {
		instrumentMacroAccentColor,
		type InstrumentMacroField
	} from '../../chips/base/instrument-macros';
	import {
		MACRO_BAR_SCALE_CENTER_SNAP_PX,
		MACRO_BAR_SCALE_MIN_THUMB_PX,
		macroBarNumericRange,
		macroBarScaleCenterT,
		macroBarScaleCenterViewMin,
		macroBarScalePointerNearCenter,
		macroBarScaleShouldCatchCenter,
		macroBarScaleShouldHoldCenter,
		macroBarScaleThumbNearCenter,
		macroBarScaleThumbRatio,
		macroBarScaleThumbT,
		macroBarScaleUnsnapFromCenter,
		macroBarViewMinFromDragDelta,
		macroBarViewMinFromTrackY,
		macroBarVisibleSpan,
		formatMacroFieldNumber,
		snapMacroBarViewMinCrossingCenter
	} from './instrument-macro-ui';

	let {
		field,
		viewMin,
		asHex = false,
		onViewMinChange
	}: {
		field: InstrumentMacroField;
		viewMin: number;
		asHex?: boolean;
		onViewMinChange: (viewMin: number) => void;
	} = $props();

	const uid = $props.id();
	let trackEl = $state<HTMLDivElement | null>(null);
	let isDragging = $state(false);
	let magnetized = $state(false);
	let grabY = $state(0);
	let grabViewMin = $state(0);
	let snapY = $state(0);
	let holdMoves = $state(0);
	let catchArmed = $state(true);

	const span = $derived(macroBarVisibleSpan(field));
	const range = $derived(macroBarNumericRange(field));
	const viewMax = $derived(viewMin + span);
	const thumbRatio = $derived(macroBarScaleThumbRatio(field));
	const thumbT = $derived(macroBarScaleThumbT(field, viewMin));
	const centerT = $derived(macroBarScaleCenterT(field));
	const atCenter = $derived(viewMin === macroBarScaleCenterViewMin(field));
	const accent = $derived(instrumentMacroAccentColor(field.accent));
	const thumbSize = $derived(
		`max(${MACRO_BAR_SCALE_MIN_THUMB_PX}px, ${thumbRatio * 100}%)`
	);
	const thumbTop = $derived(`calc((100% - ${thumbSize}) * ${1 - thumbT})`);
	const centerTop = $derived(
		`calc((100% - ${thumbSize}) * ${1 - centerT} + ${thumbSize} * 0.5)`
	);
	const fillTop = $derived(
		`min(${centerTop}, calc(${thumbTop} + ${thumbSize} * 0.5))`
	);
	const fillHeight = $derived(
		`calc(${Math.abs(thumbT - centerT)} * (100% - ${thumbSize}))`
	);
	const thumbLit = $derived(atCenter || isDragging || magnetized);
	const thumbStyle = $derived(
		`height: ${thumbSize}; top: ${thumbTop}; background: ${thumbLit
			? 'var(--scale-accent)'
			: 'color-mix(in srgb, var(--scale-accent) 72%, var(--color-app-surface))'}`
	);

	function handlePointerDown(event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const track = trackEl;
		if (!track) return;
		track.setPointerCapture(event.pointerId);
		isDragging = true;
		const rect = track.getBoundingClientRect();
		grabY = event.clientY;
		snapY = event.clientY;
		holdMoves = 0;
		catchArmed = true;
		if (
			macroBarScalePointerNearCenter(
				field,
				event.clientY,
				rect.top,
				rect.height,
				MACRO_BAR_SCALE_CENTER_SNAP_PX
			)
		) {
			magnetized = true;
			grabViewMin = macroBarScaleCenterViewMin(field);
			onViewMinChange(grabViewMin);
			return;
		}
		magnetized = false;
		const normalized = (event.clientY - rect.top) / Math.max(1, rect.height);
		grabViewMin = macroBarViewMinFromTrackY(field, normalized);
		onViewMinChange(grabViewMin);
	}

	function handlePointerMove(event: PointerEvent): void {
		const track = trackEl;
		if (!track?.hasPointerCapture(event.pointerId)) return;
		const rect = track.getBoundingClientRect();
		if (magnetized) {
			holdMoves += 1;
			if (macroBarScaleShouldHoldCenter(Math.abs(event.clientY - snapY), holdMoves)) {
				onViewMinChange(macroBarScaleCenterViewMin(field));
				return;
			}
			magnetized = false;
			catchArmed = false;
			grabY = event.clientY;
			grabViewMin = macroBarScaleUnsnapFromCenter(field, event.clientY, snapY);
			onViewMinChange(grabViewMin);
			return;
		}
		const next = macroBarViewMinFromDragDelta(
			field,
			grabViewMin,
			grabY,
			event.clientY,
			rect.height
		);
		if (
			!catchArmed &&
			!macroBarScaleThumbNearCenter(field, next, rect.height)
		) {
			catchArmed = true;
		}
		if (catchArmed && macroBarScaleShouldCatchCenter(field, viewMin, next)) {
			magnetized = true;
			snapY = event.clientY;
			grabY = event.clientY;
			holdMoves = 0;
			grabViewMin = macroBarScaleCenterViewMin(field);
			onViewMinChange(grabViewMin);
			return;
		}
		onViewMinChange(next);
	}

	function handlePointerUp(event: PointerEvent): void {
		if (trackEl?.hasPointerCapture(event.pointerId)) {
			trackEl.releasePointerCapture(event.pointerId);
		}
		magnetized = false;
		isDragging = false;
	}

	function handleWheel(event: WheelEvent): void {
		if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		event.preventDefault();
		const step = Math.max(1, Math.round(Math.abs(event.deltaY) / 24));
		onViewMinChange(
			snapMacroBarViewMinCrossingCenter(
				field,
				viewMin,
				viewMin - Math.sign(event.deltaY) * step
			)
		);
	}

	function handleDoubleClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		onViewMinChange(macroBarScaleCenterViewMin(field));
	}
</script>

<div
	class="flex min-h-0 min-w-0 flex-1 flex-col px-0.5"
	style:--scale-accent={accent}>
	<span
		class="pointer-events-none shrink-0 truncate pt-0.5 text-center font-mono text-[0.6rem] leading-4 tabular-nums text-[var(--color-app-text-muted)]"
		title="Visible max {formatMacroFieldNumber(field, viewMax, asHex)}"
		>{formatMacroFieldNumber(field, viewMax, asHex)}</span>
	<div
		bind:this={trackEl}
		id="{uid}-scale"
		class="group relative min-h-0 flex-1 cursor-ns-resize"
		role="scrollbar"
		tabindex="-1"
		aria-controls="macro-bar-{field.id}"
		aria-orientation="vertical"
		aria-label="{field.label} value range"
		aria-valuemin={range.min}
		aria-valuemax={range.max - span}
		aria-valuenow={viewMin}
		aria-valuetext="{formatMacroFieldNumber(field, viewMin, asHex)} to {formatMacroFieldNumber(
			field,
			viewMax,
			asHex
		)}"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		ondblclick={handleDoubleClick}
		onwheel={handleWheel}>
		<div
			class="pointer-events-none absolute inset-y-0.5 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-[var(--color-app-background)]"
			aria-hidden="true">
		</div>
		<div
			class={[
				'pointer-events-none absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-[var(--scale-accent)] opacity-45 ease-out motion-reduce:transition-none',
				isDragging
					? 'duration-0'
					: 'transition-[top,height] duration-150'
			]}
			style="top: {fillTop}; height: {fillHeight}"
			aria-hidden="true">
		</div>
		<div
			class={[
				'pointer-events-none absolute left-1/2 z-[1] flex -translate-x-1/2 -translate-y-1/2 items-center transition-[color,transform] duration-150 ease-out motion-reduce:transition-none',
				atCenter && 'scale-125'
			]}
			style="top: {centerTop}"
			aria-hidden="true">
			<span
				class={[
					'h-px w-1.5 rounded-full transition-colors duration-150 motion-reduce:transition-none',
					atCenter ? 'bg-[var(--scale-accent)]' : 'bg-[var(--color-app-text-muted)]'
				]}>
			</span>
			<span
				class={[
					'mx-px h-1.5 w-1.5 rotate-45 rounded-[1px] transition-colors duration-150 motion-reduce:transition-none',
					atCenter ? 'bg-[var(--scale-accent)]' : 'bg-[var(--color-app-text-secondary)]'
				]}>
			</span>
			<span
				class={[
					'h-px w-1.5 rounded-full transition-colors duration-150 motion-reduce:transition-none',
					atCenter ? 'bg-[var(--scale-accent)]' : 'bg-[var(--color-app-text-muted)]'
				]}>
			</span>
		</div>
		<div
			class={[
				'absolute left-1/2 z-[2] w-2.5 -translate-x-1/2 rounded-full ease-out motion-reduce:transition-none',
				isDragging
					? 'transition-[background-color,transform] duration-150'
					: 'transition-[top,background-color,transform] duration-150',
				isDragging || magnetized ? 'scale-110' : 'group-hover:scale-105'
			]}
			style={thumbStyle}>
		</div>
	</div>
	<span
		class="pointer-events-none shrink-0 truncate pb-0.5 text-center font-mono text-[0.6rem] leading-4 tabular-nums text-[var(--color-app-text-muted)]"
		title="Visible min {formatMacroFieldNumber(field, viewMin, asHex)}"
		>{formatMacroFieldNumber(field, viewMin, asHex)}</span>
</div>
