import { describe, expect, it } from 'vitest';
import { resolveLoopFrame } from '@/lib/services/file/loop-frame';

describe('resolveLoopFrame', () => {
	it('stops instead of looping when the song ended', () => {
		expect(resolveLoopFrame([0, 1, 0], 0, 2, true)).toBeNull();
	});

	it('uses the first frame of the loop point', () => {
		expect(resolveLoopFrame([0, 0, 1, 1], 1, 2, false)).toBe(2);
	});

	it('loops from the start when the loop point is not in the song', () => {
		expect(resolveLoopFrame([0, 1], 5, 2, false)).toBe(0);
		expect(resolveLoopFrame([0, 1], 1, 2, false)).toBe(1);
	});
});
