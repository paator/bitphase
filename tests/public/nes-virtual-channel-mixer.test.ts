import { describe, it, expect, beforeEach } from 'vitest';
import NesVirtualChannelMixer from '../../public/nes/nes-virtual-channel-mixer.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';

describe('NesVirtualChannelMixer', () => {
	let mixer: InstanceType<typeof NesVirtualChannelMixer>;

	beforeEach(() => {
		mixer = new NesVirtualChannelMixer();
	});

	it('selects the leftmost enabled virtual channel per hardware group', () => {
		mixer.configure({ 0: 2 }, 5);
		const registerState = new NesChipRegisterState(6);
		registerState.channels[0].enabled = true;
		registerState.channels[0].volume = 10;
		registerState.channels[0].period = 100;
		registerState.channels[1].enabled = true;
		registerState.channels[1].volume = 8;
		registerState.channels[1].period = 200;

		expect(mixer.getAudibleVirtualChannelIndices(registerState)).toEqual([0]);

		const merged = mixer.merge(registerState, {});
		expect(merged.channels[0].period).toBe(100);
		expect(merged.channels[0].volume).toBe(10);
		expect(merged.channelCount).toBe(5);
	});

	it('falls through to the next virtual channel when the leftmost is silent', () => {
		mixer.configure({ 0: 2 }, 5);
		const registerState = new NesChipRegisterState(6);
		registerState.channels[0].enabled = false;
		registerState.channels[0].volume = 0;
		registerState.channels[1].enabled = true;
		registerState.channels[1].volume = 12;
		registerState.channels[1].period = 333;

		expect(mixer.getAudibleVirtualChannelIndices(registerState)).toEqual([1]);
		const merged = mixer.merge(registerState, {});
		expect(merged.channels[0].period).toBe(333);
		expect(merged.channels[0].volume).toBe(12);
	});
});
