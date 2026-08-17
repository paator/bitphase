export type EmptyNoteAlignment = 'center' | 'baseline';

export interface GlyphVerticalMetrics {
	actualBoundingBoxAscent: number;
	actualBoundingBoxDescent: number;
}

export function emptyNoteBaselineYOffset(
	hyphen: GlyphVerticalMetrics,
	dot: GlyphVerticalMetrics,
	fallback: number
): number {
	const hyphenAscent = hyphen.actualBoundingBoxAscent;
	const hyphenDescent = hyphen.actualBoundingBoxDescent;
	const dotAscent = dot.actualBoundingBoxAscent;
	const dotDescent = dot.actualBoundingBoxDescent;
	if (![hyphenAscent, hyphenDescent, dotAscent, dotDescent].every(Number.isFinite)) {
		return fallback;
	}
	const hyphenCenter = (hyphenDescent - hyphenAscent) / 2;
	const dotCenter = (dotDescent - dotAscent) / 2;
	return dotCenter - hyphenCenter;
}
