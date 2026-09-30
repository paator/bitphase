import { describe, expect, it } from 'vitest';
import { createNesLengthReloadTracker } from '@/lib/services/file/nes/nes-register-export';

function triangleState(enabled: boolean, retrigger: boolean) {
	return {
		channels: [{}, {}, { enabled, period: 428, retrigger }, {}]
	};
}

describe('createNesLengthReloadTracker', () => {
	it('reloads the triangle length register on the note after a note-off', () => {
		const track = createNesLengthReloadTracker();

		expect(track(triangleState(true, true))).toEqual([0x0b]);
		expect(track(triangleState(true, false))).toEqual([]);
		expect(track(triangleState(false, false))).toEqual([]);
		expect(track(triangleState(true, true))).toEqual([0x0b]);
	});
});
