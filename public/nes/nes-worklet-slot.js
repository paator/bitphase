import NesState from './nes-state.js';
import NesAudioDriver from './nes-audio-driver.js';
import NesApuEngine, { createNesApuEngine } from './nes-apu-engine.js';
import NesChipRegisterState from './nes-chip-register-state.js';
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
		this.channelWaveformBuf = Array.from({ length: NES_CHANNEL_COUNT }, () => new Float32Array(512));
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
		this.apuEngine.applyRegisterState(this.registerState);
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
		}
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
		this._applyRegisterStateToEngine();
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

	handleSetChannelMute({ channelIndex, muted }) {
		if (channelIndex >= 0 && channelIndex < this.state.channelMuted.length) {
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
		return this.initialized && this.state.wasmModule && this.state.apuPtr;
	}

	_collectPlaybackHz() {
		const toneHz = [];
		const cpuFrequency = this.state.cpuFrequency;
		for (let i = 0; i < NES_CHANNEL_COUNT; i++) {
			const period = this.registerState.channels[i]?.period ?? 0;
			if (period <= 0 || !this.registerState.channels[i]?.enabled) {
				toneHz.push(null);
			} else if (i <= 2) {
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
		for (let ch = 0; ch < this.channelWaveformBuf.length; ch++) {
			const sample = this.waveformCapture.sample(
				ch,
				this.registerState.channels[ch],
				cpuFrequency,
				sampleRate
			);
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
