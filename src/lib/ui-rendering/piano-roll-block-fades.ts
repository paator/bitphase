import {
	noteSpotKey,
	type PianoNoteBlock,
	type PianoNoteSpot
} from '../services/piano-roll/piano-roll-notes';
import {
	isTimelineBlock,
	type PianoTimelineBlock
} from '../services/piano-roll/piano-roll-timeline';

export type PianoBlockPlace = Pick<
	PianoTimelineBlock,
	'orderIndex' | 'patternId' | 'localStartRow' | 'pitchIndex'
>;

export interface PianoLeavingBlock {
	block: PianoTimelineBlock;
	presence: number;
	selected: boolean;
}

interface BlockFade {
	block: PianoTimelineBlock;
	mode: 'in' | 'out';
	started: number;
	selected: boolean;
}

const BLOCK_FADE_MS = 160;

export function blockPlaceKey(block: PianoBlockPlace): string {
	return `${block.orderIndex}:${block.patternId}:${block.localStartRow}:${block.pitchIndex}`;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

export class PianoBlockFades {
	private scope = '';
	private keys = new Set<string>();
	private selectedSpots = new Set<string>();
	private skipIn = false;
	private frame = 0;
	private readonly patterns = new Set<number>();
	private readonly live = new Map<string, PianoTimelineBlock>();
	private readonly fades = new Map<string, BlockFade>();
	private readonly held = new Set<string>();

	constructor(
		private readonly onFrame: (now: number) => void,
		private readonly clock: () => number = () => performance.now(),
		private readonly duration = BLOCK_FADE_MS
	) {}

	sync(
		blocks: readonly PianoTimelineBlock[],
		patternIds: readonly number[],
		scope: string,
		selection: readonly PianoNoteSpot[] = []
	): void {
		const now = this.clock();
		if (scope !== this.scope) this.reset(scope);
		const inWindow = new Set(patternIds);
		const fresh = new Set([...inWindow].filter((id) => !this.patterns.has(id)));
		for (const [key, block] of this.live) {
			if (inWindow.has(block.patternId)) continue;
			this.live.delete(key);
			this.fades.delete(key);
		}
		const next = new Set<string>();
		for (const block of blocks) {
			const key = blockPlaceKey(block);
			next.add(key);
			const known = this.live.has(key);
			this.live.set(key, block);
			if (!fresh.has(block.patternId) && !known && !this.skipIn) {
				this.fades.set(key, { block, mode: 'in', started: now, selected: false });
				continue;
			}
			const fade = this.fades.get(key);
			if (fade?.mode === 'in') fade.block = block;
		}
		for (const key of this.keys) {
			if (next.has(key)) continue;
			const block = this.live.get(key);
			this.live.delete(key);
			const held = this.held.delete(key);
			if (held || !block || fresh.has(block.patternId) || !inWindow.has(block.patternId))
				continue;
			this.fades.set(key, {
				block,
				mode: 'out',
				started: now,
				selected: this.selectedSpots.has(noteSpotKey(block))
			});
		}
		for (const key of this.held) {
			if (next.has(key)) this.held.delete(key);
		}
		this.skipIn = false;
		for (const id of this.patterns) {
			if (!inWindow.has(id)) this.patterns.delete(id);
		}
		for (const id of inWindow) this.patterns.add(id);
		this.keys = next;
		this.selectedSpots = new Set(selection.map(noteSpotKey));
		if ([...this.fades.values()].some((fade) => now - fade.started < this.duration))
			this.animate();
	}

	holdMoved(blocks: Iterable<PianoBlockPlace>): void {
		for (const block of blocks) this.held.add(blockPlaceKey(block));
		this.skipIn = true;
	}

	presence(block: PianoNoteBlock, now: number): number {
		if (!isTimelineBlock(block)) return 1;
		const fade = this.fades.get(blockPlaceKey(block));
		if (!fade || fade.mode !== 'in') return 1;
		return this.progress(fade, now);
	}

	leaving(now: number): PianoLeavingBlock[] {
		const leaving: PianoLeavingBlock[] = [];
		for (const fade of this.fades.values()) {
			if (fade.mode === 'out')
				leaving.push({
					block: fade.block,
					presence: 1 - this.progress(fade, now),
					selected: fade.selected
				});
		}
		return leaving;
	}

	dispose(): void {
		if (this.frame) cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	private progress(fade: BlockFade, now: number): number {
		return easeOutCubic(Math.min(1, Math.max(0, (now - fade.started) / this.duration)));
	}

	private reset(scope: string): void {
		this.scope = scope;
		this.patterns.clear();
		this.live.clear();
		this.keys = new Set();
		this.selectedSpots = new Set();
		this.fades.clear();
		this.held.clear();
		this.skipIn = false;
	}

	private animate(): void {
		if (this.frame) return;
		const tick = () => {
			this.frame = 0;
			const now = this.clock();
			let active = false;
			for (const [key, fade] of this.fades) {
				if (now - fade.started >= this.duration) this.fades.delete(key);
				else active = true;
			}
			this.onFrame(now);
			if (active) this.frame = requestAnimationFrame(tick);
		};
		this.frame = requestAnimationFrame(tick);
	}
}
