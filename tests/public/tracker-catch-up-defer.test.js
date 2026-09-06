import { describe, expect, it, vi } from 'vitest';
import { NesWorkletSlot } from '../../public/nes/nes-worklet-slot.js';

const pattern = {
	id: 49,
	length: 4,
	patternRows: [{}, {}, {}, {}],
	channels: [{ rows: [{}, {}, {}, {}] }]
};

function createSlot() {
	const slot = new NesWorkletSlot({ postMessage() {} }, 0);
	slot.initialized = true;
	slot.state.wasmModule = {};
	slot.state.apuPtr = 1;
	slot.state.timeline.samplesPerTick = 8;
	slot.audioDriver = {
		processInstruments: vi.fn(),
		advancePulseWidthTable: vi.fn(),
		advanceSweepTable: vi.fn(),
		syncSweepTableRegisterState: vi.fn(),
		_silenceChannel() {},
		resizeChannels() {},
		resetChannelMixerState() {}
	};
	slot.patternProcessor = {
		parsePatternRow: vi.fn(),
		processSpeedTable: vi.fn(),
		processTables: vi.fn(),
		processArpeggio: vi.fn(),
		processEffectTables: vi.fn(),
		processVibrato: vi.fn(),
		processSlides: vi.fn()
	};
	slot.apuEngine = {
		reset: vi.fn(),
		applyRegisterState: vi.fn()
	};
	return slot;
}

describe('play catch-up', () => {
	it('starts immediately when there is no catch-up and primes the first instrument tick', () => {
		const slot = createSlot();
		slot.handlePlayFromPosition({
			catchUpSegments: [],
			startPattern: pattern,
			startPatternOrderIndex: 0,
			startRow: 0,
			speed: 3
		});

		expect(slot.hasPendingCatchUp()).toBe(false);
		expect(slot.shouldRunPlaybackAccumulation()).toBe(true);
		expect(slot.audioDriver.processInstruments).toHaveBeenCalledTimes(1);
		expect(slot.state.timeline.tickAccumulator).toBe(0);
	});

	it('does not simulate song catch-up on the play message', () => {
		const slot = createSlot();
		slot.handlePlayFromPosition({
			catchUpSegments: [{ pattern, patternOrderIndex: 0, numRows: 3 }],
			startPattern: pattern,
			startPatternOrderIndex: 1,
			startRow: 0,
			speed: 3
		});

		expect(slot.hasPendingCatchUp()).toBe(true);
		expect(slot.patternProcessor.parsePatternRow).not.toHaveBeenCalled();
		expect(slot.shouldRunPlaybackAccumulation()).toBe(false);
	});

	it('replays catch-up across audio blocks then starts the requested row', () => {
		const slot = createSlot();
		slot.handlePlayFromPosition({
			catchUpSegments: [{ pattern, patternOrderIndex: 0, numRows: 3 }],
			startPattern: pattern,
			startPatternOrderIndex: 1,
			startRow: 0,
			speed: 3
		});

		slot.advanceCatchUp(2);
		expect(slot.hasPendingCatchUp()).toBe(true);
		expect(slot.patternProcessor.parsePatternRow).toHaveBeenCalledTimes(2);

		slot.advanceCatchUp(2);
		expect(slot.hasPendingCatchUp()).toBe(false);
		expect(slot.state.timeline.currentPatternOrderIndex).toBe(1);
		expect(slot.state.timeline.currentRow).toBe(0);
		expect(slot.patternProcessor.parsePatternRow).toHaveBeenCalledTimes(4);
		expect(slot.shouldRunPlaybackAccumulation()).toBe(true);
		expect(slot.state.timeline.tickAccumulator).toBe(0);
	});
});
