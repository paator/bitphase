import { NES_CHANNEL_COUNT } from './nes-constants.js';

function createDefaultChannel() {
	return {
		enabled: false,
		period: 0,
		volume: 0,
		duty: 2,
		retrigger: false,
		sweepReg: -1,
		noisePeriod: 0,
		noiseMode: false
	};
}

class NesChipRegisterState {
	constructor(channelCount = NES_CHANNEL_COUNT) {
		this.channelCount = channelCount;
		this.channels = Array.from({ length: channelCount }, () => createDefaultChannel());
	}

	reset() {
		for (let i = 0; i < this.channelCount; i++) {
			this.channels[i] = createDefaultChannel();
		}
	}

	resize(newChannelCount) {
		while (this.channels.length < newChannelCount) {
			this.channels.push(createDefaultChannel());
		}
		if (this.channels.length > newChannelCount) {
			this.channels.length = newChannelCount;
		}
		this.channelCount = newChannelCount;
	}
}

export default NesChipRegisterState;
