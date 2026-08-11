import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PSG_CLOCK_HZ,
	DEFAULT_PSG_FRAME_RATE_HZ,
	importPsgBuffer,
	isPsgBuffer
} from '@/lib/services/file/ay/psg-import';
import { decodePsgFrames, PsgFormatError } from '@/lib/services/file/ay/psg-frames';
import { captureSongRegisterFrames, generatePSGBuffer } from '@/lib/services/file/ay/psg-export';
import { ATARI_ST_CHIP_FREQUENCY } from '@/lib/chips/ay/schema';
import type { Instrument } from '@/lib/models/instrument';

const TONE_ONLY_MIXER = 0b111000;

type Frame = { a: number; b: number; c: number; ampA: number; ampB: number; ampC: number };

const FRAMES: Frame[] = [
	{ a: 418, b: 209, c: 627, ampA: 15, ampB: 12, ampC: 8 },
	{ a: 419, b: 209, c: 627, ampA: 14, ampB: 12, ampC: 8 },
	{ a: 420, b: 210, c: 628, ampA: 13, ampB: 11, ampC: 7 },
	{ a: 420, b: 210, c: 628, ampA: 13, ampB: 11, ampC: 7 }
];

function registersOf(frame: Frame): number[] {
	return [
		frame.a & 0xff,
		(frame.a >> 8) & 0x0f,
		frame.b & 0xff,
		(frame.b >> 8) & 0x0f,
		frame.c & 0xff,
		(frame.c >> 8) & 0x0f,
		0,
		TONE_ONLY_MIXER,
		frame.ampA,
		frame.ampB,
		frame.ampC,
		0,
		0,
		0xff
	];
}

function buildPsg(frames: Frame[] = FRAMES): ArrayBuffer {
	const out: number[] = [0x50, 0x53, 0x47, 0x1a, ...new Array(12).fill(0)];
	for (const frame of frames) {
		out.push(0xff);
		registersOf(frame).forEach((value, register) => out.push(register, value));
	}
	out.push(0xfd);
	return new Uint8Array(out).buffer;
}

function buildRepeatedPsg(repeatCount: number): ArrayBuffer {
	const out: number[] = [0x50, 0x53, 0x47, 0x1a, ...new Array(12).fill(0), 0xff];
	registersOf(FRAMES[0]!).forEach((value, register) => out.push(register, value));
	out.push(0xfe, repeatCount, 0xfd);
	return new Uint8Array(out).buffer;
}

async function loadDriverModules() {
	return {
		AyumiState: (await import('../../../../../public/ay/ayumi-state.js')).default,
		TrackerPatternProcessor: (
			await import('../../../../../public/tracker/tracker-pattern-processor.js')
		).default,
		AYAudioDriver: (await import('../../../../../public/ay/ay-audio-driver.js')).default,
		AYChipRegisterState: (await import('../../../../../public/ay/ay-chip-register-state.js'))
			.default,
		VirtualChannelMixer: (await import('../../../../../public/ay/virtual-channel-mixer.js'))
			.default
	};
}

describe('PSG import', () => {
	it('detects a Bulba PSG stream by magic', () => {
		expect(isPsgBuffer(buildPsg())).toBe(true);
		expect(isPsgBuffer(new Uint8Array(20).buffer)).toBe(false);
		expect(isPsgBuffer(new ArrayBuffer(4))).toBe(false);
	});

	it('rejects a truncated stream with a PSG-specific error', () => {
		expect(() => decodePsgFrames(new Uint8Array(4))).toThrow(PsgFormatError);
	});

	it('builds one row per frame with tracker defaults', () => {
		const { project, warnings } = importPsgBuffer(buildPsg(), 'demo');
		const song = project.songs[0]!;

		expect(warnings).toEqual([]);
		expect(project.name).toBe('demo');
		expect(project.songs).toHaveLength(1);
		expect(song.chipType).toBe('ay');
		expect(song.chipVariant).toBe('AY');
		expect(song.chipFrequency).toBe(DEFAULT_PSG_CLOCK_HZ);
		expect(song.interruptFrequency).toBe(DEFAULT_PSG_FRAME_RATE_HZ);
		expect(song.initialSpeed).toBe(1);
		expect(song.patterns[0]!.patternRows).toHaveLength(FRAMES.length);
	});

	it('accepts an explicit clock and frame rate', () => {
		const { project } = importPsgBuffer(buildPsg(), 'demo', {
			clockHz: ATARI_ST_CHIP_FREQUENCY,
			frameRateHz: 200
		});
		const song = project.songs[0]!;

		expect(song.chipFrequency).toBe(ATARI_ST_CHIP_FREQUENCY);
		expect(song.interruptFrequency).toBe(200);
	});

	it('has no loop point because the format carries none', () => {
		const { project } = importPsgBuffer(buildPsg(), 'demo');
		expect(project.loopPointId).toBe(0);
	});

	it('produces a plain song with no timer effects or samples', () => {
		const { project } = importPsgBuffer(buildPsg(), 'demo');
		const instruments = project.instruments as Array<
			Instrument & { timerRows?: unknown[]; sampleData?: number[] }
		>;

		expect(instruments.length).toBeGreaterThan(0);
		for (const instrument of instruments) {
			expect(instrument.timerRows).toBeUndefined();
			expect(instrument.sampleData).toBeUndefined();
		}
	});

	it('expands a repeat marker using the Bulba four-frame unit', () => {
		const { project } = importPsgBuffer(buildRepeatedPsg(3), 'demo');
		expect(project.songs[0]!.patterns[0]!.patternRows).toHaveLength(3 * 4 + 1);
	});

	it('can read repeats as single frames like the TAYM reference decoder', () => {
		const { project } = importPsgBuffer(buildRepeatedPsg(3), 'demo', { repeatUnit: 1 });
		expect(project.songs[0]!.patterns[0]!.patternRows).toHaveLength(3 + 1);
	});

	it('warns that a repeat marker is open to a second reading', () => {
		const { warnings } = importPsgBuffer(buildRepeatedPsg(3), 'demo');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('13 frames');
		expect(warnings[0]).toContain('4 frames');
	});

	it('stays silent when a stream has no repeat markers', () => {
		expect(importPsgBuffer(buildPsg(), 'demo').warnings).toEqual([]);
	});

	it('survives a Bitphase export and re-import unchanged', async () => {
		const modules = await loadDriverModules();
		const first = importPsgBuffer(buildPsg(), 'demo').project;
		const exported = await generatePSGBuffer(first, 0, { modules });
		const second = importPsgBuffer(exported, 'demo').project;

		const capture = await captureSongRegisterFrames(second, 0, { modules });
		for (let frame = 0; frame < FRAMES.length; frame++) {
			const expected = registersOf(FRAMES[frame]!);
			for (const register of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10]) {
				const mask = register === 1 || register === 3 || register === 5 ? 0x0f : 0xff;
				expect(capture.frames[frame]!.registers[register]! & mask, `r${register}`).toBe(
					expected[register]! & mask
				);
			}
		}
	}, 60_000);

	it('replays the source registers exactly after import', async () => {
		const { project } = importPsgBuffer(buildPsg(), 'demo');
		const modules = await loadDriverModules();

		const capture = await captureSongRegisterFrames(project, 0, { modules });
		expect(capture.frames.length).toBeGreaterThanOrEqual(FRAMES.length);

		const compared = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10];
		for (let frame = 0; frame < FRAMES.length; frame++) {
			const expected = registersOf(FRAMES[frame]!);
			const actual = capture.frames[frame]!.registers;
			for (const register of compared) {
				const mask = register === 1 || register === 3 || register === 5 ? 0x0f : 0xff;
				expect(actual[register]! & mask, `frame ${frame} register ${register}`).toBe(
					expected[register]! & mask
				);
			}
		}
	}, 60_000);
});
