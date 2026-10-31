import { SAA_CHANNEL_COUNT } from './saa-constants.js';

function createDefaultChannel() {
	return {
		tone: false,
		noise: false,
		left: 0,
		right: 0,
		octave: 0,
		freq: 0
	};
}

class SaaRegisterState {
	constructor(channelCount = SAA_CHANNEL_COUNT) {
		this.channelCount = channelCount;
		this.channels = Array.from({ length: channelCount }, () => createDefaultChannel());
		this.noise0 = 0;
		this.noise1 = 0;
		this.envelope0 = 0;
		this.envelope1 = 0;
		this.envelopeRetrigger0 = false;
		this.envelopeRetrigger1 = false;
	}

	reset() {
		for (let i = 0; i < this.channelCount; i++) {
			this.channels[i] = createDefaultChannel();
		}
		this.noise0 = 0;
		this.noise1 = 0;
		this.envelope0 = 0;
		this.envelope1 = 0;
		this.envelopeRetrigger0 = false;
		this.envelopeRetrigger1 = false;
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

export default SaaRegisterState;
