import { describe, expect, it } from 'vitest';
import { encodePSGMasked } from '@/lib/services/file/ay/psg-export';

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

describe('encodePSGMasked', () => {
	it('restores a timer-owned register when it becomes unowned again', () => {
		const silent = new Array(14).fill(0);
		const timerOwned = [...silent];
		timerOwned[8] = 15;

		const frames = decodePsgFrameWrites(encodePSGMasked([silent, timerOwned, silent], [[], [8], []]));

		expect(frames[1]).not.toContainEqual([8, 15]);
		expect(frames[2]).toContainEqual([8, 0]);
	});

	it('re-emits a released register even when its background value is unchanged across the owned span', () => {
		const base = new Array(14).fill(0);
		base[8] = 15;

		const frames = decodePsgFrameWrites(encodePSGMasked([base, base, base], [[], [8], []]));

		expect(frames[0]).toContainEqual([8, 15]);
		expect(frames[1]).not.toContainEqual([8, 15]);
		expect(frames[2]).toContainEqual([8, 15]);
	});
});
