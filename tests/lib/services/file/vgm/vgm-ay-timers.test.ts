import { describe, expect, it } from 'vitest';
import {
	collectOwnedAyRegisters,
	createAyTimerRuntime,
	expandAyFrameTimerWrites,
	samplesForTimerPeriod
} from '@/lib/services/file/vgm/vgm-ay-timers';
import type { SongCaptureFrame } from '@/lib/services/file/ay/ay-export-utils';

const CHIP_HZ = 2_000_000;

function emptyFrame(overrides: Partial<SongCaptureFrame> = {}): SongCaptureFrame {
	const disabledSid = {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseVolume: 0,
		waveform: [] as number[],
		waveformLoop: 0
	};
	const disabledSync = {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		waveform: [] as number[],
		waveformLoop: 0
	};
	const disabledFm = {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseTonePeriod: 0,
		fmOffsetMode: 'semitone' as const,
		waveform: [] as number[],
		waveformLoop: 0
	};
	const disabledEnvFm = {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseEnvelopePeriod: 0,
		fmOffsetMode: 'semitone' as const,
		waveform: [] as number[],
		waveformLoop: 0
	};
	return {
		registers: new Array(14).fill(0),
		sid: [disabledSid, { ...disabledSid }, { ...disabledSid }],
		syncbuzzer: [disabledSync, { ...disabledSync }, { ...disabledSync }],
		fm: [disabledFm, { ...disabledFm }, { ...disabledFm }],
		envFm: [disabledEnvFm, { ...disabledEnvFm }, { ...disabledEnvFm }],
		sample: [
			{
				enabled: false,
				hardwareChannelIndex: 0,
				instrumentIndex: -1,
				position: 0,
				phase: 0,
				effectiveTone: 0
			},
			{
				enabled: false,
				hardwareChannelIndex: 1,
				instrumentIndex: -1,
				position: 0,
				phase: 0,
				effectiveTone: 0
			},
			{
				enabled: false,
				hardwareChannelIndex: 2,
				instrumentIndex: -1,
				position: 0,
				phase: 0,
				effectiveTone: 0
			}
		],
		...overrides
	};
}

describe('vgm-ay-timers', () => {
	it('maps YM period to VGM samples at chip/(8*period) Hz', () => {
		expect(samplesForTimerPeriod(100, CHIP_HZ)).toBeCloseTo((44100 * 8 * 100) / CHIP_HZ);
	});

	it('emits SID step 0 at frame start and later steps mid-frame', () => {
		const runtime = createAyTimerRuntime();
		const frame = emptyFrame({
			sid: [
				{
					enabled: true,
					pwm: false,
					period: 100,
					periodLow: 100,
					baseVolume: 15,
					waveform: [15, 0],
					waveformLoop: 0
				},
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseVolume: 0,
					waveform: [],
					waveformLoop: 0
				},
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseVolume: 0,
					waveform: [],
					waveformLoop: 0
				}
			]
		});

		const stepSamples = samplesForTimerPeriod(100, CHIP_HZ);
		const frameStart = 0;
		const frameEnd = stepSamples * 3;
		const writes = expandAyFrameTimerWrites(frame, runtime, CHIP_HZ, frameStart, frameEnd);

		expect(writes[0]).toMatchObject({ sample: 0, register: 8, value: 15 });
		const mid = writes.filter((write) => write.sample > 0);
		expect(mid.length).toBeGreaterThanOrEqual(1);
		expect(mid[0]?.register).toBe(8);
		expect(mid[0]?.value).toBe(0);
		expect(mid[0]?.sample).toBe(Math.round(stepSamples));
	});

	it('keeps SID phase across frames', () => {
		const runtime = createAyTimerRuntime();
		const sid = {
			enabled: true,
			pwm: false,
			period: 50,
			periodLow: 50,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const frame = emptyFrame({
			sid: [
				sid,
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseVolume: 0,
					waveform: [],
					waveformLoop: 0
				},
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseVolume: 0,
					waveform: [],
					waveformLoop: 0
				}
			]
		});
		const stepSamples = samplesForTimerPeriod(50, CHIP_HZ);
		const first = expandAyFrameTimerWrites(frame, runtime, CHIP_HZ, 0, stepSamples * 0.6);
		expect(first.some((write) => write.sample === 0 && write.value === 15)).toBe(true);
		const second = expandAyFrameTimerWrites(
			frame,
			runtime,
			CHIP_HZ,
			Math.floor(stepSamples * 0.6),
			Math.floor(stepSamples * 1.2)
		);
		expect(second.some((write) => write.value === 0)).toBe(true);
	});

	it('marks SID/FM/EnvFM/syncbuzzer regs as owned', () => {
		const frame = emptyFrame({
			sid: [
				{
					enabled: true,
					pwm: false,
					period: 10,
					periodLow: 10,
					baseVolume: 15,
					waveform: [15],
					waveformLoop: 0
				},
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseVolume: 0,
					waveform: [],
					waveformLoop: 0
				},
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseVolume: 0,
					waveform: [],
					waveformLoop: 0
				}
			],
			fm: [
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseTonePeriod: 1,
					fmOffsetMode: 'semitone',
					waveform: [],
					waveformLoop: 0
				},
				{
					enabled: true,
					pwm: false,
					period: 10,
					periodLow: 10,
					baseTonePeriod: 100,
					fmOffsetMode: 'semitone',
					waveform: [0],
					waveformLoop: 0
				},
				{
					enabled: false,
					pwm: false,
					period: 0,
					periodLow: 0,
					baseTonePeriod: 1,
					fmOffsetMode: 'semitone',
					waveform: [],
					waveformLoop: 0
				}
			]
		});
		const owned = collectOwnedAyRegisters(frame);
		expect(owned.has(8)).toBe(true);
		expect(owned.has(2)).toBe(true);
		expect(owned.has(3)).toBe(true);
	});
});
