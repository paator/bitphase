export class VirtualChannelMixer {
	constructor(adapters) {
		this.adapters = adapters;
		this.virtualChannelMap = {};
		this.hwChannelCount = adapters.defaultHwChannelCount;
		this.groups = [];
		this.hardwareRegisterState = adapters.createHardwareState(this.hwChannelCount);
	}

	configure(virtualChannelMap, hwChannelCount) {
		this.virtualChannelMap = virtualChannelMap || {};
		this.hwChannelCount = hwChannelCount ?? this.adapters.defaultHwChannelCount;
		this.groups = this._buildGroups();
		this.hardwareRegisterState = this.adapters.createHardwareState(this.hwChannelCount);
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

	getAudibleVirtualChannelIndices(virtualRegisterState) {
		const audible = [];
		for (const group of this.groups) {
			for (const vch of group.virtualIndices) {
				if (this._isChannelActive(vch, virtualRegisterState)) {
					audible.push(vch);
					break;
				}
			}
		}
		return audible;
	}

	merge(virtualRegisterState, state) {
		this.adapters.resetHardwareState(this.hardwareRegisterState);
		this.adapters.copyGlobals?.(virtualRegisterState, this.hardwareRegisterState, state);

		for (const group of this.groups) {
			const hwCh = group.hwIndex;
			const virtualIndices = group.virtualIndices;

			let selectedVch = virtualIndices[0];
			if (virtualIndices.length > 1) {
				selectedVch = -1;
				for (const vch of virtualIndices) {
					if (this._isChannelActive(vch, virtualRegisterState)) {
						selectedVch = vch;
						break;
					}
				}
				if (selectedVch === -1) {
					selectedVch = virtualIndices[virtualIndices.length - 1];
				}
			}

			this.adapters.copyChannel(
				virtualRegisterState,
				selectedVch,
				this.hardwareRegisterState,
				hwCh
			);
		}

		return this.hardwareRegisterState;
	}

	_isChannelActive(vch, registerState) {
		return this.adapters.isChannelActive(vch, registerState);
	}
}

export default VirtualChannelMixer;
