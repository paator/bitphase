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
