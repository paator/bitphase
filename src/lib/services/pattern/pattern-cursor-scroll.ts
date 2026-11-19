export const PATTERN_CURSOR_SCROLL_MARGIN = 16;

export interface AxisSpan {
	left: number;
	right: number;
}

export function nextHorizontalScrollLeft(
	scrollLeft: number,
	viewport: AxisSpan,
	target: AxisSpan,
	margin = PATTERN_CURSOR_SCROLL_MARGIN
): number {
	const viewWidth = viewport.right - viewport.left;
	if (viewWidth <= 0) return scrollLeft;
	const safeMargin = margin * 2 >= viewWidth ? 0 : Math.max(0, margin);
	const leftLimit = viewport.left + safeMargin;
	const rightLimit = viewport.right - safeMargin;
	const visibleWidth = rightLimit - leftLimit;
	if (visibleWidth <= 0) return scrollLeft;
	const targetWidth = target.right - target.left;
	if (targetWidth >= visibleWidth) {
		return scrollLeft - (leftLimit - target.left);
	}
	if (target.left < leftLimit) {
		return scrollLeft - (leftLimit - target.left);
	}
	if (target.right > rightLimit) {
		return scrollLeft + (target.right - rightLimit);
	}
	return scrollLeft;
}

export function horizontalEdgeScrollDirection(
	pointerX: number,
	viewport: AxisSpan,
	margin: number
): -1 | 0 | 1 {
	const width = viewport.right - viewport.left;
	if (width <= 0) return 0;
	const edge = Math.min(Math.max(0, margin), width / 4);
	if (pointerX <= viewport.left + edge) return -1;
	if (pointerX >= viewport.right - edge) return 1;
	return 0;
}

export function nextAutoScrollLeft(
	scrollLeft: number,
	maxScroll: number,
	direction: -1 | 1,
	step: number
): number {
	const limit = Math.max(0, maxScroll);
	return Math.min(limit, Math.max(0, scrollLeft + direction * Math.max(0, step)));
}

export function insetHorizontalViewport(viewport: AxisSpan, obstacles: AxisSpan[]): AxisSpan {
	let left = viewport.left;
	let right = viewport.right;
	for (const obstacle of obstacles) {
		if (obstacle.right <= viewport.left || obstacle.left >= viewport.right) continue;
		if (obstacle.left - viewport.left <= 1) {
			left = Math.max(left, Math.min(obstacle.right, viewport.right));
		}
		if (viewport.right - obstacle.right <= 1) {
			right = Math.min(right, Math.max(obstacle.left, viewport.left));
		}
	}
	if (right - left < 1) return viewport;
	return { left, right };
}
