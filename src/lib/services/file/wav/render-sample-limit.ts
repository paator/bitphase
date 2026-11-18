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

export type WavRenderRowSpan = {
	firstPassRows: number;
	loopSegmentRows: number;
};

export function exportRowTotal(
	firstPassRows: number,
	loopSegmentRows: number,
	loopCount: number
): number {
	return loopCount <= 1 ? firstPassRows : firstPassRows + loopSegmentRows * (loopCount - 1);
}

export function exportProgressRow(
	positionInOrder: number,
	completedLoops: number,
	span: WavRenderRowSpan
): number {
	const position = Math.max(0, positionInOrder);
	const done = Math.max(0, completedLoops);
	if (done === 0) return position;
	const loopStart = Math.max(0, span.firstPassRows - span.loopSegmentRows);
	const intoLoop = Math.max(0, position - loopStart);
	return span.firstPassRows + (done - 1) * span.loopSegmentRows + intoLoop;
}

export function formatRenderProgress(currentRow: number, totalRows: number): string {
	return `Rendering... ${currentRow}/${totalRows} rows`;
}

export function describeWavRender(
	positionInOrder: number,
	completedLoops: number,
	totalRows: number,
	span: WavRenderRowSpan
): { value: number; message: string } {
	const currentRow = exportProgressRow(positionInOrder, completedLoops, span);
	return {
		value: 50 + renderRowProgress(currentRow, totalRows) * 50,
		message: formatRenderProgress(currentRow, totalRows)
	};
}
