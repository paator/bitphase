import { describe, it, expect } from 'vitest';
import {
	amplitudeToNearestSidStep,
	sidRegisterVolume,
	sidStepToAmplitude,
	SID_WAVEFORM_PREVIEW_BASE_VOLUME
} from '@/lib/chips/ay/sid-waveform-volume';

describe('sid waveform volume curve', () => {
	it('maps step 0 to silence', () => {
		expect(sidStepToAmplitude(0, SID_WAVEFORM_PREVIEW_BASE_VOLUME, 'AY')).toBe(0);
	});

	it('maps step 15 at full base volume to unity on AY', () => {
		expect(sidStepToAmplitude(15, SID_WAVEFORM_PREVIEW_BASE_VOLUME, 'AY')).toBe(1);
	});

	it('uses the same register volume formula as hardware export', () => {
		expect(sidRegisterVolume(7, 10, 'AY')).toBe(4);
		expect(sidRegisterVolume(7, 10, 'YM')).toBe(2);
		expect(sidRegisterVolume(15, 15)).toBe(15);
	});

	it('round-trips default square waveform levels', () => {
		expect(amplitudeToNearestSidStep(1, SID_WAVEFORM_PREVIEW_BASE_VOLUME, 'AY')).toBe(15);
		expect(amplitudeToNearestSidStep(0, SID_WAVEFORM_PREVIEW_BASE_VOLUME, 'AY')).toBe(0);
	});

	it('prefers perceptually closer steps on AY', () => {
		const mid = sidStepToAmplitude(8, SID_WAVEFORM_PREVIEW_BASE_VOLUME, 'AY');
		const nearest = amplitudeToNearestSidStep(mid, SID_WAVEFORM_PREVIEW_BASE_VOLUME, 'AY');
		expect(nearest).toBe(8);
	});
});
