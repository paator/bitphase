import { describe, it, expect } from 'vitest';
import {
	clampVirtualChannelCount,
	computeEffectiveChannelLabels,
	getHardwareChannelIndex,
	getVirtualChannelGroups,
	getVirtualIndicesForHardwareChannel,
	getTotalVirtualChannelCount,
	hasVirtualChannels,
	MAX_VIRTUAL_CHANNELS_PER_HARDWARE_CHANNEL,
	normalizeVirtualChannelMap,
	normalizeVirtualChannelRoles,
	selectChannelsWithinVirtualLimit,
	shiftVirtualChannelRolesForRemoval,
	toggleVirtualChannelRole,
	virtualChannelRoleMarks
} from '../../../src/lib/models/virtual-channels';

const HW_LABELS = ['A', 'B', 'C'];

describe('computeEffectiveChannelLabels', () => {
	it('should return hardware labels when no virtual channels', () => {
		expect(computeEffectiveChannelLabels(HW_LABELS, {})).toEqual(['A', 'B', 'C']);
	});

	it('should expand a single hardware channel into numbered labels', () => {
		expect(computeEffectiveChannelLabels(HW_LABELS, { 1: 2 })).toEqual([
			'A', 'B1', 'B2', 'C'
		]);
	});

	it('should expand multiple hardware channels', () => {
		expect(computeEffectiveChannelLabels(HW_LABELS, { 0: 3, 2: 2 })).toEqual([
			'A1', 'A2', 'A3', 'B', 'C1', 'C2'
		]);
	});

	it('should treat count of 1 as no virtual channels', () => {
		expect(computeEffectiveChannelLabels(HW_LABELS, { 0: 1, 1: 1, 2: 1 })).toEqual([
			'A', 'B', 'C'
		]);
	});

	it('should cap a hardware channel at 3 virtual channels', () => {
		expect(computeEffectiveChannelLabels(HW_LABELS, { 1: 9 })).toEqual([
			'A', 'B1', 'B2', 'B3', 'C'
		]);
	});
});

describe('getHardwareChannelIndex', () => {
	it('should map virtual index to hardware index with no virtual channels', () => {
		expect(getHardwareChannelIndex(0, HW_LABELS, {})).toBe(0);
		expect(getHardwareChannelIndex(1, HW_LABELS, {})).toBe(1);
		expect(getHardwareChannelIndex(2, HW_LABELS, {})).toBe(2);
	});

	it('should map virtual indices correctly when B is split', () => {
		const map = { 1: 3 };
		expect(getHardwareChannelIndex(0, HW_LABELS, map)).toBe(0);
		expect(getHardwareChannelIndex(1, HW_LABELS, map)).toBe(1);
		expect(getHardwareChannelIndex(2, HW_LABELS, map)).toBe(1);
		expect(getHardwareChannelIndex(3, HW_LABELS, map)).toBe(1);
		expect(getHardwareChannelIndex(4, HW_LABELS, map)).toBe(2);
	});

	it('should clamp out-of-range index to last hardware channel', () => {
		expect(getHardwareChannelIndex(10, HW_LABELS, {})).toBe(2);
	});
});

describe('getVirtualChannelGroups', () => {
	it('should return one group per hardware channel with no virtual channels', () => {
		const groups = getVirtualChannelGroups(HW_LABELS, {});
		expect(groups).toHaveLength(3);
		expect(groups[0]).toEqual({
			hardwareChannelIndex: 0,
			hardwareLabel: 'A',
			virtualChannelIndices: [0],
			virtualLabels: ['A']
		});
	});

	it('should create grouped indices for split channels', () => {
		const groups = getVirtualChannelGroups(HW_LABELS, { 1: 2 });
		expect(groups).toHaveLength(3);
		expect(groups[1]).toEqual({
			hardwareChannelIndex: 1,
			hardwareLabel: 'B',
			virtualChannelIndices: [1, 2],
			virtualLabels: ['B1', 'B2']
		});
		expect(groups[2].virtualChannelIndices).toEqual([3]);
	});

	it('should handle all channels split', () => {
		const groups = getVirtualChannelGroups(HW_LABELS, { 0: 2, 1: 2, 2: 2 });
		expect(groups[0].virtualChannelIndices).toEqual([0, 1]);
		expect(groups[1].virtualChannelIndices).toEqual([2, 3]);
		expect(groups[2].virtualChannelIndices).toEqual([4, 5]);
	});
});

describe('getVirtualIndicesForHardwareChannel', () => {
	it('returns the single index when there are no virtual channels', () => {
		expect(getVirtualIndicesForHardwareChannel(1, HW_LABELS, {})).toEqual([1]);
	});

	it('returns all virtual indices for a split hardware channel', () => {
		expect(getVirtualIndicesForHardwareChannel(0, HW_LABELS, { 0: 2 })).toEqual([0, 1]);
		expect(getVirtualIndicesForHardwareChannel(1, HW_LABELS, { 0: 2 })).toEqual([2]);
		expect(getVirtualIndicesForHardwareChannel(2, HW_LABELS, { 0: 2 })).toEqual([3]);
	});
});

describe('getTotalVirtualChannelCount', () => {
	it('should return hardware count with no virtual channels', () => {
		expect(getTotalVirtualChannelCount(3, {})).toBe(3);
	});

	it('should sum all virtual channel counts', () => {
		expect(getTotalVirtualChannelCount(3, { 0: 2, 1: 3 })).toBe(6);
	});

	it('should treat missing entries as 1', () => {
		expect(getTotalVirtualChannelCount(3, { 1: 2 })).toBe(4);
	});

	it('should cap each hardware channel at the virtual channel limit', () => {
		expect(getTotalVirtualChannelCount(3, { 1: 9 })).toBe(5);
	});
});

describe('virtual channel limit', () => {
	it('clamps counts into the range 1..3', () => {
		expect(MAX_VIRTUAL_CHANNELS_PER_HARDWARE_CHANNEL).toBe(3);
		expect(clampVirtualChannelCount(undefined)).toBe(1);
		expect(clampVirtualChannelCount(0)).toBe(1);
		expect(clampVirtualChannelCount(2.9)).toBe(2);
		expect(clampVirtualChannelCount(3)).toBe(3);
		expect(clampVirtualChannelCount(4)).toBe(3);
	});

	it('drops unsplit channels and caps the stored map', () => {
		expect(normalizeVirtualChannelMap({ 0: 5, 1: 1, 2: 2 }, 3)).toEqual({ 0: 3, 2: 2 });
	});

	it('keeps the first 3 virtual channels in a group and the other hardware channels', () => {
		expect(
			selectChannelsWithinVirtualLimit(
				['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C1', 'C2', 'C3', 'C4'],
				3,
				{ 0: 5, 2: 4 }
			)
		).toEqual(['A1', 'A2', 'A3', 'B', 'C1', 'C2', 'C3']);
	});
});

describe('hasVirtualChannels', () => {
	it('should return false for empty map', () => {
		expect(hasVirtualChannels({})).toBe(false);
	});

	it('should return false when all counts are 1', () => {
		expect(hasVirtualChannels({ 0: 1, 1: 1 })).toBe(false);
	});

	it('should return true when any count exceeds 1', () => {
		expect(hasVirtualChannels({ 0: 1, 1: 2 })).toBe(true);
	});
});

describe('virtual channel roles', () => {
	it('keeps one column per role and toggles it off', () => {
		const on = toggleVirtualChannelRole({}, 0, 1, 'timer');
		expect(on).toEqual({ 0: { 1: 'timer' } });
		const moved = toggleVirtualChannelRole(on, 0, 0, 'timer');
		expect(moved).toEqual({ 0: { 0: 'timer' } });
		expect(toggleVirtualChannelRole(moved, 0, 0, 'timer')).toEqual({});
	});

	it('shifts roles when a column is removed and clears them when one column remains', () => {
		expect(shiftVirtualChannelRolesForRemoval({ 1: { 2: 'timer' } }, 1, 1, 2)).toEqual({
			1: { 1: 'timer' }
		});
		expect(shiftVirtualChannelRolesForRemoval({ 0: { 1: 'timer' } }, 0, 1, 1)).toEqual({});
	});

	it('drops unknown roles and a lone hardware channel', () => {
		expect(
			normalizeVirtualChannelRoles(
				{ 0: { 0: 'nope', 1: 'timer' }, 1: { 0: 'timer' } },
				{ 0: 2 },
				3,
				['timer']
			)
		).toEqual({ 0: { 1: 'timer' } });
	});

	it('marks the header of the column that owns a role', () => {
		expect(
			virtualChannelRoleMarks(4, HW_LABELS, { 0: 2 }, { 0: { 1: 'timer' } }, [
				{ id: 'timer', headerMark: 'Timer' }
			])
		).toEqual([null, 'Timer', null, null]);
	});
});
