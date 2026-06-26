import AyumiState from './ayumi-state.js';
import TrackerPatternProcessor from '../tracker/tracker-pattern-processor.js';
import AYAudioDriver from './ay-audio-driver.js';
import AyumiEngine from './ayumi-engine.js';
import AYChipRegisterState from './ay-chip-register-state.js';
import VirtualChannelMixer from './virtual-channel-mixer.js';
import { disableAllChannelTimerEffects, ensureChannelTimerEffects } from './ay-timer-effect-constants.js';
import { TrackerWorkletSlot } from '../tracker/tracker-worklet-slot.js';
import { resetChipPlaybackOutput } from '../tracker/tracker-engine-transport.js';

export class Ay8910WorkletSlot extends TrackerWorkletSlot {
	constructor(port, chipIndex, sharedTimeline) {
		super(port, chipIndex);
		this.state = new AyumiState(3, sharedTimeline);
		this.initialized = false;
		this.audioDriver = null;
		this.patternProcessor = null;
		this.ayumiEngine = null;
		this.registerState = new AYChipRegisterState();
		this.virtualChannelMixer = new VirtualChannelMixer();
		this.virtualChannelMap = {};
		this.hwChannelCount = 3;
	}

	_slotState() {
		return this.state;
	}

	_isReadyForPlayback() {
		return this.initialized && this.state.wasmModule && this.state.ayumiPtr;
	}

	_resizeForPatternChannels(channelCount) {
		this._ensureChannelCapacity(channelCount);
	}

	_applyPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.state.publishPlaybackSpeed(speed);
	}

	_chipEngineReady() {
		return this._playbackWorkersReady() && this.ayumiEngine;
	}

	_onTransportStop() {
		resetChipPlaybackOutput({
			registerState: this.registerState,
			audioDriver: this.audioDriver,
			chipEngine: this.ayumiEngine,
			applyRegisterState: () => this._applyRegisterStateToEngine()
		});
	}

	_dispatchChipPortMessage(type, data) {
		if (type !== 'set_virtual_channel_config') {
			return false;
		}
		this.handleSetVirtualChannelConfig(data);
		return true;
	}

	applyChannelSilent(registerState, channelIndex) {
		registerState.channels[channelIndex].volume = 0;
		registerState.channels[channelIndex].mixer = {
			tone: false,
			noise: false,
			envelope: false
		};
		disableAllChannelTimerEffects(ensureChannelTimerEffects(registerState.channels[channelIndex]));
	}

	handleSetVirtualChannelConfig({ virtualChannelMap, hwChannelCount }) {
		this.virtualChannelMap = virtualChannelMap || {};
		this.hwChannelCount = hwChannelCount || 3;
		this.virtualChannelMixer.configure(this.virtualChannelMap, this.hwChannelCount);

		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		this.state.resizeChannels(totalChannels);
		this.registerState.resize(totalChannels);
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(totalChannels);
		}
		if (this.ayumiEngine) {
			resetChipPlaybackOutput({
				registerState: this.registerState,
				audioDriver: this.audioDriver,
				chipEngine: this.ayumiEngine,
				applyRegisterState: () => this._applyRegisterStateToEngine()
			});
		}
	}

	handleSetChannelMute({ channelIndex, muted }) {
		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		if (channelIndex >= 0 && channelIndex < totalChannels) {
			this.state.channelMuted[channelIndex] = muted;
			if (muted) {
				this.applyChannelSilent(this.registerState, channelIndex);
				this.state.channelEnvelopeEnabled[channelIndex] = false;
				if (this.ayumiEngine) {
					this._applyRegisterStateToEngine();
				}
			}
		}
	}

	_getEngineRegisterState() {
		if (this.virtualChannelMixer.hasVirtualChannels()) {
			return this.virtualChannelMixer.merge(this.registerState, this.state);
		}
		return this.registerState;
	}

	_collectHardwareRegisters() {
		const wasmModule = this.state?.wasmModule;
		const ayumiPtr = this.state?.ayumiPtr;
		const getRegisters = wasmModule?.ayumi_get_registers;
		if (typeof getRegisters === 'function' && ayumiPtr) {
			if (!this._hardwareRegistersBufferPtr) {
				this._hardwareRegistersBufferPtr = wasmModule.malloc(14);
			}
			getRegisters(ayumiPtr, this._hardwareRegistersBufferPtr);
			return Array.from(
				new Uint8Array(wasmModule.memory.buffer, this._hardwareRegistersBufferPtr, 14)
			);
		}
		return this._getEngineRegisterState().toHardwareRegisters();
	}

	_applyRegisterStateToEngine() {
		if (!this.ayumiEngine) return;
		if (this.virtualChannelMixer.hasVirtualChannels()) {
			const hwState = this._getEngineRegisterState();
			this.ayumiEngine.applyRegisterState(hwState);
			this.registerState.forceEnvelopeShapeWrite = false;
		} else {
			this.ayumiEngine.applyRegisterState(this.registerState);
		}
	}

	_applyVirtualChannelResize() {
		if (!this.virtualChannelMixer.hasVirtualChannels()) return;
		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		this.state.resizeChannels(totalChannels);
		this.registerState.resize(totalChannels);
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(totalChannels);
		}
	}

	_ensureChannelCapacity(channelCount) {
		if (channelCount <= this.registerState.channelCount) return;
		this.state.resizeChannels(channelCount);
		this.registerState.resize(channelCount);
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(channelCount);
		}
	}

	enforceMuteState() {
		const totalChannels = this.registerState.channelCount;
		for (let ch = 0; ch < totalChannels; ch++) {
			if (this.state.channelMuted[ch]) {
				this.applyChannelSilent(this.registerState, ch);
				this.state.channelEnvelopeEnabled[ch] = false;
			}
		}
	}

	ensurePlaybackWorkers() {
		if (!this.audioDriver || !this.patternProcessor || !this.ayumiEngine) {
			this.audioDriver = new AYAudioDriver();
			this.ayumiEngine = new AyumiEngine(this.state.wasmModule, this.state.ayumiPtr);
			this.patternProcessor = new TrackerPatternProcessor(
				this.state,
				this.audioDriver,
				this.port
			);
			this._applyVirtualChannelResize();
		}
	}

	_resetEnginesForPreview() {
		resetChipPlaybackOutput({
			audioDriver: this.audioDriver,
			chipEngine: this.ayumiEngine
		});
	}

	_silencePreviewChannel(channelIndex) {
		this.applyChannelSilent(this.registerState, channelIndex);
	}

	canRender() {
		return Boolean(this.initialized && this.state.wasmModule && this.state.ayumiPtr);
	}
}
