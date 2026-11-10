import { describe, expect, it } from 'vitest';
import {
	generalPianoEffectGesture,
	pianoEffectGestureFor
} from '@/lib/chips/base/piano-effect-gesture';
import { nesPianoEffectGesture } from '@/lib/chips/nes/effects';

describe('piano effect gestures', () => {
	it('maps shared tracker commands and leaves the rest plain', () => {
		expect(generalPianoEffectGesture({ effect: 2, delay: 0, parameter: 0x18 })).toEqual({
			kind: 'slide-up',
			amount: 0.5
		});
		expect(
			generalPianoEffectGesture({ effect: 1, delay: 0, parameter: 0, tableIndex: 2 })
		).toEqual({
			kind: 'slide-down',
			amount: 0.45
		});
		expect(
			generalPianoEffectGesture({ effect: 'A'.charCodeAt(0), delay: 0, parameter: 0x37 })
		).toEqual({
			kind: 'arpeggio',
			steps: [3, 7]
		});
		expect(
			generalPianoEffectGesture({ effect: 'A'.charCodeAt(0), delay: 0, parameter: 0 })
		).toBeNull();
		expect(generalPianoEffectGesture({ effect: 7, delay: 0, parameter: 4 })).toEqual({
			kind: 'delay',
			portion: 0.25
		});
		expect(generalPianoEffectGesture({ effect: 8, delay: 0, parameter: 0 })).toBeNull();
		expect(generalPianoEffectGesture({ effect: 6, delay: 0, parameter: 1 })).toBeNull();
		expect(
			generalPianoEffectGesture({ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x20 })
		).toBeNull();
	});

	it('lets a chip picture win, then falls back to the shared commands', () => {
		const chip = { pianoEffectGesture: nesPianoEffectGesture };
		expect(
			pianoEffectGestureFor({ effect: 'E'.charCodeAt(0), delay: 2, parameter: 0x14 }, chip)
		).toEqual({ kind: 'slide-up', amount: 0.5 });
		expect(
			pianoEffectGestureFor({ effect: 'E'.charCodeAt(0), delay: 3, parameter: 0x08 }, chip)
		).toEqual({ kind: 'slide-down', amount: 1 });
		expect(
			pianoEffectGestureFor({ effect: 'E'.charCodeAt(0), delay: 1, parameter: 0x20 }, chip)
		).toBeNull();
		expect(
			pianoEffectGestureFor({ effect: 'V'.charCodeAt(0), delay: 0, parameter: 0x48 }, chip)
		).toEqual({ kind: 'vibrato', speed: 4 / 15, depth: 8 / 15 });
	});
});
