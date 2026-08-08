export interface VirtualChannelGroup {
	hardwareChannelIndex: number;
	hardwareLabel: string;
	virtualChannelIndices: number[];
	virtualLabels: string[];
}

export function formatVirtualChannelLabel(hwLabel: string, virtualIndex1Based: number): string {
	if (hwLabel.length <= 2 && !/\d$/.test(hwLabel)) {
		return `${hwLabel}${virtualIndex1Based}`;
	}
	return `${hwLabel}:${virtualIndex1Based}`;
}

export function computeEffectiveChannelLabels(
	hwLabels: string[],
	virtualChannelMap: Record<number, number>
): string[] {
	const labels: string[] = [];
	for (let i = 0; i < hwLabels.length; i++) {
		const virtualCount = virtualChannelMap[i] ?? 1;
		if (virtualCount <= 1) {
			labels.push(hwLabels[i]);
		} else {
			for (let v = 0; v < virtualCount; v++) {
				labels.push(formatVirtualChannelLabel(hwLabels[i], v + 1));
			}
		}
	}
	return labels;
}

export function getHardwareChannelIndex(
	virtualChannelIndex: number,
	hwLabels: string[],
	virtualChannelMap: Record<number, number>
): number {
	let offset = 0;
	for (let i = 0; i < hwLabels.length; i++) {
		const virtualCount = virtualChannelMap[i] ?? 1;
		if (virtualChannelIndex < offset + virtualCount) {
			return i;
		}
		offset += virtualCount;
	}
	return hwLabels.length - 1;
}

export function getVirtualChannelGroups(
	hwLabels: string[],
	virtualChannelMap: Record<number, number>
): VirtualChannelGroup[] {
	const groups: VirtualChannelGroup[] = [];
	let offset = 0;
	for (let i = 0; i < hwLabels.length; i++) {
		const virtualCount = virtualChannelMap[i] ?? 1;
		const indices: number[] = [];
		const labels: string[] = [];
		for (let v = 0; v < virtualCount; v++) {
			indices.push(offset + v);
			labels.push(
				virtualCount > 1 ? formatVirtualChannelLabel(hwLabels[i], v + 1) : hwLabels[i]
			);
		}
		groups.push({
			hardwareChannelIndex: i,
			hardwareLabel: hwLabels[i],
			virtualChannelIndices: indices,
			virtualLabels: labels
		});
		offset += virtualCount;
	}
	return groups;
}

export function getVirtualIndicesForHardwareChannel(
	hwIndex: number,
	hwLabels: string[],
	virtualChannelMap: Record<number, number>
): number[] {
	return (
		getVirtualChannelGroups(hwLabels, virtualChannelMap)[hwIndex]?.virtualChannelIndices ?? [
			hwIndex
		]
	);
}

export function getTotalVirtualChannelCount(
	hwChannelCount: number,
	virtualChannelMap: Record<number, number>
): number {
	let total = 0;
	for (let i = 0; i < hwChannelCount; i++) {
		total += virtualChannelMap[i] ?? 1;
	}
	return total;
}

export function hasVirtualChannels(virtualChannelMap: Record<number, number>): boolean {
	return Object.values(virtualChannelMap).some((count) => count > 1);
}
