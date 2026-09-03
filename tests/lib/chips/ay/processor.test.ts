import { describe, it, expect } from 'vitest';
import { sanitizeInstrumentForWorklet } from '@/lib/chips/ay/processor';
import { decodeTimerWaveform } from '@/lib/chips/ay/ay-timer-macros';
import { legacyInstrument } from '../../../helpers/instrument-fixtures';
import { MAX_INSTRUMENT_SAMPLE_BYTES } from '@/lib/utils/audio-sample-decode';

describe('sanitizeInstrumentForWorklet', () => {
	it('includes pwm fields for preview playback', () => {
		const instrument = legacyInstrument({
			rows: [{ tone: true, noise: false, envelope: false, volume: 15 }],
			timerRows: [{ sid: true, timerWaveform: [15, 0] }],
			timerPwmDuty: 25,
			timerPwmSweepMin: 5,
			timerPwmSweep: 3,
			timerPwmPreserveOnNewNote: true,
			timerPwmSweepStartPhase: 500,
			timerPwmSweepShape: 'sine'
		});

		const sanitized = sanitizeInstrumentForWorklet(instrument);

		expect(sanitized.timerPwmDuty).toBe(25);
		expect(sanitized.timerPwmSweepMin).toBe(5);
		expect(sanitized.timerPwmSweep).toBe(3);
		expect(sanitized.timerPwmPreserveOnNewNote).toBe(true);
		expect(sanitized.timerPwmSweepStartPhase).toBe(500);
		expect(sanitized.timerPwmSweepShape).toBe('sine');
		expect(decodeTimerWaveform(sanitized.timerMacros?.timerWaveform?.values[0] ?? '')).toEqual([
			15, 0
		]);
	});

	it('includes sample data for worklet playback', () => {
		const instrument = legacyInstrument({ id: '02', rows: [] });
		const extended = instrument as typeof instrument & { sampleData?: number[]; sampleRate?: number };
		extended.sampleData = [0, 128, 255];
		extended.sampleRate = 22_050;

		const sanitized = sanitizeInstrumentForWorklet(instrument);

		expect(sanitized.sampleData).toEqual([0, 128, 255]);
		expect(sanitized.sampleRate).toBe(22_050);
		expect(sanitized.sampleStart).toBe(0);
		expect(sanitized.sampleEnd).toBe(2);
		expect(sanitized.sampleLoopStart).toBe(0);
		expect(sanitized.sampleLoopEnabled).toBe(true);
	});

	it('preserves sampleLoopEnabled false for the worklet', () => {
		const instrument = legacyInstrument({ id: '04', rows: [] });
		const extended = instrument as typeof instrument & {
			sampleData?: number[];
			sampleLoopEnabled?: boolean;
		};
		extended.sampleData = [1, 2, 3];
		extended.sampleLoopEnabled = false;

		const sanitized = sanitizeInstrumentForWorklet(instrument);

		expect(sanitized.sampleLoopEnabled).toBe(false);
	});

	it('omits oversized 8-bit mono sample data for the worklet', () => {
		const instrument = legacyInstrument({ id: '03', rows: [] });
		const extended = instrument as typeof instrument & { sampleData?: number[] };
		extended.sampleData = Array.from({ length: MAX_INSTRUMENT_SAMPLE_BYTES + 50 }, () => 64);

		const sanitized = sanitizeInstrumentForWorklet(instrument);

		expect(sanitized.sampleData).toBeUndefined();
	});
});
