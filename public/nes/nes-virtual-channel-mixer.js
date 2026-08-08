import { VirtualChannelMixer } from '../tracker/virtual-channel-mixer.js';
import NesChipRegisterState from './nes-chip-register-state.js';
import { NES_CHANNEL_COUNT } from './nes-constants.js';

function copyNesChannelFields(src, dst) {
	dst.enabled = src.enabled;
	dst.period = src.period;
	dst.volume = src.volume;
	dst.duty = src.duty;
	dst.retrigger = src.retrigger;
	dst.sweepReg = src.sweepReg;
	dst.sweepUpdateOnly = src.sweepUpdateOnly;
	dst.noisePeriod = src.noisePeriod;
	dst.noiseMode = src.noiseMode;
	dst.volumeReg = src.volumeReg;
	dst.lengthNibble = src.lengthNibble;
	dst.linearReg = src.linearReg;
}

function createNesVirtualChannelAdapters() {
	return {
		defaultHwChannelCount: NES_CHANNEL_COUNT,
		createHardwareState(hwChannelCount) {
			return new NesChipRegisterState(hwChannelCount);
		},
		resetHardwareState(hardwareRegisterState) {
			hardwareRegisterState.reset();
		},
		isChannelActive(vch, registerState) {
			const channel = registerState.channels[vch];
			if (!channel) return false;
			return Boolean(channel.enabled) || (channel.volume ?? 0) > 0;
		},
		copyChannel(srcState, srcIdx, dstState, dstIdx) {
			const src = srcState.channels[srcIdx];
			const dst = dstState.channels[dstIdx];
			if (!src || !dst) return;
			copyNesChannelFields(src, dst);
		}
	};
}

class NesVirtualChannelMixer extends VirtualChannelMixer {
	constructor() {
		super(createNesVirtualChannelAdapters());
	}
}

export default NesVirtualChannelMixer;
