const WAVEFORM_FRAME_SIZE = 512;
const WAVEFORM_DISPLAY_LENGTH = 1536;
const ZERO_WAVEFORM = new Float32Array(WAVEFORM_DISPLAY_LENGTH);

class WaveformStore {
	private channelDataByChip: Float32Array[][] = $state([]);
	private writeIndexByChip: number[] = $state([]);
	private channelCountByChip: number[] = $state([]);

	get channels(): Float32Array[] {
		return this.channelCountByChip.flatMap((count, chipIndex) => {
			const chipBuffers = this.channelDataByChip[chipIndex] ?? [];
			const writeIndex = this.writeIndexByChip[chipIndex] ?? 0;
			return Array.from({ length: count }, (_, ch) => {
				const buf = chipBuffers[ch];
				if (!buf || buf.length === 0) {
					return ZERO_WAVEFORM;
				}
				const out = new Float32Array(buf.length);
				for (let i = 0; i < buf.length; i++) {
					out[i] = buf[(writeIndex + i) % buf.length];
				}
				return out;
			});
		});
	}

	prepareLayout(channelCounts: number[]): void {
		const ringSize = WAVEFORM_DISPLAY_LENGTH;
		this.channelCountByChip = [...channelCounts];
		this.channelDataByChip = channelCounts.map((count) =>
			Array.from({ length: count }, () => new Float32Array(ringSize))
		);
		this.writeIndexByChip = channelCounts.map(() => 0);
	}

	setChannels(chipIndex: number, channels: Float32Array[]): void {
		while (this.channelDataByChip.length <= chipIndex) {
			this.channelDataByChip = [...this.channelDataByChip, []];
			this.writeIndexByChip = [...this.writeIndexByChip, 0];
			this.channelCountByChip = [...this.channelCountByChip, 0];
		}
		this.channelCountByChip = this.channelCountByChip.slice();
		this.channelCountByChip[chipIndex] = channels.length;
		const ringSize = WAVEFORM_DISPLAY_LENGTH;
		let writeIndex = this.writeIndexByChip[chipIndex] ?? 0;
		const existing = this.channelDataByChip[chipIndex];
		const newBuffers = channels.map((buf, ch) => {
			const ring =
				existing[ch]?.length === ringSize ? existing[ch] : new Float32Array(ringSize);
			for (let i = 0; i < buf.length; i++) {
				ring[(writeIndex + i) % ringSize] = buf[i];
			}
			return ring;
		});
		writeIndex = (writeIndex + WAVEFORM_FRAME_SIZE) % ringSize;
		this.channelDataByChip = this.channelDataByChip.slice();
		this.channelDataByChip[chipIndex] = newBuffers;
		this.writeIndexByChip = this.writeIndexByChip.slice();
		this.writeIndexByChip[chipIndex] = writeIndex;
	}

	clear(): void {
		this.channelDataByChip = [];
		this.writeIndexByChip = [];
		this.channelCountByChip = [];
	}
}

export const waveformStore = new WaveformStore();
