import { VirtualChannelMixer } from '../tracker/virtual-channel-mixer.js';
import AYChipRegisterState from './ay-chip-register-state.js';
import {
	copyChannelTimerEffects,
	createDefaultChannelTimerEffects
} from './ay-timer-effect-constants.js';

function createAyVirtualChannelAdapters() {
	return {
		defaultHwChannelCount: 3,
		createHardwareState(hwChannelCount) {
			return new AYChipRegisterState(hwChannelCount);
		},
		resetHardwareState(hardwareRegisterState) {
			hardwareRegisterState.reset();
		},
		copyGlobals(virtualRegisterState, hardwareRegisterState) {
			hardwareRegisterState.envelopePeriod = virtualRegisterState.envelopePeriod;
			hardwareRegisterState.envelopeShape = virtualRegisterState.envelopeShape;
			hardwareRegisterState.forceEnvelopeShapeWrite =
				virtualRegisterState.forceEnvelopeShapeWrite;
			hardwareRegisterState.noise = virtualRegisterState.noise;
		},
		isChannelActive(vch, registerState) {
			const vol = registerState.channels[vch]?.volume ?? 0;
			return (vol & 0x0f) > 0 || (vol & 0x10) !== 0;
		},
		copyChannel(srcState, srcIdx, dstState, dstIdx) {
			const src = srcState.channels[srcIdx];
			const dst = dstState.channels[dstIdx];
			if (!src || !dst) return;
			dst.tone = src.tone;
			dst.volume = src.volume;
			dst.mixer.tone = src.mixer.tone;
			dst.mixer.noise = src.mixer.noise;
			dst.mixer.envelope = src.mixer.envelope;
			if (src.timerEffects) {
				dst.timerEffects = copyChannelTimerEffects(src.timerEffects);
			} else if (!dst.timerEffects) {
				dst.timerEffects = createDefaultChannelTimerEffects();
			}
		}
	};
}

class AYVirtualChannelMixer extends VirtualChannelMixer {
	constructor() {
		super(createAyVirtualChannelAdapters());
	}
}

export default AYVirtualChannelMixer;
