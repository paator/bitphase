import AYChipRegisterState from './ay-chip-register-state.js';
import { copyChannelTimerEffects, createDefaultChannelTimerEffects } from './ay-timer-effect-constants.js';

class VirtualChannelMixer {
	constructor() {
		this.virtualChannelMap = {};
		this.hwChannelCount = 3;
		this.groups = [];
		this.hardwareRegisterState = new AYChipRegisterState();
	}

	configure(virtualChannelMap, hwChannelCount) {
		this.virtualChannelMap = virtualChannelMap || {};
		this.hwChannelCount = hwChannelCount;
		this.groups = this._buildGroups();
	}

	_buildGroups() {
		const groups = [];
		let offset = 0;
		for (let hw = 0; hw < this.hwChannelCount; hw++) {
			const count = this.virtualChannelMap[hw] ?? 1;
			const indices = [];
			for (let v = 0; v < count; v++) {
				indices.push(offset + v);
			}
			groups.push({ hwIndex: hw, virtualIndices: indices });
			offset += count;
		}
		return groups;
	}

	getTotalVirtualChannelCount() {
		let total = 0;
		for (let i = 0; i < this.hwChannelCount; i++) {
			total += this.virtualChannelMap[i] ?? 1;
		}
		return total;
	}

	getHardwareChannelIndex(virtualChannelIndex) {
		let offset = 0;
		for (let hw = 0; hw < this.hwChannelCount; hw++) {
			const count = this.virtualChannelMap[hw] ?? 1;
			if (virtualChannelIndex < offset + count) {
				return hw;
			}
			offset += count;
		}
		return Math.max(0, this.hwChannelCount - 1);
	}

	hasVirtualChannels() {
		return Object.values(this.virtualChannelMap).some((count) => count > 1);
	}

	merge(virtualRegisterState, state) {
		this.hardwareRegisterState.reset();
		this.hardwareRegisterState.envelopePeriod = virtualRegisterState.envelopePeriod;
		this.hardwareRegisterState.envelopeShape = virtualRegisterState.envelopeShape;
		this.hardwareRegisterState.forceEnvelopeShapeWrite =
			virtualRegisterState.forceEnvelopeShapeWrite;
		this.hardwareRegisterState.noise = virtualRegisterState.noise;

		for (const group of this.groups) {
			const hwCh = group.hwIndex;
			const virtualIndices = group.virtualIndices;

			if (virtualIndices.length === 1) {
				const vch = virtualIndices[0];
				this._copyChannel(virtualRegisterState, vch, this.hardwareRegisterState, hwCh);
				continue;
			}

			let selectedVch = -1;
			for (const vch of virtualIndices) {
				if (this._isChannelActive(vch, virtualRegisterState)) {
					selectedVch = vch;
					break;
				}
			}

			if (selectedVch === -1) {
				selectedVch = virtualIndices[virtualIndices.length - 1];
			}

			this._copyChannel(virtualRegisterState, selectedVch, this.hardwareRegisterState, hwCh);
		}

		return this.hardwareRegisterState;
	}

	_isChannelActive(vch, registerState) {
		const vol = registerState.channels[vch]?.volume ?? 0;
		return (vol & 0x0f) > 0 || (vol & 0x10) !== 0;
	}

	_copyChannel(srcState, srcIdx, dstState, dstIdx) {
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
}

export default VirtualChannelMixer;
