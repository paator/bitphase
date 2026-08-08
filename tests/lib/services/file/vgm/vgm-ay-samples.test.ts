import { describe, expect, it } from 'vitest';
import { createDisabledTimerCaptureStates } from '@/lib/services/file/ay/ay-export-utils';
import { expandAyFrameSampleWrites } from '@/lib/services/file/vgm/vgm-ay-samples';
import { collectOwnedAyRegisters, expandAyFrameTimerWrites, createAyTimerRuntime } from '@/lib/services/file/vgm/vgm-ay-timers';
import type { SongCaptureFrame } from '@/lib/services/file/ay/ay-export-utils';

const CHIP_HZ = 1_773_400;

function frameWithSample(partial: Partial<SongCaptureFrame['sample'][0]> = {}): SongCaptureFrame {
	const disabled = createDisabledTimerCaptureStates();
	return {
		registers: new Array(14).fill(0),
		...disabled,
		sid: [
			{
				enabled: true,
				pwm: false,
				period: 5,
				periodLow: 5,
				baseVolume: 15,
				waveform: [15, 0],
				waveformLoop: 0
			},
			disabled.sid[1]!,
			disabled.sid[2]!
		],
		sample: [
			{
				enabled: true,
				hardwareChannelIndex: 0,
				instrumentIndex: 0,
				position: 0,
				phase: 0,
				effectiveTone: CHIP_HZ / (16 * 261.63),
				...partial
			},
			disabled.sample[1]!,
			disabled.sample[2]!
		]
	};
}

describe('vgm-ay-samples', () => {
	it('owns volume register while digi sample is active', () => {
		const frame = frameWithSample();
		expect(collectOwnedAyRegisters(frame).has(8)).toBe(true);
	});

	it('skips SID timer stepping when digi sample owns the channel', () => {
		const runtime = createAyTimerRuntime();
		const frame = frameWithSample();
		const writes = expandAyFrameTimerWrites(frame, runtime, CHIP_HZ, 0, 882);
		expect(writes.every((write) => write.register !== 8)).toBe(true);
	});

	it('emits volume nibbles as the sample advances', () => {
		const frame = frameWithSample();
		const instruments = [
			{
				sampleData: [0, 128, 255],
				sampleRate: 44100,
				sampleStart: 0,
				sampleEnd: 2,
				sampleLoopStart: 0,
				sampleLoopEnabled: true
			}
		];
		const writes = expandAyFrameSampleWrites(frame, instruments, CHIP_HZ, false, 0, 4);
		expect(writes.length).toBeGreaterThan(0);
		expect(writes[0]).toMatchObject({ sample: 0, register: 8 });
		expect(writes.every((write) => write.register === 8)).toBe(true);
		expect(writes.every((write) => write.value >= 0 && write.value <= 15)).toBe(true);
	});

	it('scales digi volumes by SID base volume (pattern volume)', () => {
		const frame = frameWithSample();
		frame.sid[0] = {
			enabled: true,
			pwm: false,
			period: 5,
			periodLow: 5,
			baseVolume: 8,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const instruments = [
			{
				sampleData: [255],
				sampleRate: 44100,
				sampleStart: 0,
				sampleEnd: 0,
				sampleLoopStart: 0,
				sampleLoopEnabled: true
			}
		];
		const writes = expandAyFrameSampleWrites(frame, instruments, CHIP_HZ, false, 0, 2);
		expect(writes[0]?.value).toBe(8);
	});

	it('writes silence when a non-looping sample ends mid-frame', () => {
		const frame = frameWithSample({ position: 2, phase: 0.99 });
		const instruments = [
			{
				sampleData: [255, 255, 255],
				sampleRate: 44100,
				sampleStart: 0,
				sampleEnd: 2,
				sampleLoopStart: 0,
				sampleLoopEnabled: false
			}
		];
		const writes = expandAyFrameSampleWrites(frame, instruments, CHIP_HZ, false, 0, 8);
		expect(writes.some((write) => write.value === 0)).toBe(true);
	});
});
