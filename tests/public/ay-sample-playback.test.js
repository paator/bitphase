import { describe, it, expect } from 'vitest';
import {
	instrumentHasSample,
	computeSampleSidPeriod,
	advanceSamplePosition,
	mapSampleByteAtPosition,
	resolveSamplePlaybackBounds,
	resetChannelSamplePlayback,
	resolveSamplePitchReferencePeriod
} from '../../public/ay/ay-sample-playback.js';

const DEFAULT_CLOCK_HZ = 1_773_400;
const REFERENCE_PERIOD = resolveSamplePitchReferencePeriod(DEFAULT_CLOCK_HZ);

describe('ay-sample-playback', () => {
	it('detects instruments with sample data', () => {
		expect(instrumentHasSample({ sampleData: [128] })).toBe(true);
		expect(instrumentHasSample({ sampleData: [] })).toBe(false);
		expect(instrumentHasSample(null)).toBe(false);
	});

	it('computes SID period from clock and sample rate', () => {
		expect(computeSampleSidPeriod(1_773_400, 44_100)).toBe(5);
	});

	it('resolves separate play and loop bounds', () => {
		const bounds = resolveSamplePlaybackBounds({
			sampleData: [0, 1, 2, 3, 4],
			sampleStart: 0,
			sampleEnd: 4,
			sampleLoopStart: 2
		});
		expect(bounds).toEqual({
			start: 0,
			end: 4,
			loopStart: 2,
			length: 5,
			dataLength: 5
		});
	});

	it('plays from sample start before advancing', () => {
		const state = {
			isYM: 0,
			aymFrequency: DEFAULT_CLOCK_HZ,
			channelSamplePositions: [0],
			channelSamplePhase: [0]
		};
		const instrument = {
			sampleData: [0, 128, 255, 64],
			sampleRate: 3,
			sampleStart: 0,
			sampleEnd: 2,
			sampleLoopStart: 1
		};
		const first = advanceSamplePosition(state, 0, instrument, 3, REFERENCE_PERIOD);
		expect(first.active).toBe(true);
		expect(state.channelSamplePositions[0]).toBe(1);
	});

	it('loops from loop start after reaching sample end', () => {
		const state = {
			isYM: 0,
			aymFrequency: DEFAULT_CLOCK_HZ,
			channelSamplePositions: [3],
			channelSamplePhase: [0]
		};
		const instrument = {
			sampleData: [0, 64, 128, 192],
			sampleRate: 10,
			sampleStart: 0,
			sampleEnd: 3,
			sampleLoopStart: 2
		};
		const result = advanceSamplePosition(state, 0, instrument, 10, REFERENCE_PERIOD);
		expect(result.active).toBe(true);
		expect(state.channelSamplePositions[0]).toBe(2);
	});

	it('stops at sample end when looping is disabled', () => {
		const state = {
			isYM: 0,
			aymFrequency: DEFAULT_CLOCK_HZ,
			channelSamplePositions: [2],
			channelSamplePhase: [0]
		};
		const instrument = {
			sampleData: [0, 64, 128, 192],
			sampleRate: 10,
			sampleStart: 1,
			sampleEnd: 2,
			sampleLoopStart: 1,
			sampleLoopEnabled: false
		};
		const result = advanceSamplePosition(state, 0, instrument, 10, REFERENCE_PERIOD);
		expect(result.active).toBe(false);
		expect(state.channelSamplePositions[0]).toBe(3);
	});

	it('resets playback to sample start on a new note', () => {
		const state = {
			isYM: 0,
			channelSamplePositions: [3],
			channelSamplePhase: [0.5]
		};
		const instrument = {
			sampleData: [0, 1, 2, 3],
			sampleStart: 1,
			sampleEnd: 2,
			sampleLoopStart: 2
		};
		resetChannelSamplePlayback(state, 0, instrument);
		expect(state.channelSamplePositions[0]).toBe(1);
		expect(state.channelSamplePhase[0]).toBe(0);
	});

	it('maps sample bytes through the AY lookup', () => {
		const instrument = { sampleData: [255] };
		expect(mapSampleByteAtPosition(instrument, 0, 0)).toBe(15);
	});

	it('advances one sample byte per output frame when rates match at reference pitch', () => {
		const state = {
			isYM: 0,
			aymFrequency: DEFAULT_CLOCK_HZ,
			channelSamplePositions: [0],
			channelSamplePhase: [0]
		};
		const instrument = {
			sampleData: new Array(100).fill(128),
			sampleRate: 100,
			sampleStart: 0,
			sampleEnd: 99,
			sampleLoopStart: 0
		};

		for (let i = 0; i < 25; i++) {
			advanceSamplePosition(state, 0, instrument, 100, REFERENCE_PERIOD);
		}

		expect(state.channelSamplePositions[0]).toBe(25);
		expect(state.channelSamplePhase[0]).toBeCloseTo(0, 5);
	});

	it('plays faster on tuning tables with lower C-4 period', () => {
		const state = {
			isYM: 0,
			aymFrequency: DEFAULT_CLOCK_HZ,
			channelSamplePositions: [0, 0],
			channelSamplePhase: [0, 0]
		};
		const instrument = {
			sampleData: new Array(100).fill(128),
			sampleRate: 100,
			sampleStart: 0,
			sampleEnd: 99,
			sampleLoopStart: 0
		};
		const pt3C4Period = 411;
		const naturalC4Period = 360;

		for (let i = 0; i < 50; i++) {
			advanceSamplePosition(state, 0, instrument, 100, pt3C4Period);
			advanceSamplePosition(state, 1, instrument, 100, naturalC4Period);
		}

		expect(state.channelSamplePositions[1]).toBeGreaterThan(state.channelSamplePositions[0]);
	});

	it('scales playback speed with output sample rate', () => {
		const state = {
			isYM: 0,
			aymFrequency: DEFAULT_CLOCK_HZ,
			channelSamplePositions: [0],
			channelSamplePhase: [0]
		};
		const instrument = {
			sampleData: new Array(1_000).fill(128),
			sampleRate: 8_000,
			sampleStart: 0,
			sampleEnd: 999,
			sampleLoopStart: 0
		};

		for (let i = 0; i < 4_410; i++) {
			advanceSamplePosition(state, 0, instrument, 44_100, REFERENCE_PERIOD);
		}

		expect(state.channelSamplePositions[0]).toBe(800);
		expect(state.channelSamplePhase[0]).toBeCloseTo(0, 5);
	});
});
