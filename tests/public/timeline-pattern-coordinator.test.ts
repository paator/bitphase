import { describe, expect, it, vi } from 'vitest';
import { TimelinePatternCoordinator } from '../../public/tracker/timeline-pattern-coordinator.js';

function createCoordinator(state: {
	currentPattern: { id: number; channels?: unknown[] } | null;
	timeline: { currentPatternOrderIndex: number; currentRow: number; currentTick: number };
	setPattern: (pattern: unknown, orderIndex?: number) => void;
}) {
	return new TimelinePatternCoordinator({
		post: vi.fn(),
		getState: () => state,
		resizeForPatternChannelCount: vi.fn()
	});
}

describe('TimelinePatternCoordinator handleInitPattern', () => {
	it('does not rewind the timeline when a different order index arrives', () => {
		const setPattern = vi.fn();
		const currentPattern = { id: 4, channels: [] };
		const state = {
			currentPattern,
			timeline: {
				currentPatternOrderIndex: 1,
				currentRow: 0,
				currentTick: 0
			},
			setPattern
		};
		const coordinator = createCoordinator(state);

		const applied = coordinator.handleInitPattern({
			pattern: { id: 3, channels: [] },
			patternOrderIndex: 0
		});

		expect(applied).toBe(false);
		expect(setPattern).not.toHaveBeenCalled();
		expect(state.currentPattern).toBe(currentPattern);
		expect(state.timeline.currentPatternOrderIndex).toBe(1);
		expect(coordinator.pendingNextPattern).toEqual({
			pattern: { id: 3, channels: [] },
			orderIndex: 0
		});
	});

	it('applies a pattern for the current order index', () => {
		const nextPattern = { id: 5, channels: [] };
		const state = {
			currentPattern: { id: 4, channels: [] },
			timeline: {
				currentPatternOrderIndex: 1,
				currentRow: 0,
				currentTick: 0
			},
			setPattern: vi.fn(function (this: typeof state, pattern: typeof nextPattern) {
				this.currentPattern = pattern;
			})
		};
		const coordinator = createCoordinator(state);

		const applied = coordinator.handleInitPattern({
			pattern: nextPattern,
			patternOrderIndex: 1
		});

		expect(applied).toBe(true);
		expect(state.setPattern).toHaveBeenCalledWith(nextPattern, 1);
		expect(coordinator.pendingNextPattern).toBeNull();
	});
});

describe('TimelinePatternCoordinator onPatternOrderAdvanced', () => {
	it('applies a pending next pattern without clearing an already loaded current pattern first', () => {
		const nextPattern = { id: 7, channels: [{ rows: [] }] };
		const setPattern = vi.fn();
		const state = {
			currentPattern: { id: 6, channels: [] },
			timeline: {
				currentPatternOrderIndex: 2,
				currentRow: 0,
				currentTick: 0,
				patternOrder: [6, 7, 7]
			},
			setPattern
		};
		const coordinator = createCoordinator(state);
		coordinator.pendingNextPattern = {
			pattern: nextPattern,
			orderIndex: 2
		};

		coordinator.onPatternOrderAdvanced(true);

		expect(setPattern).toHaveBeenCalledWith(nextPattern, 2);
		expect(coordinator.pendingNextPattern).toBeNull();
	});
});
