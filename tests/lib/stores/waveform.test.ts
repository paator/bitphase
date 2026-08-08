import { describe, expect, it } from 'vitest';
import { waveformStore } from '@/lib/stores/waveform.svelte';

describe('WaveformStore', () => {
	it('keeps oscilloscope slot alignment when only a later chip sends preview data', () => {
		waveformStore.clear();
		waveformStore.prepareLayout([3, 5]);
		waveformStore.setChannels(
			1,
			Array.from({ length: 5 }, () => new Float32Array(512))
		);

		expect(waveformStore.channels).toHaveLength(8);
	});

	it('collapses channel indices without a prepared layout', () => {
		waveformStore.clear();
		waveformStore.setChannels(
			1,
			Array.from({ length: 5 }, () => new Float32Array(512))
		);

		expect(waveformStore.channels).toHaveLength(5);
	});

	it('returns zero-filled channels for chips without data after prepareLayout', () => {
		waveformStore.clear();
		waveformStore.prepareLayout([3, 2]);

		expect(waveformStore.channels).toHaveLength(5);
		expect(waveformStore.channels.every((channel) => channel[0] === 0)).toBe(true);
	});

	it('stores editor channel levels independently of hardware waveform peaks', () => {
		waveformStore.clear();
		waveformStore.setChannelLevels(0, [0.2, 0.8, 0, 1.5, -0.1]);

		expect(waveformStore.getChannelLevels(0)).toEqual([0.2, 0.8, 0, 1, 0]);
	});
});
