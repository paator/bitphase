import { Pattern, Channel, Row, type Song } from '../../models/song';
import type { ChipSchema } from '../../chips/base/schema';
import { computeEffectiveChannelLabels, formatVirtualChannelLabel } from '../../models/virtual-channels';

export class VirtualChannelService {
	static addVirtualChannel(
		song: Song,
		hwChannelIndex: number,
		patterns: Pattern[]
	): { updatedMap: Record<number, number>; updatedPatterns: Pattern[] } {
		const schema = song.getSchema();
		const hwLabels = schema?.channelLabels ?? ['A', 'B', 'C'];
		const currentMap = { ...song.virtualChannelMap };
		const currentCount = currentMap[hwChannelIndex] ?? 1;
		currentMap[hwChannelIndex] = currentCount + 1;

		const insertIndex = this.getGroupEndIndex(hwChannelIndex, song.virtualChannelMap) + 1;

		const newLabel = formatVirtualChannelLabel(hwLabels[hwChannelIndex], currentCount + 1);

		const updatedPatterns = patterns.map((pattern) => {
			const newChannels = [...pattern.channels];
			const newChannel = new Channel(pattern.length, newLabel, schema?.fields);
			newChannels.splice(insertIndex, 0, newChannel);

			if (currentCount === 1 && newChannels[insertIndex - 1]) {
				newChannels[insertIndex - 1] = new Channel(
					pattern.length,
					formatVirtualChannelLabel(hwLabels[hwChannelIndex], 1),
					schema?.fields
				);
				this.copyChannelData(pattern.channels[insertIndex - 1], newChannels[insertIndex - 1]);
			}

			return this.rebuildPattern(pattern, newChannels, schema, newChannels.map((c) => c.label));
		});

		return { updatedMap: currentMap, updatedPatterns };
	}

	static removeVirtualChannel(
		song: Song,
		hwChannelIndex: number,
		patterns: Pattern[],
		effectiveChannelIndex?: number
	): { updatedMap: Record<number, number>; updatedPatterns: Pattern[] } | null {
		const schema = song.getSchema();
		const hwLabels = schema?.channelLabels ?? ['A', 'B', 'C'];
		const currentMap = { ...song.virtualChannelMap };
		const currentCount = currentMap[hwChannelIndex] ?? 1;

		if (currentCount <= 1) return null;

		currentMap[hwChannelIndex] = currentCount - 1;
		if (currentMap[hwChannelIndex] === 1) {
			delete currentMap[hwChannelIndex];
		}

		const groupStart = this.getGroupStartIndex(hwChannelIndex, song.virtualChannelMap);
		const groupEnd = this.getGroupEndIndex(hwChannelIndex, song.virtualChannelMap);
		let removeIndex: number;
		if (effectiveChannelIndex !== undefined && effectiveChannelIndex >= groupStart && effectiveChannelIndex <= groupEnd) {
			removeIndex = effectiveChannelIndex;
		} else {
			removeIndex = groupEnd;
		}

		const updatedPatterns = patterns.map((pattern) => {
			const newChannels = [...pattern.channels];
			newChannels.splice(removeIndex, 1);

			if (currentCount === 2) {
				const remainingIdx = this.getGroupStartIndex(hwChannelIndex, currentMap);
				if (newChannels[remainingIdx]) {
					const relabeled = new Channel(
						pattern.length,
						hwLabels[hwChannelIndex],
						schema?.fields
					);
					this.copyChannelData(newChannels[remainingIdx], relabeled);
					newChannels[remainingIdx] = relabeled;
				}
			}

			const effectiveLabels = computeEffectiveChannelLabels(hwLabels, currentMap);
			return this.rebuildPattern(pattern, newChannels, schema, effectiveLabels);
		});

		return { updatedMap: currentMap, updatedPatterns };
	}

	private static rebuildPattern(
		pattern: Pattern,
		newChannels: Channel[],
		schema: ChipSchema | undefined,
		channelLabels: string[]
	): Pattern {
		const rebuilt = new Pattern(pattern.id, pattern.length, schema, channelLabels);
		for (let i = 0; i < newChannels.length; i++) {
			rebuilt.channels[i].rows = newChannels[i].rows;
		}
		rebuilt.patternRows = pattern.patternRows;
		return rebuilt;
	}

	private static copyChannelData(source: Channel, target: Channel): void {
		const copyLen = Math.min(source.rows.length, target.rows.length);
		for (let r = 0; r < copyLen; r++) {
			const srcRow = source.rows[r];
			const tgtRow = target.rows[r];
			tgtRow.note = { ...srcRow.note } as any;
			tgtRow.effects = srcRow.effects.map((e) => (e ? { ...e } : null)) as any;
			for (const key of Object.keys(srcRow)) {
				if (key !== 'note' && key !== 'effects') {
					(tgtRow as any)[key] = srcRow[key as keyof Row];
				}
			}
		}
	}

	private static getGroupStartIndex(
		hwChannelIndex: number,
		virtualChannelMap: Record<number, number>
	): number {
		let offset = 0;
		for (let i = 0; i < hwChannelIndex; i++) {
			offset += virtualChannelMap[i] ?? 1;
		}
		return offset;
	}

	private static getGroupEndIndex(
		hwChannelIndex: number,
		virtualChannelMap: Record<number, number>
	): number {
		return this.getGroupStartIndex(hwChannelIndex, virtualChannelMap)
			+ (virtualChannelMap[hwChannelIndex] ?? 1) - 1;
	}
}
