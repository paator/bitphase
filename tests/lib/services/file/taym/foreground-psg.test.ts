import { describe, expect, it } from 'vitest';
import { encodeForegroundPsgFrameData } from '@/lib/services/file/taym/foreground-psg';
import { AY_REGISTER_COUNT } from '@/lib/services/file/ay/ay-export-utils';

function decodePsgFrameWrites(buffer: ArrayBuffer): Array<Array<[number, number]>> {
	const bytes = new Uint8Array(buffer);
	const frames: Array<Array<[number, number]>> = [];
	let offset = 16;

	while (offset < bytes.length) {
		const marker = bytes[offset++]!;
		if (marker === 0xfd) {
			break;
		}
		if (marker !== 0xff) {
			throw new Error(`Unexpected PSG marker 0x${marker.toString(16)}`);
		}

		const writes: Array<[number, number]> = [];
		while (offset < bytes.length && bytes[offset] !== 0xff && bytes[offset] !== 0xfd) {
			const register = bytes[offset++]!;
			const value = bytes[offset++]!;
			writes.push([register, value]);
		}
		frames.push(writes);
	}

	return frames;
}

function replayForegroundPsg(buffer: ArrayBuffer): number[][] {
	const registers = new Array(AY_REGISTER_COUNT).fill(0);
	return decodePsgFrameWrites(buffer).map((writes) => {
		for (const [register, value] of writes) {
			registers[register] = value;
		}
		return [...registers];
	});
}

function expectUnownedRegistersToMatch(
	registerFrames: number[][],
	ownedRegistersPerFrame: number[][]
): void {
	const foregroundFrames = replayForegroundPsg(
		encodeForegroundPsgFrameData(registerFrames, ownedRegistersPerFrame)
	);

	for (let frame = 0; frame < registerFrames.length; frame++) {
		const owned = new Set(ownedRegistersPerFrame[frame] ?? []);
		for (let register = 0; register < AY_REGISTER_COUNT; register++) {
			if (!owned.has(register)) {
				expect(foregroundFrames[frame][register]).toBe(registerFrames[frame][register]);
			}
		}
	}
}

describe('encodeForegroundPsgFrameData', () => {
	it('restores a timer-owned register when it becomes unowned again', () => {
		const silent = new Array(AY_REGISTER_COUNT).fill(0);
		const timerOwned = [...silent];
		timerOwned[8] = 15;
		const registerFrames = [silent, timerOwned, silent];
		const ownedRegistersPerFrame = [[], [8], []];

		const frames = decodePsgFrameWrites(
			encodeForegroundPsgFrameData(registerFrames, ownedRegistersPerFrame)
		);

		expect(frames[1]).not.toContainEqual([8, 15]);
		expect(frames[2]).toContainEqual([8, 0]);
		expectUnownedRegistersToMatch(registerFrames, ownedRegistersPerFrame);
	});

	it('re-emits a released register even when its background value is unchanged across the owned span', () => {
		const base = new Array(AY_REGISTER_COUNT).fill(0);
		base[8] = 15;
		const registerFrames = [base, base, base];
		const ownedRegistersPerFrame = [[], [8], []];

		const frames = decodePsgFrameWrites(
			encodeForegroundPsgFrameData(registerFrames, ownedRegistersPerFrame)
		);

		expect(frames[0]).toContainEqual([8, 15]);
		expect(frames[1]).not.toContainEqual([8, 15]);
		expect(frames[2]).toContainEqual([8, 15]);
		expectUnownedRegistersToMatch(registerFrames, ownedRegistersPerFrame);
	});

	it('keeps foreground playback aligned with captured registers whenever timer ownership is absent', () => {
		const frame0 = new Array(AY_REGISTER_COUNT).fill(0);
		frame0[0] = 1;
		frame0[8] = 7;
		const frame1 = [...frame0];
		frame1[2] = 10;
		frame1[8] = 15;
		const frame2 = [...frame1];
		frame2[0] = 2;
		frame2[8] = 3;
		const frame3 = [...frame2];
		const registerFrames = [frame0, frame1, frame2, frame3];
		const ownedRegistersPerFrame = [[], [8], [8], []];

		expectUnownedRegistersToMatch(registerFrames, ownedRegistersPerFrame);
	});
});
