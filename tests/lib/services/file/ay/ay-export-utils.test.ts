import { describe, expect, it } from 'vitest';
import {
	createTaymSampleCaptureTracker,
	extractHardwareTaymSampleStates
} from '@/lib/services/file/ay/ay-export-utils';
import {
	computeSamplePitchScale,
	resolveSamplePitchReferencePeriod
} from '@/lib/chips/ay/sample-region';

const CLOCK = 1_773_400;
const EFFECTIVE_TONE = 424;
const TIMER_EFFECT_KIND_VOLUME = 1;

function registerState(baseVolume = 15) {
	return {
		channels: [
			{
				timerEffects: {
					sid: { enabled: true, kind: TIMER_EFFECT_KIND_VOLUME, baseVolume }
				}
			},
			{ timerEffects: {} },
			{ timerEffects: {} }
		]
	};
}

function sampleState(overrides: Record<string, unknown> = {}) {
	return {
		channelInstruments: [0, -1, -1],
		channelSoundEnabled: [true, false, false],
		channelMuted: [false, false, false],
		channelCurrentNotes: [0, 0, 0],
		currentTuningTable: [EFFECTIVE_TONE],
		channelSamplePositions: [0, 0, 0],
		aymFrequency: CLOCK,
		instruments: [
			{
				sampleData: [10, 20, 30, 40, 50],
				sampleStart: 0,
				sampleEnd: 4,
				sampleLoopStart: 0,
				sampleLoopEnabled: true,
				sampleRate: 8_000
			}
		],
		...overrides
	};
}

describe('extractHardwareTaymSampleStates', () => {
	it('keeps the sample instance when a note does not restart sample playback', () => {
		const tracker = createTaymSampleCaptureTracker();
		const state = sampleState();

		const first = extractHardwareTaymSampleStates(state, registerState(), tracker, CLOCK, [
			true,
			false,
			false
		])[0]!;
		state.channelSamplePositions[0] = 2;
		const portamento = extractHardwareTaymSampleStates(state, registerState(), tracker, CLOCK, [
			false,
			false,
			false
		])[0]!;
		const restart = extractHardwareTaymSampleStates(state, registerState(), tracker, CLOCK, [
			true,
			false,
			false
		])[0]!;

		expect(portamento.instanceId).toBe(first.instanceId);
		expect(portamento.sampleBytes).toEqual(first.sampleBytes);
		expect(restart.instanceId).not.toBe(first.instanceId);
		expect(restart.sampleBytes).toEqual(first.sampleBytes);
	});

	it('rotates exported looped sample lanes around the current sample position', () => {
		const tracker = createTaymSampleCaptureTracker();
		const state = sampleState({
			channelSamplePositions: [2, 0, 0],
			instruments: [
				{
					sampleData: [10, 20, 30, 40, 50],
					sampleStart: 0,
					sampleEnd: 4,
					sampleLoopStart: 1,
					sampleLoopEnabled: true,
					sampleRate: 8_000
				}
			]
		});

		const sample = extractHardwareTaymSampleStates(state, registerState(), tracker, CLOCK, [
			true,
			false,
			false
		])[0]!;

		expect(sample.sampleBytes).toEqual([30, 40, 50, 20, 30, 40, 50]);
		expect(sample.loopIndex).toBe(3);
	});

	it('uses 44.1 kHz as the export fallback for missing sample rates', () => {
		const tracker = createTaymSampleCaptureTracker();
		const state = sampleState({
			instruments: [
				{
					sampleData: [10, 20, 30, 40, 50],
					sampleStart: 0,
					sampleEnd: 4,
					sampleLoopStart: 0,
					sampleLoopEnabled: true
				}
			]
		});

		const sample = extractHardwareTaymSampleStates(state, registerState(), tracker, CLOCK, [
			true,
			false,
			false
		])[0]!;
		const expectedRate =
			44_100 *
			computeSamplePitchScale(resolveSamplePitchReferencePeriod(CLOCK), EFFECTIVE_TONE);

		expect(sample.rateHz).toBeCloseTo(expectedRate);
	});
});
