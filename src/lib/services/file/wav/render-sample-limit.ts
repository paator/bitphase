const MAX_TICKS_PER_ROW = 255;

export function renderSampleLimit(
	sampleRate: number,
	totalRows: number,
	loopCount: number,
	framesPerSecond: number
): number {
	const rows = Math.max(1, totalRows);
	const loops = Math.max(1, loopCount);
	const fps = framesPerSecond > 0 ? framesPerSecond : 50;
	const rate = sampleRate > 0 ? sampleRate : 44100;
	return Math.ceil((rows * MAX_TICKS_PER_ROW * loops * rate) / fps);
}

export function renderRowProgress(currentRow: number, totalRows: number): number {
	if (totalRows <= 0) return 0;
	return Math.min(1, Math.max(0, currentRow / totalRows));
}
