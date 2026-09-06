import { describe, expect, it } from 'vitest';
import { PlaybackOrderIndexGate } from '../../../../src/lib/services/audio/playback-order-index-gate';

describe('PlaybackOrderIndexGate', () => {
	it('allows every update until an order index is pinned', () => {
		const gate = new PlaybackOrderIndexGate();

		expect(gate.allows(0)).toBe(true);
		expect(gate.allows(3)).toBe(true);
		expect(gate.allows(undefined)).toBe(true);
		expect(gate.consume(3)).toBe(true);
		expect(gate.isPinned()).toBe(false);
	});

	it('drops leftover order indices after a user pin', () => {
		const gate = new PlaybackOrderIndexGate();
		gate.pin(4);

		expect(gate.allows(2)).toBe(false);
		expect(gate.consume(2)).toBe(false);
		expect(gate.allows(undefined)).toBe(false);
		expect(gate.consume(undefined)).toBe(false);
		expect(gate.isPinned()).toBe(true);
	});

	it('releases the pin when the worklet reaches the selected index', () => {
		const gate = new PlaybackOrderIndexGate();
		gate.pin(4);

		expect(gate.consume(4)).toBe(true);
		expect(gate.isPinned()).toBe(false);
		expect(gate.allows(5)).toBe(true);
		expect(gate.consume(5)).toBe(true);
	});

	it('keeps dropping stale indices until the pinned slot arrives', () => {
		const gate = new PlaybackOrderIndexGate();
		gate.pin(7);

		expect(gate.consume(3)).toBe(false);
		expect(gate.consume(6)).toBe(false);
		expect(gate.consume(7)).toBe(true);
		expect(gate.isPinned()).toBe(false);
	});

	it('replaces the pin when the user selects another slot', () => {
		const gate = new PlaybackOrderIndexGate();
		gate.pin(2);
		gate.pin(8);

		expect(gate.consume(2)).toBe(false);
		expect(gate.consume(8)).toBe(true);
		expect(gate.isPinned()).toBe(false);
	});

	it('clears the pin on stop so the next play follows the worklet again', () => {
		const gate = new PlaybackOrderIndexGate();
		gate.pin(1);
		gate.clear();

		expect(gate.isPinned()).toBe(false);
		expect(gate.allows(0)).toBe(true);
	});
});
