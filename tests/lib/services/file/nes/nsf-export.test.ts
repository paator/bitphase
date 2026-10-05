import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../../../../../src/lib/models/project';
import {
	exportToNSF,
	resolveNsfLoopFrame,
	resolveNsfSongs,
	scaleAyRegistersForNsf,
	sunsoft5bClock
} from '../../../../../src/lib/services/file/nes/nsf-export';

describe('resolveNsfLoopFrame', () => {
	it('stops instead of looping when the song ended', () => {
		expect(resolveNsfLoopFrame([0, 1, 0], 0, 2, true)).toBeNull();
	});

	it('uses the first frame of the loop point', () => {
		expect(resolveNsfLoopFrame([0, 0, 1, 1], 1, 2, false)).toBe(2);
	});

	it('loops from the start when the loop point is not in the song', () => {
		expect(resolveNsfLoopFrame([0, 1], 5, 2, false)).toBe(0);
		expect(resolveNsfLoopFrame([0, 1], 1, 2, false)).toBe(1);
	});
});

describe('resolveNsfSongs', () => {
	it('accepts one NES, one AY, or one of each', () => {
		expect(resolveNsfSongs({ songs: [{ chipType: 'nes' }] } as Project)).toEqual({
			nesIndex: 0,
			ayIndex: null
		});
		expect(resolveNsfSongs({ songs: [{ chipType: 'ay' }] } as Project)).toEqual({
			nesIndex: null,
			ayIndex: 0
		});
		expect(
			resolveNsfSongs({ songs: [{ chipType: 'ay' }, { chipType: 'nes' }] } as Project)
		).toEqual({ nesIndex: 1, ayIndex: 0 });
	});

	it('rejects a second chip or anything else', () => {
		expect(() => resolveNsfSongs({ songs: [{ chipType: 'nes' }, { chipType: 'nes' }] } as Project)).toThrow(
			'NSF export supports one NES chip and one AY chip'
		);
		expect(() => resolveNsfSongs({ songs: [{ chipType: 'ay' }, { chipType: 'ay' }] } as Project)).toThrow(
			'NSF export supports one NES chip and one AY chip'
		);
		expect(() => resolveNsfSongs({ songs: [{ chipType: 'sid' }] } as Project)).toThrow(
			'NSF export supports one NES chip and one AY chip'
		);
	});
});

describe('scaleAyRegistersForNsf', () => {
	it('keeps Sunsoft periods when the song is already tuned for 5B', () => {
		const registers = [0x34, 0x12, 0, 0, 0, 0, 10, 0x38, 0x0f, 0, 0, 0x00, 0x01, 0x0e];
		expect(scaleAyRegistersForNsf(registers, 894886, sunsoft5bClock(false))).toEqual(registers);
		expect(sunsoft5bClock(false)).toBe(894886);
	});

	it('retunes AY periods onto the 5B clock', () => {
		const registers = [100, 0, 0, 0, 0, 0, 31, 0x38, 0x0f, 0, 0, 0xe8, 0x03, 0x0e];
		const scaled = scaleAyRegistersForNsf(registers, 1_773_400, 894886);
		expect(scaled[0]).toBe(50);
		expect(scaled[1]).toBe(0);
		expect(scaled[6]).toBe(16);
		expect(scaled[7]).toBe(0x38);
		expect(scaled[8]).toBe(0x0f);
		expect(scaled[11]! | (scaled[12]! << 8)).toBe(505);
		expect(scaled[13]).toBe(0x0e);
	});
});

describe('exportToNSF', () => {
	it('rejects a second NES chip before capture', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const dual = { songs: [{ chipType: 'nes' }, { chipType: 'nes' }] } as Project;
		await expect(exportToNSF(dual)).rejects.toThrow('NSF export supports one NES chip and one AY chip');
		error.mockRestore();
	});
});
