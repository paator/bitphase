import { VirtualChannelMixer } from '../tracker/virtual-channel-mixer.js';
import SaaRegisterState from './saa-register-state.js';
import { SAA_CHANNEL_COUNT } from './saa-constants.js';

function createSaaVirtualChannelAdapters() {
	return {
		defaultHwChannelCount: SAA_CHANNEL_COUNT,
		createHardwareState(hwChannelCount) {
			return new SaaRegisterState(hwChannelCount);
		},
		resetHardwareState(hardwareRegisterState) {
			hardwareRegisterState.reset();
		},
		copyGlobals(virtualRegisterState, hardwareRegisterState) {
			hardwareRegisterState.noise0 = virtualRegisterState.noise0 ?? 0;
			hardwareRegisterState.noise1 = virtualRegisterState.noise1 ?? 0;
			hardwareRegisterState.envelope0 = virtualRegisterState.envelope0 ?? 0;
			hardwareRegisterState.envelope1 = virtualRegisterState.envelope1 ?? 0;
			hardwareRegisterState.envelopeRetrigger0 = Boolean(
				virtualRegisterState.envelopeRetrigger0
			);
			hardwareRegisterState.envelopeRetrigger1 = Boolean(
				virtualRegisterState.envelopeRetrigger1
			);
		},
		isChannelActive(vch, registerState) {
			const channel = registerState.channels[vch];
			if (!channel) return false;
			return Boolean(channel.tone || channel.noise) || channel.left > 0 || channel.right > 0;
		},
		copyChannel(srcState, srcIdx, dstState, dstIdx) {
			const src = srcState.channels[srcIdx];
			const dst = dstState.channels[dstIdx];
			if (!src || !dst) return;
			dst.tone = src.tone === true;
			dst.noise = src.noise === true;
			dst.left = src.left | 0;
			dst.right = src.right | 0;
			dst.octave = src.octave | 0;
			dst.freq = src.freq | 0;
		}
	};
}

class SaaVirtualChannelMixer extends VirtualChannelMixer {
	constructor() {
		super(createSaaVirtualChannelAdapters());
	}
}

export default SaaVirtualChannelMixer;
