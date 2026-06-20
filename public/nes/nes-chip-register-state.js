import { NES_CHANNEL_COUNT } from './nes-constants.js';
import { NES_REGISTER_UNCHANGED, NES_SQUARE_SWEEP_DISABLED } from './nes-instrument-utils.js';

function createDefaultChannel() {
	return {
		enabled: false,
		period: 0,
		volume: 0,
		duty: 2,
		retrigger: false,
		sweepReg: NES_SQUARE_SWEEP_DISABLED,
		noisePeriod: 0,
		noiseMode: false,
		volumeReg: NES_REGISTER_UNCHANGED,
		lengthNibble: NES_REGISTER_UNCHANGED,
		linearReg: NES_REGISTER_UNCHANGED
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
