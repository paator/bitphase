import { describe, it, expect } from 'vitest';
import {
	computeEffectiveChannelLabels,
	getHardwareChannelIndex,
	getVirtualChannelGroups,
	getVirtualIndicesForHardwareChannel,
	getTotalVirtualChannelCount,
	hasVirtualChannels
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
		expect(getTotalVirtualChannelCount(3, { 1: 4 })).toBe(6);
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
