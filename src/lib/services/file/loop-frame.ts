export function resolveLoopFrame(
	orderIndices: readonly number[],
	loopPointId: number,
	patternOrderLength: number,
	songEnded: boolean
): number | null {
	if (songEnded) return null;
	if (orderIndices.length === 0 || loopPointId < 0 || loopPointId >= patternOrderLength) {
		return 0;
	}
	const index = orderIndices.findIndex((orderIndex) => orderIndex === loopPointId);
	return index >= 0 ? index : 0;
}
