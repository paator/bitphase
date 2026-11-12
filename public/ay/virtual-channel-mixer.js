import { VirtualChannelMixer } from '../tracker/virtual-channel-mixer.js';
import AYChipRegisterState from './ay-chip-register-state.js';
import {
	TIMER_EFFECT_SLOT_KEYS,
	copyChannelTimerEffects,
	createDefaultChannelTimerEffects
} from './ay-timer-effect-constants.js';
import {
	clampTimerPwmDuty,
	computeTimerEffectPeriod,
	computeTimerPwmPeriods
} from './ay-instrument-utils.js';

const AY_TIMER_VIRTUAL_CHANNEL_ROLE = 'timer';

function retargetTimerEffectPeriod(effect, basePeriod) {
	if (!effect?.enabled) return;
	const period = Math.max(1, basePeriod | 0);
	if ((effect.pwmMode ?? 0) === 0) {
		effect.period = period;
		effect.periodLow = period;
		return;
	}
	const high = effect.period > 0 ? effect.period : 1;
	const low = effect.periodLow > 0 ? effect.periodLow : high;
	const dutyPercent = clampTimerPwmDuty(Math.round((100 * high) / (high + low)));
	const next = computeTimerPwmPeriods(period, dutyPercent);
	effect.period = next.highPeriod;
	effect.periodLow = next.lowPeriod;
}

function applyTimerNotePeriod(srcState, srcIdx, dstState, dstIdx) {
	const src = srcState.channels[srcIdx];
	const dst = dstState.channels[dstIdx];
	if (!src || !dst?.timerEffects) return;
	const tone = src.tone & 0xfff;
	if (tone <= 0) return;
	const period = computeTimerEffectPeriod(tone, dst.timerPeriodDetune ?? { semitone: 0, detune: 0 });
	for (const key of TIMER_EFFECT_SLOT_KEYS) {
		retargetTimerEffectPeriod(dst.timerEffects[key], period);
	}
}

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
			dst.timerPeriodDetune = src.timerPeriodDetune
				? {
						semitone: src.timerPeriodDetune.semitone | 0,
						detune: src.timerPeriodDetune.detune | 0
					}
				: undefined;
		},
		claimsVirtualChannelRole(roleId) {
			return roleId === AY_TIMER_VIRTUAL_CHANNEL_ROLE;
		},
		applyVirtualChannelRole(roleId, srcState, srcIdx, dstState, dstIdx) {
			if (roleId !== AY_TIMER_VIRTUAL_CHANNEL_ROLE) return;
			applyTimerNotePeriod(srcState, srcIdx, dstState, dstIdx);
		}
	};
}

class AYVirtualChannelMixer extends VirtualChannelMixer {
	constructor() {
		super(createAyVirtualChannelAdapters());
	}
}

export default AYVirtualChannelMixer;
