import { describe, expect, it } from 'vitest';
import {
	channelCountForMute,
	clearedChannelMutes,
	soloChannelMutes
} from '../../../../src/lib/services/audio/channel-mute-plan';

describe('channel mute plan', () => {
	it('counts hardware, virtual, pattern, and existing mute channels', () => {
		expect(
			channelCountForMute({
				hardwareChannelCount: 3,
				virtualChannelMap: { 0: 2 },
				patternChannelCounts: [4, 3],
				existingMuteCount: 5
			})
		).toBe(5);
	});

	it('solos one channel and mutes every other channel on that chip', () => {
		expect(soloChannelMutes(3, 1, true)).toEqual([true, false, true]);
	});

	it('mutes every channel on chips that are not soloed', () => {
		expect(soloChannelMutes(4, 1, false)).toEqual([true, true, true, true]);
	});

	it('clears every channel when unmuting', () => {
		expect(clearedChannelMutes(3)).toEqual([false, false, false]);
	});
});
