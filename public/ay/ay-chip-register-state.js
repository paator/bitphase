import {
	createDefaultChannelTimerEffects,
	copyChannelTimerEffects,
	TIMER_EFFECT_KIND_NONE
} from './ay-timer-effect-constants.js';

const AY_REGISTER_COUNT = 14;
const AY_TONE_CHANNELS = 3;

class AYChipRegisterState {
	constructor(channelCount = 3) {
		this.channelCount = channelCount;
		this.channels = [];
		for (let i = 0; i < channelCount; i++) {
			this.channels.push({
				tone: 0,
				volume: 0,
				mixer: { tone: false, noise: false, envelope: false },
				timerEffects: createDefaultChannelTimerEffects()
			});
		}
		this.noise = 0;
		this.envelopePeriod = 0;
		this.envelopeShape = 0;
		this.forceEnvelopeShapeWrite = false;
	}

	reset() {
		for (let i = 0; i < this.channelCount; i++) {
			this.channels[i].tone = 0;
			this.channels[i].volume = 0;
			this.channels[i].mixer = { tone: false, noise: false, envelope: false };
			this.channels[i].timerEffects = createDefaultChannelTimerEffects();
		}
		this.noise = 0;
		this.envelopePeriod = 0;
		this.envelopeShape = 0;
		this.forceEnvelopeShapeWrite = false;
	}

	resize(newChannelCount) {
		while (this.channels.length < newChannelCount) {
			this.channels.push({
				tone: 0,
				volume: 0,
				mixer: { tone: false, noise: false, envelope: false },
				timerEffects: createDefaultChannelTimerEffects()
			});
		}
		if (this.channels.length > newChannelCount) {
			this.channels.length = newChannelCount;
		}
		this.channelCount = newChannelCount;
	}

	copy() {
		const copy = new AYChipRegisterState(this.channelCount);
		for (let i = 0; i < this.channelCount; i++) {
			copy.channels[i].tone = this.channels[i].tone;
			copy.channels[i].volume = this.channels[i].volume;
			copy.channels[i].mixer = {
				tone: this.channels[i].mixer.tone,
				noise: this.channels[i].mixer.noise,
				envelope: this.channels[i].mixer.envelope
			};
			copy.channels[i].timerEffects = copyChannelTimerEffects(this.channels[i].timerEffects);
		}
		copy.noise = this.noise;
		copy.envelopePeriod = this.envelopePeriod;
		copy.envelopeShape = this.envelopeShape;
		copy.forceEnvelopeShapeWrite = this.forceEnvelopeShapeWrite;
		return copy;
	}

	toHardwareRegisters() {
		const registers = new Array(AY_REGISTER_COUNT).fill(0);

		for (let channelIndex = 0; channelIndex < AY_TONE_CHANNELS; channelIndex++) {
			const channel = this.channels[channelIndex];
			const toneReg = channelIndex * 2;
			const tone = channel.tone & 0xfff;
			registers[toneReg] = tone & 0xff;
			registers[toneReg + 1] = (tone >> 8) & 0x0f;
		}

		registers[6] = this.noise & 0x1f;

		let mixer = 0;
		for (let channelIndex = 0; channelIndex < AY_TONE_CHANNELS; channelIndex++) {
			const channel = this.channels[channelIndex];
			if (!channel.mixer.tone) {
				mixer |= 1 << channelIndex;
			}
			if (!channel.mixer.noise) {
				mixer |= 1 << (channelIndex + 3);
			}
		}
		registers[7] = mixer;

		for (let channelIndex = 0; channelIndex < AY_TONE_CHANNELS; channelIndex++) {
			const channel = this.channels[channelIndex];
			let volume = channel.volume & 0x0f;
			if (channel.mixer.envelope) {
				volume |= 0x10;
			}
			registers[8 + channelIndex] = volume;
		}

		const envelopePeriod = this.envelopePeriod & 0xffff;
		registers[11] = envelopePeriod & 0xff;
		registers[12] = (envelopePeriod >> 8) & 0xff;
		registers[13] = this.envelopeShape & 0x0f;

		return registers;
	}
}

export default AYChipRegisterState;
