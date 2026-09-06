import { describe, expect, it, vi } from 'vitest';
import { WorkletSlotBase } from '../../public/tracker/worklet-slot-base.js';

class TestSlot extends WorkletSlotBase {
	primes: number[] = [];
	posted: { type: string; patternOrderIndex?: number }[] = [];
	state = {
		currentPattern: { id: 1, length: 16, channels: [] } as {
			id: number;
			length: number;
			channels: unknown[];
		} | null,
		timeline: {
			currentRow: 0,
			currentTick: 0,
			currentPatternOrderIndex: 0,
			tickAccumulator: 0
		},
		setPattern: (pattern: { id: number; length?: number; channels?: unknown[] }) => {
			this.state.currentPattern = {
				id: pattern.id,
				length: pattern.length ?? 16,
				channels: pattern.channels ?? []
			};
		},
		reset: () => {}
	};

	constructor() {
		super({ postMessage: vi.fn() }, 0);
	}

	_post(data: { type: string; patternOrderIndex?: number }) {
		this.posted.push(data);
	}

	_slotState() {
		return this.state;
	}

	_isReadyForPlayback() {
		return true;
	}

	_afterPlaybackPositionSet(rowIndex: number) {
		this.primes.push(rowIndex);
	}

	_runCatchUpRows(_upToRow: number) {}

	appliedCarry: unknown = null;

	_applyPlaybackCarry(carry: unknown) {
		this.appliedCarry = carry;
	}
}

describe('WorkletSlotBase play from row', () => {
	it('requests the pattern for the start order index', () => {
		const slot = new TestSlot();

		slot.handlePlayFromRow({ row: 0, patternOrderIndex: 0, speed: 3 });

		expect(slot.posted).toContainEqual({
			type: 'request_pattern',
			patternOrderIndex: 0
		});
		expect(slot.primes).toEqual([0]);
	});

	it('requests a pattern when the current order has none', () => {
		const slot = new TestSlot();
		slot.state.currentPattern = null;

		slot.handlePlayFromRow({ row: 0, patternOrderIndex: 2, speed: 3 });

		expect(slot.posted).toContainEqual({
			type: 'request_pattern',
			patternOrderIndex: 2
		});
	});

	it('applies playback carry before priming', () => {
		const slot = new TestSlot();
		const carry = { channelFields: [{ instrument: 1 }], speed: 8 };

		slot.handlePlayFromRow({
			row: 0,
			patternOrderIndex: 0,
			speed: 3,
			carry
		});

		expect(slot.appliedCarry).toEqual(carry);
		expect(slot.primes).toEqual([0]);
	});
});

describe('WorkletSlotBase set pattern data', () => {
	it('does not re-prime the current row unless a pending row is waiting', () => {
		const slot = new TestSlot();
		slot.paused = false;

		slot.handleSetPatternData({
			pattern: { id: 3, channels: [] },
			patternOrderIndex: 0
		});

		expect(slot.primes).toEqual([]);
	});

	it('primes after a pending row arrives during playback', () => {
		const slot = new TestSlot();
		slot.paused = false;
		slot.timelinePattern.pendingRowAfterPatternChange = 0;

		slot.handleSetPatternData({
			pattern: { id: 4, channels: [] },
			patternOrderIndex: 0
		});

		expect(slot.primes).toEqual([0]);
	});
});
