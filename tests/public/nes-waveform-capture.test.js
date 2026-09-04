import {
	normalizeNesChannelWaveformSample,
	noiseScopeSampleFromEmulatorLevel,
	noiseChannelLevelFromEmulator,
	noiseScopeSampleFromChannel,
	NesWaveformCapture
} from '../../public/nes/nes-waveform-capture.js';

describe('NesWaveformCapture', () => {
	it('normalizes emulator channel output around zero', () => {
		expect(normalizeNesChannelWaveformSample(0, 0)).toBe(-0.5);
		expect(normalizeNesChannelWaveformSample(0, 15)).toBe(0.5);
		expect(normalizeNesChannelWaveformSample(0, 7)).toBeCloseTo(-0.033333, 5);
	});

	it('turns anti-aliased noise emulator levels into a visible bipolar scope trace', () => {
		expect(noiseScopeSampleFromEmulatorLevel(0)).toBe(0);
		expect(noiseScopeSampleFromEmulatorLevel(7.5, () => 0)).toBeCloseTo(0.25);
		expect(noiseScopeSampleFromEmulatorLevel(7.5, () => 1)).toBeCloseTo(-0.25);
		expect(noiseScopeSampleFromEmulatorLevel(15, () => 0)).toBeCloseTo(0.5);
	});

	it('uses envelope/anti-aliased emulator output for the noise volume bar', () => {
		expect(noiseChannelLevelFromEmulator(0, { enabled: false, volume: 0 })).toBe(0);
		expect(noiseChannelLevelFromEmulator(7.5, { enabled: false, volume: 0 })).toBeCloseTo(1);
		expect(noiseChannelLevelFromEmulator(0, { enabled: true, volume: 0, volumeReg: -1 })).toBe(
			1
		);
		expect(
			noiseChannelLevelFromEmulator(0, { enabled: true, volume: 0, volumeReg: 0x1c })
		).toBeCloseTo(12 / 15);
	});

	it('draws noise scope from the same level source as the volume bar', () => {
		expect(noiseScopeSampleFromChannel(0, { enabled: false, volume: 0 }, () => 0)).toBe(0);
		expect(
			noiseScopeSampleFromChannel(0, { enabled: true, volume: 0, volumeReg: 0x1c }, () => 0)
		).toBeCloseTo(0.4);
		expect(
			noiseScopeSampleFromChannel(7.5, { enabled: false, volume: 0 }, () => 1)
		).toBeCloseTo(-0.5);
	});

	it('uses the noise scope helper for emulator channel 3', () => {
		const capture = new NesWaveformCapture(5);
		let flip = false;
		const apuEngine = {
			canReadChannelOutputs: () => true,
			getChannelRawOut: (channelIndex) => {
				if (channelIndex === 0) return 15;
				if (channelIndex === 3) return 12;
				return 0;
			}
		};
		const originalRandom = Math.random;
		Math.random = () => {
			flip = !flip;
			return flip ? 0 : 1;
		};
		try {
			const outputs = capture.readChannelOutputs(apuEngine);
			expect(outputs[0]).toBe(0.5);
			expect(outputs[1]).toBe(-0.5);
			expect(Math.abs(outputs[3])).toBeCloseTo(0.4);
		} finally {
			Math.random = originalRandom;
		}
	});
});
