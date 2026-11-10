import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PianoTimelineBlock } from '@/lib/services/piano-roll/piano-roll-timeline';
import { blockPlaceKey, PianoBlockFades } from '@/lib/ui-rendering/piano-roll-block-fades';

function block(localStartRow: number, pitchIndex = 10, patternId = 0): PianoTimelineBlock {
	return {
		startRow: localStartRow,
		endRow: localStartRow + 2,
		localStartRow,
		pitchIndex,
		note: 'C-4',
		instrument: null,
		gestures: [],
		orderIndex: 0,
		patternId
	};
}

describe('piano roll block fades', () => {
	let now = 0;
	let fades: PianoBlockFades;

	beforeEach(() => {
		now = 0;
		vi.stubGlobal('requestAnimationFrame', () => 1);
		vi.stubGlobal('cancelAnimationFrame', () => undefined);
		fades = new PianoBlockFades(
			() => undefined,
			() => now,
			100
		);
	});

	afterEach(() => {
		fades.dispose();
		vi.unstubAllGlobals();
	});

	it('shows blocks of a freshly visible pattern without fading', () => {
		const first = block(0);
		fades.sync([first], [0], 'a');
		expect(fades.presence(first, now)).toBe(1);
		expect(fades.leaving(now)).toEqual([]);
	});

	it('fades a new block in and a removed block out', () => {
		const first = block(0);
		const second = block(4);
		fades.sync([first], [0], 'a');
		fades.sync([first, second], [0], 'a');
		expect(fades.presence(second, 0)).toBe(0);
		expect(fades.presence(second, 100)).toBe(1);
		now = 50;
		fades.sync([second], [0], 'a');
		const leaving = fades.leaving(50);
		expect(leaving.map((item) => blockPlaceKey(item.block))).toEqual([blockPlaceKey(first)]);
		expect(leaving[0]!.presence).toBe(1);
		expect(leaving[0]!.selected).toBe(false);
	});

	it('remembers that a leaving block was selected before it moved', () => {
		const first = block(0);
		const moved = block(1);
		fades.sync([first], [0], 'a');
		fades.sync([first], [0], 'a', [first]);
		fades.sync([moved], [0], 'a', [moved]);
		expect(fades.leaving(now)).toEqual([
			expect.objectContaining({ block: first, selected: true })
		]);
	});

	it('skips fades for moved blocks and for a new scope', () => {
		const first = block(0);
		const moved = block(2);
		fades.sync([first], [0], 'a');
		fades.holdMoved([first]);
		fades.sync([moved], [0], 'a');
		expect(fades.presence(moved, now)).toBe(1);
		expect(fades.leaving(now)).toEqual([]);
		fades.sync([block(6)], [0], 'b');
		expect(fades.presence(block(6), now)).toBe(1);
	});
});
