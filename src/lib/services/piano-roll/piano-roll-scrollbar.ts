const MIN_THUMB = 16;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function scrollbarThumb(
	viewport: number,
	extent: number,
	scroll: number
): { size: number; offset: number } {
	if (viewport <= 0) return { size: 0, offset: 0 };
	if (extent <= viewport) return { size: viewport, offset: 0 };
	const size = Math.min(viewport, Math.max(MIN_THUMB, (viewport / extent) * viewport));
	const maxScroll = extent - viewport;
	const travel = viewport - size;
	const offset = travel <= 0 ? 0 : (clamp(scroll, 0, maxScroll) / maxScroll) * travel;
	return { size, offset };
}

export function scrollFromThumbOffset(
	viewport: number,
	extent: number,
	thumbSize: number,
	offset: number
): number {
	const maxScroll = Math.max(0, extent - viewport);
	const travel = viewport - thumbSize;
	if (maxScroll <= 0 || travel <= 0) return 0;
	return clamp((offset / travel) * maxScroll, 0, maxScroll);
}

export function scrollAfterThumbDrag(
	viewport: number,
	extent: number,
	thumbSize: number,
	startScroll: number,
	delta: number
): number {
	const maxScroll = Math.max(0, extent - viewport);
	const travel = viewport - thumbSize;
	if (maxScroll <= 0 || travel <= 0) return 0;
	return clamp(startScroll + (delta * maxScroll) / travel, 0, maxScroll);
}
