export class VirtualChannelMixer {
	constructor(adapters) {
		this.adapters = adapters;
		this.virtualChannelMap = {};
		this.virtualChannelRoles = {};
		this.hwChannelCount = adapters.defaultHwChannelCount;
		this.groups = [];
		this.hardwareRegisterState = adapters.createHardwareState(this.hwChannelCount);
	}

	configure(virtualChannelMap, hwChannelCount, virtualChannelRoles) {
		this.virtualChannelMap = virtualChannelMap || {};
		this.virtualChannelRoles = virtualChannelRoles || {};
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
			const { voiceIndices } = this._partitionGroup(group);
			for (const vch of voiceIndices) {
				if (this._isChannelActive(vch, virtualRegisterState)) {
					audible.push(vch);
					break;
				}
			}
		}
		return audible;
	}

	getMergedVirtualChannelIndices(virtualRegisterState) {
		const selected = [];
		for (const group of this.groups) {
			const { voiceIndices } = this._partitionGroup(group);
			if (voiceIndices.length === 0) {
				selected.push(-1);
				continue;
			}
			selected.push(this._selectVoice(voiceIndices, virtualRegisterState));
		}
		return selected;
	}

	merge(virtualRegisterState, state) {
		this.adapters.resetHardwareState(this.hardwareRegisterState);
		this.adapters.copyGlobals?.(virtualRegisterState, this.hardwareRegisterState, state);

		for (const group of this.groups) {
			const { voiceIndices, roleChannels } = this._partitionGroup(group);
			if (voiceIndices.length === 0) continue;
			const selectedVch = this._selectVoice(voiceIndices, virtualRegisterState);
			this.adapters.copyChannel(
				virtualRegisterState,
				selectedVch,
				this.hardwareRegisterState,
				group.hwIndex
			);
			const appliedRoles = new Set();
			for (const side of roleChannels) {
				if (appliedRoles.has(side.roleId)) continue;
				if (!this._isChannelActive(side.vch, virtualRegisterState)) continue;
				this.adapters.applyVirtualChannelRole(
					side.roleId,
					virtualRegisterState,
					side.vch,
					this.hardwareRegisterState,
					group.hwIndex
				);
				appliedRoles.add(side.roleId);
			}
		}

		return this.hardwareRegisterState;
	}

	_roleId(hwIndex, indexInGroup) {
		const groupRoles = this.virtualChannelRoles?.[hwIndex];
		if (!groupRoles) return null;
		const roleId = groupRoles[indexInGroup];
		if (typeof roleId !== 'string' || roleId.length === 0) return null;
		if (typeof this.adapters.claimsVirtualChannelRole !== 'function') return null;
		if (!this.adapters.claimsVirtualChannelRole(roleId)) return null;
		if (typeof this.adapters.applyVirtualChannelRole !== 'function') return null;
		return roleId;
	}

	_partitionGroup(group) {
		const voiceIndices = [];
		const roleChannels = [];
		for (let indexInGroup = 0; indexInGroup < group.virtualIndices.length; indexInGroup++) {
			const vch = group.virtualIndices[indexInGroup];
			const roleId = this._roleId(group.hwIndex, indexInGroup);
			if (roleId) roleChannels.push({ vch, roleId });
			else voiceIndices.push(vch);
		}
		if (voiceIndices.length === 0 && roleChannels.length > 0) {
			const fallback = roleChannels.shift();
			voiceIndices.push(fallback.vch);
		}
		return { voiceIndices, roleChannels };
	}

	_selectVoice(voiceIndices, virtualRegisterState) {
		if (voiceIndices.length === 1) return voiceIndices[0];
		for (const vch of voiceIndices) {
			if (this._isChannelActive(vch, virtualRegisterState)) return vch;
		}
		return voiceIndices[voiceIndices.length - 1];
	}

	_isChannelActive(vch, registerState) {
		return this.adapters.isChannelActive(vch, registerState);
	}
}

export default VirtualChannelMixer;
