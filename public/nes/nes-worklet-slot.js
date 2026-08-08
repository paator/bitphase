import NesState from './nes-state.js';
import NesAudioDriver from './nes-audio-driver.js';
import NesApuEngine, { createNesApuEngine } from './nes-apu-engine.js';
import NesChipRegisterState from './nes-chip-register-state.js';
import NesVirtualChannelMixer from './nes-virtual-channel-mixer.js';
import { NesWaveformCapture } from './nes-waveform-capture.js';
import TrackerPatternProcessor from '../tracker/tracker-pattern-processor.js';
import { TrackerWorkletSlot } from '../tracker/tracker-worklet-slot.js';
import { resetChipPlaybackOutput } from '../tracker/tracker-engine-transport.js';
import { NES_CHANNEL_COUNT } from './nes-constants.js';

export class NesWorkletSlot extends TrackerWorkletSlot {
	constructor(port, chipIndex, sharedTimeline) {
		super(port, chipIndex);
		this.state = new NesState(sharedTimeline);
		this.initialized = false;
		this.audioDriver = null;
		this.patternProcessor = null;
		this.apuEngine = null;
		this.registerState = new NesChipRegisterState(NES_CHANNEL_COUNT);
		this.virtualChannelMixer = new NesVirtualChannelMixer();
		this.virtualChannelMap = {};
		this.hwChannelCount = NES_CHANNEL_COUNT;
		this.channelWaveformBuf = Array.from(
			{ length: NES_CHANNEL_COUNT },
			() => new Float32Array(512)
		);
		this.channelWaveformWriteIndex = 0;
		this.waveformPostCounter = 0;
		this.waveformPostInterval = 6;
		this.waveformCapture = new NesWaveformCapture(NES_CHANNEL_COUNT);
	}

	_slotState() {
		return this.state;
	}

	_isReadyForPlayback() {
		return this.initialized && this.state.wasmModule && this.state.apuPtr;
	}

	_applyPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.state.publishPlaybackSpeed(speed);
	}

	_chipEngineReady() {
		return this._playbackWorkersReady() && this.apuEngine;
	}

	_prepareOutputForPlay() {
		resetChipPlaybackOutput({
			registerState: this.registerState,
			audioDriver: this.audioDriver,
			chipEngine: this.apuEngine,
			applyRegisterState: () => this._applyRegisterStateToEngine()
		});
	}

	_onTransportStop() {
		resetChipPlaybackOutput({
			registerState: this.registerState,
			audioDriver: this.audioDriver,
			chipEngine: this.apuEngine,
			applyRegisterState: () => this._applyRegisterStateToEngine()
		});
	}

	_applyRegisterStateToEngine() {
		if (!this.apuEngine) return;
		this.enforceMuteState();
		this.apuEngine.applyRegisterState(this._getEngineRegisterState());
	}

	_getEngineRegisterState() {
		if (this.virtualChannelMixer.hasVirtualChannels()) {
			return this.virtualChannelMixer.merge(this.registerState, this.state);
		}
		return this.registerState;
	}

	_dispatchChipPortMessage(type, data) {
		if (type !== 'set_virtual_channel_config') {
			return false;
		}
		this.handleSetVirtualChannelConfig(data);
		return true;
	}

	_resizeForPatternChannels(channelCount) {
		this._ensureChannelCapacity(channelCount);
	}

	handleSetVirtualChannelConfig({ virtualChannelMap, hwChannelCount }) {
		this.virtualChannelMap = virtualChannelMap || {};
		this.hwChannelCount = hwChannelCount || NES_CHANNEL_COUNT;
		this.virtualChannelMixer.configure(this.virtualChannelMap, this.hwChannelCount);

		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		this.state.resizeChannels(totalChannels);
		this.registerState.resize(totalChannels);
		this._bindAudioDriverHardwareResolver();
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(totalChannels);
		}
		if (this.apuEngine) {
			resetChipPlaybackOutput({
				registerState: this.registerState,
				audioDriver: this.audioDriver,
				chipEngine: this.apuEngine,
				applyRegisterState: () => this._applyRegisterStateToEngine()
			});
		}
	}

	_bindAudioDriverHardwareResolver() {
		this.audioDriver?.setHardwareChannelResolver?.((logicalIndex) =>
			this.virtualChannelMixer.hasVirtualChannels()
				? this.virtualChannelMixer.getHardwareChannelIndex(logicalIndex)
				: logicalIndex
		);
	}

	_applyVirtualChannelResize() {
		if (!this.virtualChannelMixer.hasVirtualChannels()) return;
		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		this.state.resizeChannels(totalChannels);
		this.registerState.resize(totalChannels);
		this._bindAudioDriverHardwareResolver();
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(totalChannels);
		}
	}

	_ensureChannelCapacity(channelCount) {
		if (channelCount <= this.registerState.channelCount) return;
		this.state.resizeChannels(channelCount);
		this.registerState.resize(channelCount);
		this._bindAudioDriverHardwareResolver();
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(channelCount);
		}
	}

	ensurePlaybackWorkers() {
		if (!this.audioDriver || !this.patternProcessor || !this.apuEngine) {
			this.audioDriver = new NesAudioDriver();
			this.apuEngine = new NesApuEngine(
				this.state.wasmModule,
				this.state.apuPtr,
				this.state.dmcPtr
			);
			this.apuEngine.setCpuFrequency(this.state.cpuFrequency);
			this.apuEngine.setChipVariant(this.state.chipVariant);
			this.patternProcessor = new TrackerPatternProcessor(
				this.state,
				this.audioDriver,
				this.port
			);
			this._bindAudioDriverHardwareResolver();
			this._applyVirtualChannelResize();
		}
	}

	_processTrackerTick() {
		this.patternProcessor.processTables();
		this.patternProcessor.processArpeggio();
		this.patternProcessor.processEffectTables();
		this.audioDriver.processInstruments(this.state, this.registerState);
		this.audioDriver.advancePulseWidthTable(this.state);
		this.audioDriver.advanceSweepTable(this.state);
		this.audioDriver.syncSweepTableRegisterState(this.state, this.registerState);
		this.patternProcessor.processVibrato();
		this.patternProcessor.processSlides();
	}

	runPreviewStep() {
		this.previewTickSampleCounter++;
		if (this.previewTickSampleCounter >= this.state.timeline.samplesPerTick) {
			this.previewTickSampleCounter = 0;
			this.patternProcessor.processTables();
			if (this.state.channelInstruments) {
				this.audioDriver.processInstruments(this.state, this.registerState);
				this.audioDriver.advancePulseWidthTable(this.state);
				this.audioDriver.advanceSweepTable(this.state);
				this.audioDriver.syncSweepTableRegisterState(this.state, this.registerState);
			}
		}
		this._applyRegisterStateToEngine();
	}

	resetChannelWaveformCapture() {
		for (const buf of this.channelWaveformBuf) {
			buf.fill(0);
		}
		this.channelWaveformWriteIndex = 0;
		this.waveformPostCounter = 0;
		this.waveformCapture.reset();
	}

	enforceMuteState() {
		for (let ch = 0; ch < this.registerState.channelCount; ch++) {
			if (this.state.channelMuted[ch]) {
				this.audioDriver._silenceChannel(this.registerState, ch);
			}
		}
	}

	async handleMessage(payload) {
		if (payload == null || typeof payload !== 'object') return;
		const { type, ...data } = payload;
		if (type === undefined) return;

		switch (type) {
			case 'init':
				await this.handleInit(data);
				break;
			case 'update_cpu_frequency':
				this.handleUpdateCpuFrequency(data);
				break;
			case 'update_chip_variant':
				this.handleUpdateChipVariant(data);
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
			this.apuEngine?.setCpuFrequency(this.state.cpuFrequency);
			this.apuEngine?.setChipVariant(this.state.chipVariant);
			return;
		}

		try {
			const result = await WebAssembly.instantiate(wasmBuffer, {
				env: { emscripten_notify_memory_growth: () => {} }
			});
			const wasmModule = result.instance.exports;
			const { engine, apuPtr, dmcPtr } = createNesApuEngine(wasmModule);

			this.state.setWasmModule(wasmModule, apuPtr, dmcPtr, wasmBuffer);
			this.state.updateSamplesPerTick(sampleRate);
			this.audioDriver = new NesAudioDriver();
			this.apuEngine = engine;
			this.apuEngine.setCpuFrequency(this.state.cpuFrequency);
			this.apuEngine.setChipVariant(this.state.chipVariant);
			this.patternProcessor = new TrackerPatternProcessor(
				this.state,
				this.audioDriver,
				this.port
			);
			this._bindAudioDriverHardwareResolver();
			this._applyVirtualChannelResize();
			this.registerState.reset();
			this.initialized = true;
		} catch (error) {
			console.error('Failed to initialize NES APU:', error);
		}
	}

	handleUpdateCpuFrequency({ cpuFrequency }) {
		if (!(cpuFrequency > 0)) return;
		this.state.setCpuFrequency(cpuFrequency);
		this.apuEngine?.setCpuFrequency(cpuFrequency);
	}

	handleUpdateChipVariant({ chipVariant }) {
		this.state.setChipVariant(chipVariant);
		this.apuEngine?.setChipVariant(chipVariant);
	}

	handleUpdateIntFrequency({ intFrequency }) {
		this.state.setIntFrequency(intFrequency, sampleRate);
	}

	handleSetChannelMute({ channelIndex, muted }) {
		const totalChannels = this.virtualChannelMixer.getTotalVirtualChannelCount();
		if (channelIndex >= 0 && channelIndex < totalChannels) {
			this.state.channelMuted[channelIndex] = muted;
			if (muted) {
				this.audioDriver?._silenceChannel(this.registerState, channelIndex);
				this._applyRegisterStateToEngine();
			}
		}
	}

	_beforePreviewRow() {
		this.resetChannelWaveformCapture();
	}

	_beforeStopPreviewAll() {
		this.resetChannelWaveformCapture();
	}

	_resetEnginesForPreview() {
		resetChipPlaybackOutput({ chipEngine: this.apuEngine });
	}

	_silencePreviewChannel(channelIndex) {
		this.audioDriver?._silenceChannel(this.registerState, channelIndex);
	}

	canRender() {
		return Boolean(this.initialized && this.state.wasmModule && this.state.apuPtr);
	}

	_isLogicalChannelAudible(channelIndex) {
		return (
			!this.state.channelMuted[channelIndex] &&
			this.state.channelSoundEnabled[channelIndex]
		);
	}

	_isHardwareChannelAudible(hardwareChannelIndex) {
		if (this.virtualChannelMixer.hasVirtualChannels()) {
			const total = this.virtualChannelMixer.getTotalVirtualChannelCount();
			for (let logical = 0; logical < total; logical++) {
				if (
					this.virtualChannelMixer.getHardwareChannelIndex(logical) !==
					hardwareChannelIndex
				) {
					continue;
				}
				if (this._isLogicalChannelAudible(logical)) {
					return true;
				}
			}
			return false;
		}
		return this._isLogicalChannelAudible(hardwareChannelIndex);
	}

	_collectChannelLevels() {
		const channelCount = this.registerState.channelCount;
		const levels = new Array(channelCount).fill(0);
		const audibleIndices = this.virtualChannelMixer.hasVirtualChannels()
			? new Set(this.virtualChannelMixer.getAudibleVirtualChannelIndices(this.registerState))
			: null;

		for (let i = 0; i < channelCount; i++) {
			if (!this._isLogicalChannelAudible(i)) continue;
			if (audibleIndices && !audibleIndices.has(i)) continue;

			const channel = this.registerState.channels[i];
			if (!channel?.enabled && (channel?.volume ?? 0) <= 0) continue;

			const hwType = this.virtualChannelMixer.hasVirtualChannels()
				? this.virtualChannelMixer.getHardwareChannelIndex(i)
				: i;
			if (hwType === 2) {
				levels[i] = channel.enabled ? 1 : 0;
			} else if (hwType === 4) {
				levels[i] = Math.min(1, (channel.volume ?? 0) / 127);
			} else {
				levels[i] = Math.min(1, Math.max(0, (channel.volume ?? 0) / 15));
			}
		}
		return levels;
	}

	_collectPlaybackHz() {
		const toneHz = [];
		const cpuFrequency = this.state.cpuFrequency;
		const channelCount = this.registerState.channelCount;
		for (let i = 0; i < channelCount; i++) {
			const channel = this.registerState.channels[i];
			const period = channel?.period ?? 0;
			const hwType = this.virtualChannelMixer.hasVirtualChannels()
				? this.virtualChannelMixer.getHardwareChannelIndex(i)
				: i;
			if (period <= 0 || !channel?.enabled) {
				toneHz.push(null);
			} else if (hwType <= 2) {
				toneHz.push(cpuFrequency / (16 * (period + 1)));
			} else {
				toneHz.push(null);
			}
		}
		return { toneHz };
	}

	accumulateStereoOutput(sampleIndex, mix) {
		if (!this.apuEngine) return;
		const { left, right } = this.apuEngine.process(sampleRate);
		mix.l += left;
		mix.r += right;

		const cpuFrequency = this.state.cpuFrequency;
		const wi = this.channelWaveformWriteIndex;
		const emulatorOutputs = this.waveformCapture.readChannelOutputs(this.apuEngine);
		const hwState = this._getEngineRegisterState();
		for (let ch = 0; ch < this.channelWaveformBuf.length; ch++) {
			const channel = hwState.channels[ch];
			const sample =
				emulatorOutputs != null
					? this._isHardwareChannelAudible(ch) && channel?.enabled
						? emulatorOutputs[ch]
						: 0
					: this._isHardwareChannelAudible(ch)
						? this.waveformCapture.sample(ch, channel, cpuFrequency, sampleRate)
						: 0;
			this.channelWaveformBuf[ch][(wi + sampleIndex) % 512] = sample;
		}
	}

	finishAudioBlock(numSamples) {
		if (this.paused && !this.isPreviewActive()) {
			this.finishAudioBlockFlushTransport(numSamples, this.paused);
			return;
		}
		this.channelWaveformWriteIndex = (this.channelWaveformWriteIndex + numSamples) % 512;
		this.waveformPostCounter++;
		if (this.waveformPostCounter >= this.waveformPostInterval) {
			this.waveformPostCounter = 0;
			const wi = this.channelWaveformWriteIndex;
			const channels = this.channelWaveformBuf.map((buf) => {
				const out = new Float32Array(512);
				for (let j = 0; j < 512; j++) {
					out[j] = buf[(wi + j) % 512];
				}
				return out;
			});
			this._post({ type: 'channel_waveform', channels });
			this._post({ type: 'channel_levels', levels: this._collectChannelLevels() });
			const playbackHz = this._collectPlaybackHz();
			this._post({
				type: 'channel_tone_hz',
				frequencies: playbackHz.toneHz,
				sidTimerHz: [],
				syncbuzzerTimerHz: [],
				registers: []
			});
		}
		this.finishAudioBlockFlushTransport(numSamples, this.paused);
	}

	handleStop() {
		this.resetChannelWaveformCapture();
		super.handleStop();
	}
}

export default NesWorkletSlot;
