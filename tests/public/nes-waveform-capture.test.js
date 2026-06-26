import { describe, expect, it } from 'vitest';
import {
	normalizeNesChannelWaveformSample,
	NesWaveformCapture
} from '../../public/nes/nes-waveform-capture.js';

describe('NesWaveformCapture', () => {
	it('normalizes emulator channel output around zero', () => {
		expect(normalizeNesChannelWaveformSample(0, 0)).toBe(-0.5);
		expect(normalizeNesChannelWaveformSample(0, 15)).toBe(0.5);
		expect(normalizeNesChannelWaveformSample(0, 7)).toBeCloseTo(-0.033333, 5);
	});

	it('prefers emulator channel outputs when available', () => {
		const capture = new NesWaveformCapture(5);
		const apuEngine = {
			canReadChannelOutputs: () => true,
			getChannelRawOut: (channelIndex) => (channelIndex === 0 ? 15 : 0)
		};
		const outputs = capture.readChannelOutputs(apuEngine);
		expect(outputs[0]).toBe(0.5);
		expect(outputs[1]).toBe(-0.5);
	});
});
