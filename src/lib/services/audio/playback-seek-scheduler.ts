export const PLAYBACK_ORDER_SEEK_DEBOUNCE_MS = 120;

export class PlaybackSeekScheduler {
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly onSeek: () => void,
		private readonly delayMs: number = PLAYBACK_ORDER_SEEK_DEBOUNCE_MS
	) {}

	schedule(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.timer = null;
			this.onSeek();
		}, this.delayMs);
	}

	cancel(): void {
		if (this.timer === null) return;
		clearTimeout(this.timer);
		this.timer = null;
	}

	flush(): void {
		this.cancel();
		this.onSeek();
	}

	get isPending(): boolean {
		return this.timer !== null;
	}
}
