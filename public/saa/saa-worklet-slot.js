import SaaState from './saa-state.js';
import SaaAudioDriver, { resolveSaaHardwareState } from './saa-audio-driver.js';
import SaaVirtualChannelMixer from './saa-virtual-channel-mixer.js';
import SaaRegisterState from './saa-register-state.js';
import { createSaaSoundEngine } from './saa-engine.js';
import { saaPeriodFromCode, saaToneFrequency } from './saa-levels.js';
import { SaaWaveformCapture } from './saa-waveform.js';
import { SAA_CHANNEL_COUNT } from './saa-constants.js';
import { saaWasmImports } from './saa-wasm-imports.js';
import TrackerPatternProcessor from '../tracker/tracker-pattern-processor.js';
import { TrackerWorkletSlot } from '../tracker/tracker-worklet-slot.js';

export class SaaWorkletSlot extends TrackerWorkletSlot {
	constructor(port, chipIndex, sharedTimeline) {
		super(port, chipIndex);
		this.state = new SaaState(sharedTimeline);
		this.initialized = false;
		this.audioDriver = null;
		this.patternProcessor = null;
		this.engine = null;
		this.registerState = new SaaRegisterState(SAA_CHANNEL_COUNT);
		this.virtualChannelMixer = new SaaVirtualChannelMixer();
		this.virtualChannelMap = {};
		this.virtualChannelRoles = {};
		this.hwChannelCount = SAA_CHANNEL_COUNT;
		this.waveformCapture = new SaaWaveformCapture(SAA_CHANNEL_COUNT);
		this.waveformPostCounter = 0;
		this.waveformPostInterval = 6;
	}

	_slotState() {
		return this.state;
	}

	_isReadyForPlayback() {
		return Boolean(this.initialized && this.state.wasmModule && this.state.chipPtr);
	}

	_chipEngineReady() {
		return this._playbackWorkersReady() && this.engine;
	}

	_applyPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.state.publishPlaybackSpeed(speed);
	}

	_silencePlaybackOutput() {
		this.registerState.reset();
		this.engine?.reset();
		this.waveformCapture.reset();
		this.waveformPostCounter = 0;
	}

	_prepareOutputForPlay() {
		this._silencePlaybackOutput();
	}

	_onTransportStop() {
		this._silencePlaybackOutput();
	}

	_engineRegisterState() {
		return resolveSaaHardwareState(
			this.audioDriver,
			this.virtualChannelMixer,
			this.registerState,
			this.state
		);
	}

	_applyRegisterStateToEngine() {
		this.engine?.apply(this._engineRegisterState());
	}

	_dispatchChipPortMessage(type, data) {
		if (type !== 'set_virtual_channel_config') return false;
		this.handleSetVirtualChannelConfig(data);
		return true;
	}

	_resetEnginesForPreview() {
		this.engine?.reset();
	}

	_silencePreviewChannel(channelIndex) {
		const channel = this.registerState.channels[channelIndex];
		if (!channel) return;
		channel.tone = false;
		channel.noise = false;
		channel.left = 0;
		channel.right = 0;
	}

	async handleMessage(payload) {
		if (payload == null || typeof payload !== 'object') return;
		const { type, ...data } = payload;
		if (type === undefined) return;
		switch (type) {
			case 'init':
				await this.handleInit(data);
				break;
			case 'update_clock_rate':
				this.handleUpdateClockRate(data);
				break;
			case 'update_int_frequency':
				this.handleUpdateIntFrequency(data);
				break;
			default:
				this.dispatchPortMessages(type, data);
		}
	}

	async handleInit({ wasmBuffer }) {
		if (!wasmBuffer) return;
		if (this._isReadyForPlayback()) {
			this.engine?.setClockRate(this.state.clockRate);
			this.engine?.setSampleRate(sampleRate);
			return;
		}
		try {
			const result = await WebAssembly.instantiate(wasmBuffer, saaWasmImports());
			const wasmModule = result.instance.exports;
			this.engine = createSaaSoundEngine(wasmModule, this.state.clockRate, sampleRate);
			this.state.setWasmModule(wasmModule, this.engine.chipPtr, wasmBuffer);
			this.state.updateSamplesPerTick(sampleRate);
			this.audioDriver = new SaaAudioDriver();
			this.patternProcessor = new TrackerPatternProcessor(
				this.state,
				this.audioDriver,
				this.port
			);
			this._applyVirtualChannelResize();
			this._bindVirtualChannelMode();
			this.registerState.reset();
			this.initialized = true;
			this._applyRegisterStateToEngine();
		} catch (error) {
			console.error('Failed to initialize SAA1099:', error);
		}
	}

	handleInitTuningTable({ tuningTable }) {
		const periods = Array.isArray(tuningTable)
			? tuningTable.map((code) => saaPeriodFromCode(code))
			: [];
		this.state.setTuningTable(periods);
	}

	handleUpdateClockRate({ clockRate }) {
		if (!(clockRate > 0)) return;
		this.state.setClockRate(clockRate);
		this.engine?.setClockRate(clockRate);
	}

	handleUpdateIntFrequency({ intFrequency }) {
		this.state.setIntFrequency(intFrequency, sampleRate);
	}

	handleSetVirtualChannelConfig({ virtualChannelMap, hwChannelCount, virtualChannelRoles }) {
		const nextMap = virtualChannelMap || {};
		const nextRoles = virtualChannelRoles || {};
		const nextHw = hwChannelCount || SAA_CHANNEL_COUNT;
		const configUnchanged =
			this.hwChannelCount === nextHw &&
			JSON.stringify(this.virtualChannelMap) === JSON.stringify(nextMap) &&
			JSON.stringify(this.virtualChannelRoles ?? {}) === JSON.stringify(nextRoles);
		this.virtualChannelMap = nextMap;
		this.virtualChannelRoles = nextRoles;
		this.hwChannelCount = nextHw;
		this.virtualChannelMixer.configure(this.virtualChannelMap, this.hwChannelCount, nextRoles);
		this._applyVirtualChannelResize();
		this._bindVirtualChannelMode();
		if (this.engine && !configUnchanged) {
			this._silencePlaybackOutput();
		}
	}

	_bindVirtualChannelMode() {
		if (!this.audioDriver) return;
		if (this.virtualChannelMixer.hasVirtualChannels()) {
			this.audioDriver.setVirtualChannelMode((logicalIndex) =>
				this.virtualChannelMixer.getHardwareChannelIndex(logicalIndex)
			);
			return;
		}
		this.audioDriver.setVirtualChannelMode(null);
	}

	_applyVirtualChannelResize() {
		if (!this.virtualChannelMixer.hasVirtualChannels()) return;
		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		this.state.resizeChannels(totalChannels);
		this.registerState.resize(totalChannels);
		this.audioDriver?.resizeChannels(totalChannels);
	}

	handleSetChannelMute({ channelIndex, muted }) {
		if (channelIndex < 0 || channelIndex >= this.registerState.channelCount) return;
		this.state.channelMuted[channelIndex] = muted;
		if (muted) {
			this._silencePreviewChannel(channelIndex);
			this._applyRegisterStateToEngine();
		}
	}

	enforceMuteState() {
		for (let channel = 0; channel < this.registerState.channelCount; channel++) {
			if (this.state.channelMuted[channel]) {
				this._silencePreviewChannel(channel);
			}
		}
	}

	ensurePlaybackWorkers() {
		if (!this.audioDriver || !this.patternProcessor || !this.engine) {
			if (!this.state.wasmModule) return;
			this.engine = createSaaSoundEngine(
				this.state.wasmModule,
				this.state.clockRate,
				sampleRate
			);
			this.state.chipPtr = this.engine.chipPtr;
			this.audioDriver = new SaaAudioDriver();
			this.patternProcessor = new TrackerPatternProcessor(
				this.state,
				this.audioDriver,
				this.port
			);
			this._applyVirtualChannelResize();
			this._bindVirtualChannelMode();
		}
	}

	canRender() {
		return this._isReadyForPlayback();
	}

	accumulateStereoOutput(sampleIndex, mix) {
		if (!this.engine) return;
		const sample = this.engine.generate();
		mix.l += sample.left;
		mix.r += sample.right;
		this.waveformCapture.writeSample(sampleIndex, sample.channels, this._waveformMuted());
	}

	handlePreviewRow(data) {
		this.waveformCapture.reset();
		this.waveformPostCounter = 0;
		super.handlePreviewRow(data);
	}

	handleStopPreview(channel) {
		if (channel === undefined) {
			this.waveformCapture.reset();
			this.waveformPostCounter = 0;
		}
		super.handleStopPreview(channel);
	}

	_waveformMuted() {
		if (!this.virtualChannelMixer.hasVirtualChannels()) return this.state.channelMuted;
		return this.virtualChannelMixer.groups.map((group) =>
			group.virtualIndices.every((index) => this.state.channelMuted[index])
		);
	}

	_collectChannelLevels() {
		const audible = this.virtualChannelMixer.hasVirtualChannels()
			? new Set(this.virtualChannelMixer.getAudibleVirtualChannelIndices(this.registerState))
			: null;
		const levels = [];
		for (let channel = 0; channel < this.registerState.channelCount; channel++) {
			if (audible && !audible.has(channel)) {
				levels.push(0);
				continue;
			}
			const source = this.registerState.channels[channel];
			if (!(source?.tone || source?.noise) || this.state.channelMuted[channel]) {
				levels.push(0);
				continue;
			}
			levels.push(Math.max(source.left, source.right) / 15);
		}
		return levels;
	}

	_collectToneHz() {
		const frequencies = [];
		for (let channel = 0; channel < this.registerState.channelCount; channel++) {
			const source = this.registerState.channels[channel];
			if (!(source?.tone || source?.noise)) {
				frequencies.push(null);
				continue;
			}
			const hz = saaToneFrequency(this.state.clockRate, source.octave, source.freq);
			frequencies.push(hz > 0 ? hz : null);
		}
		return frequencies;
	}

	finishAudioBlock(numSamples) {
		if (this.paused && !this.isPreviewActive()) {
			this.finishAudioBlockFlushTransport(numSamples, this.paused);
			return;
		}
		this.waveformCapture.advance(numSamples);
		this.waveformPostCounter++;
		if (this.waveformPostCounter >= this.waveformPostInterval) {
			this.waveformPostCounter = 0;
			const frequencies = this._collectToneHz();
			this._post({ type: 'channel_waveform', channels: this.waveformCapture.snapshot() });
			this._post({ type: 'channel_levels', levels: this._collectChannelLevels() });
			this._post({
				type: 'channel_tone_hz',
				frequencies,
				sidTimerHz: frequencies.map(() => null),
				syncbuzzerTimerHz: frequencies.map(() => null),
				registers: []
			});
		}
		this.finishAudioBlockFlushTransport(numSamples, this.paused);
	}
}
