import { describe, expect, it } from 'vitest';
import { convertPT3ToVT2 } from '@/lib/services/file/modules/pt3-to-vt2';
import { convertVT2String } from '@/lib/services/file/modules/vt-converter';

function signedNoiseByte(offset: number): number {
	const bits = offset < 0 ? (offset + 32) & 0x1f : offset & 0x1f;
	return (bits << 1) | 1;
}

function minimalPt3(sampleTicks: number[][]): Uint8Array {
	const data = new Uint8Array(0x200);
	const magic = 'ProTracker 3.6';
	for (let i = 0; i < magic.length; i++) data[i] = magic.charCodeAt(i);
	data[0x64] = 3;
	data[0xc9] = 0xff;

	const sampleAt = 0x100;
	data[0x6b] = sampleAt & 0xff;
	data[0x6c] = sampleAt >> 8;
	data[sampleAt] = 0;
	data[sampleAt + 1] = sampleTicks.length;
	sampleTicks.forEach((tick, index) => {
		const off = sampleAt + 2 + index * 4;
		tick.forEach((byte, byteIndex) => {
			data[off + byteIndex] = byte;
		});
	});
	return data;
}

describe('PT3 sample noise and envelope offset', () => {
	it('sign-extends the 5-bit offset before writing the VT2 sample', () => {
		const volumeAndMix = 0x0f;
		const pt3 = minimalPt3([
			[signedNoiseByte(4), volumeAndMix, 0, 0],
			[signedNoiseByte(15), volumeAndMix, 0, 0],
			[signedNoiseByte(-1), volumeAndMix, 0, 0],
			[signedNoiseByte(-4), volumeAndMix, 0, 0],
			[signedNoiseByte(-16), volumeAndMix, 0, 0]
		]);

		const vt2 = convertPT3ToVT2(pt3.buffer);
		const sample = vt2.split('[Sample1]')[1]?.split('[Sample2]')[0]?.trim().split('\n') ?? [];

		expect(sample).toEqual([
			'TN. +000_ +04_ F_ L',
			'TN. +000_ +0F_ F_',
			'TN. +000_ -01_ F_',
			'TN. +000_ -04_ F_',
			'TN. +000_ -10_ F_'
		]);

		const project = convertVT2String(vt2);
		const instrument = project.instruments.find((entry) => entry.id === '01');
		expect(instrument?.macros?.noiseAdd?.values).toEqual([4, 15, -1, -4, -16]);
		expect(instrument?.macros?.envelopeAdd?.values).toEqual([4, 15, -1, -4, -16]);
	});
});
