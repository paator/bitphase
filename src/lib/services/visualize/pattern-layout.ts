export const PATTERN_LINE_HEIGHT_MULTIPLIER = 1.5;
const MIN_VISIBLE_ROWS = 24;
const CHANNEL_SEPARATOR_MARGIN = 4;

export function patternFont(fontSize: number, family: string): string {
	return `${fontSize}px "${family}", monospace`;
}

export function choosePatternFontSize(
	frameWidth: number,
	frameHeight: number,
	rowWidthAt: (fontSize: number) => number
): number {
	const maxFont = Math.max(
		8,
		Math.floor(frameHeight / (MIN_VISIBLE_ROWS * PATTERN_LINE_HEIGHT_MULTIPLIER))
	);
	let low = 8;
	let high = maxFont;
	let best = 8;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (rowWidthAt(mid) <= frameWidth) {
			best = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return best;
}

export function patternContentWidth(frameWidth: number, textEnd: number, trailingGap: number): number {
	const edge = Math.max(textEnd, textEnd + trailingGap - CHANNEL_SEPARATOR_MARGIN);
	return Math.min(frameWidth, Math.max(1, Math.ceil(edge)));
}
