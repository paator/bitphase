import { describe, expect, it } from 'vitest';
import {
	sampleAyMixerRow,
	sampleAyTimerRow,
	sampleInstrumentMacroIndex,
	sampleNesApuRow
} from '../../public/tracker/tracker-instrument-macros.js';

describe('tracker instrument macros', () => {
	it('matches the TypeScript loop sampler', () => {
		expect(sampleInstrumentMacroIndex(4, 4, 2)).toBe(2);
		expect(sampleInstrumentMacroIndex(4, 4, 0)).toBe(0);
	});

	it('samples AY mixer macros independently of the shared row loop', () => {
		const instrument = {
			macros: {
				volume: { values: [15, 1], loop: 0 },
				tone: { values: [true], loop: 0 },
				envelope: { values: [false, true, true], loop: 1 }
			}
		};
		expect(sampleAyMixerRow(instrument, 0).volume).toBe(15);
		expect(sampleAyMixerRow(instrument, 0).envelope).toBe(false);
		expect(sampleAyMixerRow(instrument, 1).volume).toBe(1);
		expect(sampleAyMixerRow(instrument, 1).envelope).toBe(true);
		expect(sampleAyMixerRow(instrument, 2).volume).toBe(15);
		expect(sampleAyMixerRow(instrument, 2).envelope).toBe(true);
	});

	it('keeps amplitude slide down as a signed enum value', () => {
		const instrument = {
			macros: {
				volume: { values: [15], loop: 0 },
				amplitudeSlide: { values: [0, -1, 1], loop: 0 }
			}
		};
		expect(sampleAyMixerRow(instrument, 0).amplitudeSliding).toBe(false);
		expect(sampleAyMixerRow(instrument, 1).amplitudeSliding).toBe(true);
		expect(sampleAyMixerRow(instrument, 1).amplitudeSlideUp).toBe(false);
		expect(sampleAyMixerRow(instrument, 2).amplitudeSliding).toBe(true);
		expect(sampleAyMixerRow(instrument, 2).amplitudeSlideUp).toBe(true);
	});

	it('samples AY timer macros independently per field', () => {
		const instrument = {
			timerMacros: {
				sid: { values: [true, false], loop: 0 },
				syncbuzzer: { values: [false, false], loop: 0 },
				fm: { values: [false, true, true], loop: 1 },
				fmOffsetMode: { values: [0, 1, 1], loop: 1 },
				fmWaveform: { values: ['[0,7]', '[0,7]', '[0,12]'], loop: 1 },
				envFm: { values: [false], loop: 0 },
				envFmOffsetMode: { values: [0], loop: 0 },
				envFmWaveform: { values: ['[0,7]'], loop: 0 },
				timerWaveform: { values: ['[15,0]', '[15,0]'], loop: 0 },
				semitone: { values: [0], loop: 0 },
				detune: { values: [0], loop: 0 }
			}
		};
		expect(sampleAyTimerRow(instrument, 0).sid).toBe(true);
		expect(sampleAyTimerRow(instrument, 1).sid).toBe(false);
		expect(sampleAyTimerRow(instrument, 2).fm).toBe(true);
		expect(sampleAyTimerRow(instrument, 2).fmWaveform).toEqual([0, 12]);
		expect(sampleAyTimerRow(instrument, 1).fmOffsetMode).toBe('period');
		expect(sampleAyTimerRow(instrument, 2).fmOffsetMode).toBe('period');
		expect(sampleAyTimerRow(instrument, 0).fmOffsetMode).toBe('semitone');
	});

	it('restores inner waveform loops', () => {
		const instrument = {
			timerMacros: {
				sid: { values: [true], loop: 0 },
				timerWaveform: { values: [JSON.stringify({ steps: [15, 8, 0], loop: 1 })], loop: 0 }
			}
		};
		const row = sampleAyTimerRow(instrument, 0);
		expect(row.timerWaveform).toEqual([15, 8, 0]);
		expect(row.timerWaveformLoop).toBe(1);
	});

	it('samples NES macros from stored values', () => {
		const row = sampleNesApuRow(
			{
				macros: {
					pulseWidth: { values: [1, 2], loop: 0 },
					volumeOrRate: { values: [12, 4], loop: 0 },
					retrigger: { values: [true, false], loop: 0 }
				}
			},
			1
		);
		expect(row.pulseWidth).toBe(2);
		expect(row.volumeOrRate).toBe(4);
		expect(row.retrigger).toBe(false);
	});
});
