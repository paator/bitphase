import {
	AYUMI_STRUCT_SIZE,
	AYUMI_STRUCT_LEFT_OFFSET,
	AYUMI_STRUCT_RIGHT_OFFSET,
	AYUMI_STRUCT_CHANNEL_OUT_OFFSET,
	getPanSettingsForLayout,
	DEFAULT_AYM_FREQUENCY
} from './ayumi-constants.js';
import AyumiState from './ayumi-state.js';
import TrackerPatternProcessor from './tracker-pattern-processor.js';
import AYAudioDriver from './ay-audio-driver.js';
import AyumiEngine from './ayumi-engine.js';
import AYChipRegisterState from './ay-chip-register-state.js';
import VirtualChannelMixer from './virtual-channel-mixer.js';

class AyumiProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.initialized = false;
		this.state = new AyumiState();
		this.audioDriver = null;
		this.patternProcessor = null;
		this.ayumiEngine = null;
		this.registerState = new AYChipRegisterState();
		this.virtualChannelMixer = new VirtualChannelMixer();
		this.virtualChannelMap = {};
		this.hwChannelCount = 3;
		this.port.onmessage = this.handleMessage.bind(this);
		this.aymFrequency = 1773400;
		this.paused = true;
		this.fadeInSamples = 0;
		this.fadeInDuration = 0.01;
		this.previewActiveChannels = new Set();
		this.previewTickSampleCounter = 0;
		this.pendingRowAfterPatternChange = null;
		this.lastPositionUpdateTime = 0;
		this.positionUpdateThrottleMs = 16;
		this.pendingPositionUpdate = null;
		this.stereoLayout = 'ABC';
		this.nextPatternRequested = false;
		this.pendingNextPattern = null;
		this.prefetchLeadRows = 8;
		this.channelWaveformBuf = [
			new Float32Array(512),
			new Float32Array(512),
			new Float32Array(512)
		];
		this.channelWaveformWriteIndex = 0;
		this.waveformPostCounter = 0;
		this.waveformPostInterval = 6;
		this.timerCounter = [0, 0, 0];
		this.timerPeriod = [0, 0, 0];
		this.timerOutput = [0, 0, 0];
		this.timerEnabled = [false, false, false];
		this.timerUpdate = [false, false, false];
		this.channelVol = [0, 0, 0];
		this.envelopeShape = 0;
		this.timerFrequency = this.aymFrequency; // not to be confused with timerPeriod
		this.timerDivide = true; // false if using atari ST scheme
		this.prescalers = [1, 4, 10, 16, 50, 64, 100, 200];
		this.timerScheme = 'simple';
	}

	async handleMessage(event) {
		const { type, ...data } = event.data;

		switch (type) {
			case 'init':
				await this.handleInit(data);
				break;
			case 'play':
				this.handlePlay(data);
				break;
			case 'play_from_row':
				this.handlePlayFromRow(data);
				break;
			case 'play_from_position':
				this.handlePlayFromPosition(data);
				break;
			case 'stop':
				this.handleStop();
				break;
			case 'init_pattern':
				this.handleInitPattern(data);
				break;
			case 'update_order':
				this.handleUpdateOrder(data);
				break;
			case 'set_pattern_data':
				this.handleSetPatternData(data);
				break;
			case 'init_tuning_table':
				this.handleInitTuningTable(data);
				break;
			case 'init_speed':
				this.handleInitSpeed(data);
				break;
			case 'init_tables':
				this.handleInitTables(data);
				break;
			case 'init_instruments':
				this.handleInitInstruments(data);
				break;
			case 'update_ay_frequency':
				this.handleUpdateAyFrequency(data);
				break;
			case 'update_int_frequency':
				this.handleUpdateIntFrequency(data);
				break;
			case 'update_timer_frequency':
				this.handleUpdateTimerFrequency(data);
				break;
			case 'update_timer_scheme':
				this.handleUpdateTimerScheme(data);
				break;
			case 'update_chip_variant':
				this.handleUpdateChipVariant(data);
				break;
			case 'update_stereo_layout':
				this.handleUpdateStereoLayout(data);
				break;
			case 'set_channel_mute':
				this.handleSetChannelMute(data);
				break;
			case 'change_pattern_during_playback':
				this.handleChangePatternDuringPlayback(data);
				break;
			case 'preview_row':
				this.handlePreviewRow(data);
				break;
			case 'stop_preview':
				this.handleStopPreview(data.channel);
				break;
			case 'set_virtual_channel_config':
				this.handleSetVirtualChannelConfig(data);
				break;
		}
	}

	async handleInit({ wasmBuffer }) {
		if (!wasmBuffer) return;

		try {
			const result = await WebAssembly.instantiate(wasmBuffer, {
				env: { emscripten_notify_memory_growth: () => {} }
			});

			const wasmModule = result.instance.exports;
			const ayumiPtr = wasmModule.malloc(AYUMI_STRUCT_SIZE);

			this.aymFrequency = this.state.aymFrequency ?? DEFAULT_AYM_FREQUENCY;
			const isYM = this.state.isYM ?? 0;
			wasmModule.ayumi_configure(ayumiPtr, isYM, this.aymFrequency, sampleRate);
			if (this.timerFrequency === this.aymFrequency || this.timerFrequency === 0) {
				this.timerFrequency = this.aymFrequency;
			}

			this.applyPanSettings(wasmModule, ayumiPtr);

			this.state.setWasmModule(wasmModule, ayumiPtr, wasmBuffer);
			this.state.updateSamplesPerTick(sampleRate);
			this.audioDriver = new AYAudioDriver();
			this.ayumiEngine = new AyumiEngine(wasmModule, ayumiPtr);
			this.patternProcessor = new TrackerPatternProcessor(
				this.state,
				this.audioDriver,
				this.port
			);
			this._applyVirtualChannelResize();
			this.initialized = true;
		} catch (error) {
			console.error('Failed to initialize Ayumi:', error);
		}
	}

	handleInitTuningTable(data) {
		this.state.setTuningTable(data.tuningTable);
	}

	handleInitSpeed(data) {
		this.state.setSpeed(data.speed);
	}

	handleInitTables(data) {
		this.state.setTables(data.tables);
	}

	handleInitInstruments(data) {
		this.state.setInstruments(data.instruments);
	}

	handleInitPattern(data) {
		if (
			data.patternOrderIndex !== undefined &&
			this.state.currentPatternOrderIndex !== data.patternOrderIndex
		) {
			this.state.currentPattern = null;
		}
		if (data.pattern?.channels?.length) {
			this._ensureChannelCapacity(data.pattern.channels.length);
		}
		this.state.setPattern(data.pattern, data.patternOrderIndex);
	}

	handleUpdateOrder(data) {
		this.state.setPatternOrder(data.order);
	}

	handleSetPatternData(data) {
		if (data.pattern?.channels?.length) {
			this._ensureChannelCapacity(data.pattern.channels.length);
		}
		if (data.patternOrderIndex !== this.state.currentPatternOrderIndex) {
			this.pendingNextPattern = {
				pattern: data.pattern,
				orderIndex: data.patternOrderIndex
			};
			this.nextPatternRequested = false;
			return;
		}

		this.state.setPattern(data.pattern, data.patternOrderIndex);
		this.pendingNextPattern = null;

		const hadPendingRow = this.pendingRowAfterPatternChange !== null;
		if (this.pendingRowAfterPatternChange !== null) {
			this.state.currentRow = this.pendingRowAfterPatternChange;
			this.state.currentTick = 0;
			this.state.tickAccumulator = 1.0;
			this.pendingRowAfterPatternChange = null;
		}

		if (hadPendingRow && !this.paused) {
			this.runCatchUpRows(this.state.currentRow);
		}

		if (!this.paused) {
			this.postPositionUpdate();
		}
	}

	handleUpdateAyFrequency(data) {
		this.state.setAymFrequency(data.aymFrequency);
		this.handleInit({ wasmBuffer: this.state.wasmBuffer });
	}

	handleUpdateIntFrequency(data) {
		this.state.setIntFrequency(data.intFrequency, sampleRate);
	}

	handleUpdateChipVariant(data) {
		this.state.setChipVariant(data.chipVariant);
		this.handleInit({ wasmBuffer: this.state.wasmBuffer });
	}

	applyPanSettings(wasmModule, ayumiPtr) {
		if (!wasmModule || !ayumiPtr) return;
		const settings = getPanSettingsForLayout(this.stereoLayout);
		settings.forEach(({ channel, pan, isEqp }) => {
			wasmModule.ayumi_set_pan(ayumiPtr, channel, pan, isEqp);
		});
	}

	handleUpdateStereoLayout({ stereoLayout }) {
		this.stereoLayout = stereoLayout || 'ABC';
		if (this.state.wasmModule && this.state.ayumiPtr) {
			this.applyPanSettings(this.state.wasmModule, this.state.ayumiPtr);
		}
	}

	applyChannelSilent(registerState, channelIndex) {
		registerState.channels[channelIndex].volume = 0;
		registerState.channels[channelIndex].mixer = {
			tone: false,
			noise: false,
			envelope: false
		};
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

	handleChangePatternDuringPlayback({ row, patternOrderIndex, pattern, speed }) {
		if (!this.state.wasmModule || !this.initialized || this.paused) {
			return;
		}

		if (pattern?.channels?.length) {
			this._ensureChannelCapacity(pattern.channels.length);
		}

		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
		this.pendingPositionUpdate = null;
		let patternChanged = false;

		if (patternOrderIndex !== undefined) {
			const patternOrderChanged = this.state.currentPatternOrderIndex !== patternOrderIndex;
			this.state.currentPatternOrderIndex = patternOrderIndex;

			if (pattern) {
				this.state.setPattern(pattern, patternOrderIndex);
				patternChanged = true;
			} else if (patternOrderChanged && !this.state.currentPattern) {
				this.port.postMessage({
					type: 'request_pattern',
					patternOrderIndex: patternOrderIndex
				});
				if (row !== undefined) {
					this.pendingRowAfterPatternChange = row;
				}
			}
		} else if (pattern) {
			this.state.setPattern(pattern, this.state.currentPatternOrderIndex);
			patternChanged = true;
		}

		if (speed !== undefined && speed !== null && speed > 0) {
			this.state.setSpeed(speed);
		}

		if (row !== undefined && (patternChanged || this.state.currentPattern)) {
			this.state.currentRow = row;
			this.state.currentTick = 0;
			this.state.tickAccumulator = 1.0;
		} else if (row !== undefined && !patternChanged) {
			this.pendingRowAfterPatternChange = row;
		}

		this.postPositionUpdate();
	}

	handlePlay({ startPatternOrderIndex, initialSpeed }) {
		if (!this.state.wasmModule || !this.initialized) {
			console.warn('Play aborted: wasmModule not initialized');
			return;
		}

		this.startPlaybackCommon();

		if (startPatternOrderIndex !== undefined) {
			this.state.currentPatternOrderIndex = startPatternOrderIndex;
		}
		if (initialSpeed !== undefined && initialSpeed > 0) {
			this.state.setSpeed(initialSpeed);
		}

		this.postPositionUpdate();
	}

	handlePlayFromRow({ row, patternOrderIndex, speed }) {
		if (!this.state.wasmModule || !this.initialized) {
			console.warn('Play aborted: wasmModule not initialized');
			return;
		}

		this.startPlaybackCommon();

		if (patternOrderIndex !== undefined) {
			if (this.state.currentPatternOrderIndex !== patternOrderIndex) {
				this.state.currentPattern = null;
			}
			this.state.currentPatternOrderIndex = patternOrderIndex;
			this.port.postMessage({
				type: 'request_pattern',
				patternOrderIndex: patternOrderIndex
			});
		}
		this.state.currentRow = row;
		if (speed !== undefined && speed !== null && speed > 0) {
			this.state.setSpeed(speed);
		}

		this.postPositionUpdate();
		this.runCatchUpRows(this.state.currentRow);
	}

	handlePlayFromPosition({
		catchUpSegments,
		startPattern,
		startPatternOrderIndex,
		startRow,
		speed
	}) {
		if (!this.state.wasmModule || !this.initialized) {
			console.warn('Play aborted: wasmModule not initialized');
			return;
		}

		this.startPlaybackCommon();

		if (speed !== undefined && speed !== null && speed > 0) {
			this.state.setSpeed(speed);
		}

		if (
			catchUpSegments?.length &&
			this.patternProcessor &&
			this.audioDriver &&
			this.ayumiEngine
		) {
			for (const segment of catchUpSegments) {
				if (segment.pattern?.channels?.length) {
					this._ensureChannelCapacity(segment.pattern.channels.length);
				}
				this.state.setPattern(segment.pattern, segment.patternOrderIndex);
				const numRows = segment.numRows ?? 0;
				for (let r = 0; r < numRows; r++) {
					this._simulateRow(this.state.currentPattern, r);
				}
			}
		}

		if (startPattern?.channels?.length) {
			this._ensureChannelCapacity(startPattern.channels.length);
		}
		this.state.setPattern(startPattern, startPatternOrderIndex);
		this.state.currentPatternOrderIndex = startPatternOrderIndex;
		this.state.currentRow = startRow;

		this.postPositionUpdate();
	}

	_simulateRow(pattern, rowIndex) {
		this.patternProcessor.parsePatternRow(pattern, rowIndex, this.registerState);
		this.patternProcessor.processSpeedTable();
		const ticksPerRow = this.state.currentSpeed;
		for (let tick = 0; tick < ticksPerRow; tick++) {
			this.patternProcessor.processTables();
			this.patternProcessor.processArpeggio();
			this.patternProcessor.processEffectTables();
			this.audioDriver.processInstruments(this.state, this.registerState);
			this.patternProcessor.processVibrato();
			this.patternProcessor.processSlides();
		}
		this._applyRegisterStateToEngine();
	}

	_applyRegisterStateToEngine() {
		if (!this.ayumiEngine) return;
		let newState;
		if (this.virtualChannelMixer.hasVirtualChannels()) {
			const hwState = this.virtualChannelMixer.merge(this.registerState, this.state);
			newState = hwState;
			newState.forceEnvelopeShapeWrite = false;
		} else {
			newState = this.registerState;
		}
		for (let i = 0; i < Math.min(3, newState.channelCount); i++) {
			this.channelVol[i] = newState.channels[i].volume;
			this.envelopeShape = newState.envelopeShape;
		}
		this.ayumiEngine.applyRegisterState(newState);
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
		this._applyRegisterStateToEngine();
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

	startPlaybackCommon() {
		this.paused = false;
		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
		this.fadeInSamples = Math.floor(sampleRate * this.fadeInDuration);
		this.registerState.reset();
		if (this.ayumiEngine) {
			this.ayumiEngine.reset();
			this._applyRegisterStateToEngine();
		}
		this.state.reset();
		this.ensurePlaybackWorkers();
		this.enforceMuteState();
	}

	postPositionUpdate() {
		this.port.postMessage({
			type: 'position_update',
			currentRow: this.state.currentRow,
			currentTick: this.state.currentTick,
			currentPatternOrderIndex: this.state.currentPatternOrderIndex
		});
		this.lastPositionUpdateTime = 0;
		this.pendingPositionUpdate = null;
	}

	runCatchUpRows(upToRow) {
		if (
			!this.state.currentPattern ||
			this.state.currentPattern.length === 0 ||
			upToRow <= 0 ||
			!this.patternProcessor ||
			!this.audioDriver ||
			!this.ayumiEngine
		) {
			return;
		}
		for (let r = 0; r < upToRow; r++) {
			this._simulateRow(this.state.currentPattern, r);
		}
	}

	handleStop() {
		this.paused = true;
		this.registerState.reset();
		this._applyRegisterStateToEngine();
		this.state.reset();
		this.state.currentPattern = null;
		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
		this.handleStopPreview();
	}

	calculateAtariPeriod(period, clock) {
		if (period === 0) return 0;

		const clockRatio = clock / (this.aymFrequency / 8);

		let idx;
		if (period < (256 * 4) / clockRatio) idx = 1;
		else if (period < (256 * 10) / clockRatio) idx = 2;
		else if (period < (256 * 16) / clockRatio) idx = 3;
		else if (period < (256 * 50) / clockRatio) idx = 4;
		else if (period < (256 * 64) / clockRatio) idx = 5;
		else if (period < (256 * 100) / clockRatio) idx = 6;
		else idx = 7;

		const dr = (period * clockRatio) / this.prescalers[idx];
		const data = dr + 0.5 >= 256 ? 0 : Math.floor(dr + 0.5);
		console.log(period, clock, data, idx, this.prescalers[idx], data * this.prescalers[idx]);
		return data * this.prescalers[idx];
	}

	handleTimerPeriod() {
		const clockRatio = this.timerFrequency / this.aymFrequency;
		for (let c = 0; c < 3; c++) {
			this.timerEnabled[c] = this.state.channelTimerEnabled[c];
			if (!this.timerEnabled[c]) continue;
			let periodVal;
			if (this.timerScheme === 'Simple')
				periodVal = this.registerState.channels[c].tone * clockRatio + 1;
			else if (this.timerScheme === 'Atari')
				periodVal = this.calculateAtariPeriod(
					this.registerState.channels[c].tone,
					this.timerFrequency
				);
			this.timerPeriod[c] = periodVal;
		}
	}

	handleTimerCount() {
		// timer //
		for (let c = 0; c < 3; c++) {
			if (this.timerDivide) this.timerCounter[c] += this.timerFrequency / 8 / sampleRate;
			else this.timerCounter[c] += this.timerFrequency / sampleRate;
			if (this.timerCounter[c] >= this.timerPeriod[c]) {
				this.timerCounter[c] -= this.timerPeriod[c];
				this.timerOutput[c] ^= 1;
				this.timerUpdate[c] = true;
			}
		}
		// timer //
	}

	handleTimerEvent() {
		for (let c = 0; c < 3; c++) {
			let outVal = this.timerOutput[c] ? this.channelVol[c] & 0x0f : 0;
			if (!this.timerEnabled[c]) outVal = this.channelVol[c];
			if (!(this.channelVol[c] & 0x10))
				this.state.wasmModule.ayumi_set_volume(this.state.ayumiPtr, c, outVal);
			if (this.channelVol[c] & 0x10 && this.timerUpdate[c])
				this.state.wasmModule.ayumi_set_envelope_shape(
					this.state.ayumiPtr,
					this.envelopeShape
				);
			this.timerUpdate[c] = false;
		}
	}

	handleUpdateTimerFrequency({ timerFrequency }) {
		if (timerFrequency > 0) this.timerFrequency = timerFrequency;
		else this.timerFrequency = this.aymFrequency;
	}

	handleUpdateTimerScheme({ timerScheme }) {
		this.timerScheme = timerScheme;
		this.timerDivide = timerScheme !== 'Atari';
	}

	handlePreviewRow({ pattern, rowIndex, instrument }) {
		if (!this.paused || !this.initialized || !this.state.wasmModule) {
			return;
		}
		if (!pattern || !pattern.channels || !pattern.patternRows || rowIndex < 0) {
			return;
		}
		if (rowIndex >= pattern.length) {
			return;
		}
		if (!this.audioDriver || !this.patternProcessor || !this.ayumiEngine) {
			return;
		}
		if (pattern.channels.length) {
			this._ensureChannelCapacity(pattern.channels.length);
		}
		if (instrument) {
			this.state.setInstruments([instrument]);
		}

		this.state.reset();
		this.registerState.reset();

		for (let r = 0; r < rowIndex; r++) {
			this._simulateRow(pattern, r);
		}
		this.patternProcessor.parsePatternRow(pattern, rowIndex, this.registerState);
		this.patternProcessor.processTables();
		this.audioDriver.processInstruments(this.state, this.registerState);
		this._applyRegisterStateToEngine();

		const totalChannels = this.registerState.channelCount;
		this.previewActiveChannels = new Set();
		for (let ch = 0; ch < totalChannels; ch++) {
			this.previewActiveChannels.add(ch);
		}
		this.previewTickSampleCounter = 0;
	}

	handleStopPreview(channel) {
		if (channel !== undefined) {
			this.previewActiveChannels.delete(channel);
			this.applyChannelSilent(this.registerState, channel);
			this.state.channelSoundEnabled[channel] = false;
			this._applyRegisterStateToEngine();
		} else {
			this.previewActiveChannels.clear();
			this.registerState.reset();
			this._applyRegisterStateToEngine();
		}
	}

	process(_inputs, outputs, _parameters) {
		if (!this.initialized || !this.state.wasmModule || !this.state.ayumiPtr) {
			console.error('Processor not initialized or missing dependencies');
			return true;
		}

		if (outputs.length > 0 && outputs[0].length > 1) {
			const output = outputs[0];
			const leftChannel = output[0];
			const rightChannel = output[1];
			const numSamples = leftChannel.length;

			if (this.paused && this.previewActiveChannels.size === 0) {
				for (let i = 0; i < numSamples; i++) {
					leftChannel[i] = 0;
					rightChannel[i] = 0;
				}
				return true;
			}

			for (let i = 0; i < numSamples; i++) {
				this.state.tickAccumulator += this.state.tickStep;

				this.handleTimerCount();

				if (this.previewActiveChannels.size > 0) {
					this.previewTickSampleCounter++;
					if (this.previewTickSampleCounter >= this.state.samplesPerTick) {
						this.previewTickSampleCounter = 0;
						this.patternProcessor.processTables();
						if (this.state.channelInstruments) {
							this.audioDriver.processInstruments(this.state, this.registerState);
						}
					}
					this.handleTimerPeriod();
					this._applyRegisterStateToEngine();
				} else if (
					this.state.currentPattern &&
					this.state.currentPattern.length > 0 &&
					this.state.tickAccumulator >= 1.0
				) {
					if (this.state.currentTick === 0) {
						const patternLength = this.state.currentPattern.length;
						const rowsFromEnd = patternLength - 1 - this.state.currentRow;
						const effectiveLead = Math.min(
							this.prefetchLeadRows,
							Math.max(0, patternLength - 1)
						);
						const shouldPrefetch =
							rowsFromEnd >= 0 &&
							rowsFromEnd <= effectiveLead &&
							!this.nextPatternRequested &&
							this.state.patternOrder.length > 0;
						if (shouldPrefetch) {
							this.nextPatternRequested = true;
							const nextIndex =
								(this.state.currentPatternOrderIndex + 1) %
								this.state.patternOrder.length;
							this.port.postMessage({
								type: 'request_pattern',
								patternOrderIndex: nextIndex
							});
						}

						if (this.state.currentPattern.channels) {
							this._ensureChannelCapacity(this.state.currentPattern.channels.length);
						}
						this.patternProcessor.parsePatternRow(
							this.state.currentPattern,
							this.state.currentRow,
							this.registerState
						);
						this.patternProcessor.processSpeedTable();

						const now = currentTime * 1000;
						if (now - this.lastPositionUpdateTime >= this.positionUpdateThrottleMs) {
							this.port.postMessage({
								type: 'position_update',
								currentRow: this.state.currentRow,
								currentTick: this.state.currentTick,
								currentPatternOrderIndex: this.state.currentPatternOrderIndex
							});
							this.lastPositionUpdateTime = now;
							this.pendingPositionUpdate = null;
						} else {
							this.pendingPositionUpdate = {
								currentRow: this.state.currentRow,
								currentTick: this.state.currentTick,
								currentPatternOrderIndex: this.state.currentPatternOrderIndex
							};
						}
					}

					this.enforceMuteState();

					this.patternProcessor.processTables();
					this.patternProcessor.processArpeggio();
					this.patternProcessor.processEffectTables();
					this.audioDriver.processInstruments(this.state, this.registerState);
					this.patternProcessor.processVibrato();
					this.patternProcessor.processSlides();
					this.handleTimerPeriod();

					this.enforceMuteState();

					this._applyRegisterStateToEngine();

					const needsPatternChange = this.state.advancePosition();
					if (needsPatternChange) {
						this.nextPatternRequested = false;
						if (
							this.pendingNextPattern &&
							this.pendingNextPattern.orderIndex ===
								this.state.currentPatternOrderIndex
						) {
							if (this.pendingNextPattern.pattern.channels) {
								this._ensureChannelCapacity(
									this.pendingNextPattern.pattern.channels.length
								);
							}
							this.state.setPattern(
								this.pendingNextPattern.pattern,
								this.pendingNextPattern.orderIndex
							);
							this.pendingNextPattern = null;
							this.port.postMessage({
								type: 'position_update',
								currentRow: this.state.currentRow,
								currentTick: this.state.currentTick,
								currentPatternOrderIndex: this.state.currentPatternOrderIndex
							});
							this.lastPositionUpdateTime = 0;
							this.pendingPositionUpdate = null;
						} else {
							this.state.currentPattern = null;
							this.port.postMessage({
								type: 'request_pattern',
								patternOrderIndex: this.state.currentPatternOrderIndex
							});
						}
					}

					this.state.tickAccumulator -= 1.0;
				}
				this.handleTimerEvent();

				this.ayumiEngine.process();
				this.ayumiEngine.removeDC();

				const { wasmModule, ayumiPtr } = this.state;
				const leftOffset = ayumiPtr + AYUMI_STRUCT_LEFT_OFFSET;
				const rightOffset = ayumiPtr + AYUMI_STRUCT_RIGHT_OFFSET;
				const channelOutOffset = ayumiPtr + AYUMI_STRUCT_CHANNEL_OUT_OFFSET;

				const leftValue = new Float64Array(wasmModule.memory.buffer, leftOffset, 1)[0];
				const rightValue = new Float64Array(wasmModule.memory.buffer, rightOffset, 1)[0];

				const channelOut = new Float64Array(wasmModule.memory.buffer, channelOutOffset, 3);
				const wi = this.channelWaveformWriteIndex;
				for (let ch = 0; ch < 3; ch++) {
					this.channelWaveformBuf[ch][(wi + i) % 512] = channelOut[ch];
				}

				// Apply fade-in if needed
				if (this.fadeInSamples > 0) {
					const fadeInFactor =
						1 - this.fadeInSamples / (sampleRate * this.fadeInDuration);
					leftChannel[i] = leftValue * fadeInFactor;
					rightChannel[i] = rightValue * fadeInFactor;
					this.fadeInSamples--;
				} else {
					leftChannel[i] = leftValue;
					rightChannel[i] = rightValue;
				}
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
				this.port.postMessage({ type: 'channel_waveform', channels });
			}

			if (this.pendingPositionUpdate && !this.paused) {
				const now = currentTime * 1000;
				if (now - this.lastPositionUpdateTime >= this.positionUpdateThrottleMs) {
					this.port.postMessage({
						type: 'position_update',
						...this.pendingPositionUpdate
					});
					this.lastPositionUpdateTime = now;
					this.pendingPositionUpdate = null;
				}
			}
		} else {
			console.error('Invalid output configuration');
		}
		return true;
	}
}

registerProcessor('ayumi-processor', AyumiProcessor);
