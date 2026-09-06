export function isPlausiblePlaybackOrderAdvance(
	currentIndex: number,
	incomingIndex: number,
	orderLength: number,
	loopPointIndex: number
): boolean {
	if (incomingIndex === currentIndex) return true;
	if (incomingIndex === currentIndex + 1) return true;
	if (orderLength <= 0) return false;
	const loopIndex =
		loopPointIndex >= 0 && loopPointIndex < orderLength ? loopPointIndex : 0;
	return currentIndex >= orderLength - 1 && incomingIndex === loopIndex;
}

export class PlaybackOrderIndexGate {
	private pinnedIndex: number | null = null;

	pin(index: number): void {
		this.pinnedIndex = index;
	}

	clear(): void {
		this.pinnedIndex = null;
	}

	isPinned(): boolean {
		return this.pinnedIndex !== null;
	}

	allows(orderIndex: number | undefined): boolean {
		if (this.pinnedIndex === null) return true;
		return orderIndex === this.pinnedIndex;
	}

	consume(orderIndex: number | undefined): boolean {
		if (!this.allows(orderIndex)) return false;
		this.pinnedIndex = null;
		return true;
	}
}
