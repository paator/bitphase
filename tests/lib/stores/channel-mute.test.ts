import { describe, it, expect, beforeEach } from 'vitest';
import { channelMuteStore } from '../../../src/lib/stores/channel-mute.svelte';

describe('ChannelMuteStore', () => {
	beforeEach(() => {
		channelMuteStore.clear();
	});

	it('starts unmuted', () => {
		expect(channelMuteStore.isChannelMuted(0, 0)).toBe(false);
	});

	it('toggles and sets mute state', () => {
		channelMuteStore.toggleChannel(0, 1);
		expect(channelMuteStore.isChannelMuted(0, 1)).toBe(true);

		channelMuteStore.setChannelMuted(0, 1, false);
		expect(channelMuteStore.isChannelMuted(0, 1)).toBe(false);
	});

	it('clears all mute state', () => {
		channelMuteStore.setChannelMuted(0, 0, true);
		channelMuteStore.setChannelMuted(1, 2, true);

		channelMuteStore.clear();

		expect(channelMuteStore.isChannelMuted(0, 0)).toBe(false);
		expect(channelMuteStore.isChannelMuted(1, 2)).toBe(false);
		expect(channelMuteStore.getAllMuteStates().size).toBe(0);
	});

	it('reindexes mute state when a chip is removed', () => {
		channelMuteStore.setChannelMuted(0, 0, true);
		channelMuteStore.setChannelMuted(1, 1, true);
		channelMuteStore.setChannelMuted(2, 2, true);

		channelMuteStore.removeChip(1);

		expect(channelMuteStore.isChannelMuted(0, 0)).toBe(true);
		expect(channelMuteStore.isChannelMuted(1, 2)).toBe(true);
		expect(channelMuteStore.isChannelMuted(1, 1)).toBe(false);
		expect(channelMuteStore.isChannelMuted(2, 2)).toBe(false);
	});
});
