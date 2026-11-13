export const MAX_VIRTUAL_CHANNELS_PER_HARDWARE_CHANNEL = 3;

export interface VirtualChannelGroup {
	hardwareChannelIndex: number;
	hardwareLabel: string;
	virtualChannelIndices: number[];
	virtualLabels: string[];
}

export function clampVirtualChannelCount(count: number | undefined): number {
	if (typeof count !== 'number' || !Number.isFinite(count)) return 1;
	const truncated = Math.trunc(count);
	if (truncated <= 1) return 1;
	return Math.min(MAX_VIRTUAL_CHANNELS_PER_HARDWARE_CHANNEL, truncated);
}

function storedVirtualChannelCount(count: number | undefined): number {
	if (typeof count !== 'number' || !Number.isFinite(count)) return 1;
	const truncated = Math.trunc(count);
	return truncated < 1 ? 1 : truncated;
}

export function normalizeVirtualChannelMap(
	virtualChannelMap: Record<number, number> | undefined,
	hwChannelCount: number
): Record<number, number> {
	const source = virtualChannelMap ?? {};
	const normalized: Record<number, number> = {};
	for (let hw = 0; hw < hwChannelCount; hw++) {
		const count = clampVirtualChannelCount(source[hw]);
		if (count > 1) normalized[hw] = count;
	}
	return normalized;
}

export function storedVirtualChannelTotal(
	hwChannelCount: number,
	virtualChannelMap: Record<number, number> | undefined
): number {
	const source = virtualChannelMap ?? {};
	let total = 0;
	for (let hw = 0; hw < hwChannelCount; hw++) {
		total += storedVirtualChannelCount(source[hw]);
	}
	return total;
}

export function selectChannelsWithinVirtualLimit<T>(
	channels: readonly T[],
	hwChannelCount: number,
	virtualChannelMap: Record<number, number> | undefined
): T[] {
	const source = virtualChannelMap ?? {};
	const selected: T[] = [];
	let offset = 0;
	for (let hw = 0; hw < hwChannelCount; hw++) {
		const storedCount = storedVirtualChannelCount(source[hw]);
		const keptCount = clampVirtualChannelCount(source[hw]);
		for (let virtual = 0; virtual < keptCount; virtual++) {
			const channel = channels[offset + virtual];
			if (channel !== undefined) selected.push(channel);
		}
		offset += storedCount;
	}
	return selected;
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
		const virtualCount = clampVirtualChannelCount(virtualChannelMap[i]);
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

export function logicalColumnForHardwareChannel(
	hardwareIndex: number,
	virtualChannelMap: Record<number, number> | undefined,
	hardwareCount: number
): number {
	if (!virtualChannelMap) return hardwareIndex;
	let offset = 0;
	const limit = Math.min(Math.max(hardwareIndex, 0), hardwareCount);
	for (let hardware = 0; hardware < limit; hardware++) {
		offset += clampVirtualChannelCount(virtualChannelMap[hardware]);
	}
	return offset;
}

export function getHardwareChannelIndex(
	virtualChannelIndex: number,
	hwLabels: string[],
	virtualChannelMap: Record<number, number>
): number {
	let offset = 0;
	for (let i = 0; i < hwLabels.length; i++) {
		const virtualCount = clampVirtualChannelCount(virtualChannelMap[i]);
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
		const virtualCount = clampVirtualChannelCount(virtualChannelMap[i]);
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
		total += clampVirtualChannelCount(virtualChannelMap[i]);
	}
	return total;
}

export function hasVirtualChannels(virtualChannelMap: Record<number, number>): boolean {
	return Object.values(virtualChannelMap).some((count) => count > 1);
}

export type VirtualChannelRoleMap = Record<number, Record<number, string>>;

export interface VirtualChannelRoleMarkSource {
	id: string;
	headerMark: string;
}

export function cloneVirtualChannelRoles(
	roles: VirtualChannelRoleMap | undefined
): VirtualChannelRoleMap {
	const cloned: VirtualChannelRoleMap = {};
	if (!roles) return cloned;
	for (const [hwKey, group] of Object.entries(roles)) {
		const hw = Number(hwKey);
		if (!Number.isInteger(hw) || !group) continue;
		const nextGroup: Record<number, string> = {};
		for (const [indexKey, roleId] of Object.entries(group)) {
			const index = Number(indexKey);
			if (!Number.isInteger(index) || typeof roleId !== 'string' || roleId.length === 0) continue;
			nextGroup[index] = roleId;
		}
		if (Object.keys(nextGroup).length > 0) cloned[hw] = nextGroup;
	}
	return cloned;
}

export function normalizeVirtualChannelRoles(
	raw: unknown,
	virtualChannelMap: Record<number, number> | undefined,
	hwChannelCount: number,
	allowedRoleIds: readonly string[]
): VirtualChannelRoleMap {
	if (!raw || typeof raw !== 'object' || allowedRoleIds.length === 0) return {};
	const allowed = new Set(allowedRoleIds);
	const source = raw as Record<string, unknown>;
	const normalized: VirtualChannelRoleMap = {};
	for (let hw = 0; hw < hwChannelCount; hw++) {
		const count = clampVirtualChannelCount(virtualChannelMap?.[hw]);
		if (count <= 1) continue;
		const groupRaw = source[hw] ?? source[String(hw)];
		if (!groupRaw || typeof groupRaw !== 'object') continue;
		const groupSource = groupRaw as Record<string, unknown>;
		const group: Record<number, string> = {};
		const usedRoles = new Set<string>();
		for (let index = 0; index < count; index++) {
			const roleId = groupSource[index] ?? groupSource[String(index)];
			if (typeof roleId !== 'string' || !allowed.has(roleId) || usedRoles.has(roleId)) continue;
			usedRoles.add(roleId);
			group[index] = roleId;
		}
		if (Object.keys(group).length > 0) normalized[hw] = group;
	}
	return normalized;
}

export function toggleVirtualChannelRole(
	roles: VirtualChannelRoleMap | undefined,
	hwIndex: number,
	indexInGroup: number,
	roleId: string
): VirtualChannelRoleMap {
	const next = cloneVirtualChannelRoles(roles);
	const group = { ...(next[hwIndex] ?? {}) };
	if (group[indexInGroup] === roleId) {
		delete group[indexInGroup];
	} else {
		for (const key of Object.keys(group)) {
			if (group[Number(key)] === roleId) delete group[Number(key)];
		}
		group[indexInGroup] = roleId;
	}
	if (Object.keys(group).length === 0) delete next[hwIndex];
	else next[hwIndex] = group;
	return next;
}

export function shiftVirtualChannelRolesForRemoval(
	roles: VirtualChannelRoleMap | undefined,
	hwIndex: number,
	removedIndexInGroup: number,
	remainingCount: number
): VirtualChannelRoleMap {
	const next = cloneVirtualChannelRoles(roles);
	if (remainingCount <= 1) {
		delete next[hwIndex];
		return next;
	}
	const group = next[hwIndex];
	if (!group) return next;
	const shifted: Record<number, string> = {};
	for (const [key, roleId] of Object.entries(group)) {
		const index = Number(key);
		if (!Number.isInteger(index) || index === removedIndexInGroup) continue;
		const nextIndex = index > removedIndexInGroup ? index - 1 : index;
		if (nextIndex < 0 || nextIndex >= remainingCount) continue;
		shifted[nextIndex] = roleId;
	}
	if (Object.keys(shifted).length === 0) delete next[hwIndex];
	else next[hwIndex] = shifted;
	return next;
}

export function virtualChannelRoleMarks(
	channelCount: number,
	hwLabels: string[],
	virtualChannelMap: Record<number, number> | undefined,
	virtualChannelRoles: VirtualChannelRoleMap | undefined,
	roleDefinitions: readonly VirtualChannelRoleMarkSource[] | undefined
): (string | null)[] {
	const marks = Array.from({ length: channelCount }, () => null as string | null);
	if (!roleDefinitions || roleDefinitions.length === 0) return marks;
	const groups = getVirtualChannelGroups(hwLabels, virtualChannelMap ?? {});
	for (const group of groups) {
		const groupRoles = virtualChannelRoles?.[group.hardwareChannelIndex];
		if (!groupRoles) continue;
		group.virtualChannelIndices.forEach((flatIndex, indexInGroup) => {
			if (flatIndex < 0 || flatIndex >= marks.length) return;
			const roleId = groupRoles[indexInGroup];
			const definition = roleDefinitions.find((role) => role.id === roleId);
			if (definition) marks[flatIndex] = definition.headerMark;
		});
	}
	return marks;
}
