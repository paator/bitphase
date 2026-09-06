import { WorkletSlotBase } from './worklet-slot-base.js';

export class TrackerWorkletSlot extends WorkletSlotBase {
	constructor(port, chipIndex) {
		super(port, chipIndex);
		this.previewActiveChannels = new Set();
		this.previewTickSampleCounter = 0;
		this._rowParsePrimed = -1;
	}

	_playbackWorkersReady() {
		return Boolean(this.patternProcessor && this.audioDriver);
	}

	_chipEngineReady() {
		return this._playbackWorkersReady();
	}

	_resizeForPatternChannels(channelCount) {
		if (channelCount <= this.registerState.channelCount) return;
		this.state.resizeChannels(channelCount);
		this.registerState.resize(channelCount);
		if (this.audioDriver) {
			this.audioDriver.resizeChannels(channelCount);
		}
	}

	_replayCatchUpSegments(catchUpSegments) {
		if (!catchUpSegments?.length || !this._chipEngineReady()) {
			return;
		}
		for (const segment of catchUpSegments) {
			if (segment.pattern?.channels?.length) {
				this._resizeForPatternChannels(segment.pattern.channels.length);
			}
			this.state.setPattern(segment.pattern, segment.patternOrderIndex);
			const numRows = segment.numRows ?? 0;
			for (let row = 0; row < numRows; row++) {
				this._simulateRow(this.state.currentPattern, row);
			}
		}
	}

	_runCatchUpRows(upToRow) {
		if (
			!this.state.currentPattern ||
			this.state.currentPattern.length === 0 ||
			upToRow <= 0 ||
			!this._chipEngineReady()
		) {
			return;
		}
		for (let row = 0; row < upToRow; row++) {
			this._simulateRow(this.state.currentPattern, row);
		}
	}

	_afterPlaybackPositionSet(rowIndex) {
		this._primePatternRowForPlayback(rowIndex);
	}

	_primePatternRowForPlayback(rowIndex) {
		if (!this._chipEngineReady()) {
			return;
		}
		const pattern = this.state.currentPattern;
		if (!pattern?.length || rowIndex < 0 || rowIndex >= pattern.length) {
			return;
		}
		if (pattern.channels?.length) {
			this._resizeForPatternChannels(pattern.channels.length);
		}
		this.patternProcessor.parsePatternRow(pattern, rowIndex, this.registerState);
		this.patternProcessor.processSpeedTable();
		this._rowParsePrimed = rowIndex;
		this.enforceMuteState();
		this._applyRegisterStateToEngine();
	}

	_afterTransportStop() {
		this.handleStopPreview();
	}

	_preparePatternWorkersForPlay() {
		this.ensurePlaybackWorkers();
		this.enforceMuteState();
	}

	_simulateRow(pattern, rowIndex, applyToEngine = true) {
		this.patternProcessor.parsePatternRow(pattern, rowIndex, this.registerState);
		this.patternProcessor.processSpeedTable();
		const ticksPerRow = this.state.timeline.currentSpeed;
		for (let tick = 0; tick < ticksPerRow; tick++) {
			this._processTrackerTick();
		}
		if (applyToEngine) {
			this._applyRegisterStateToEngine();
		}
	}

	_processTrackerTick() {
		this.patternProcessor.processTables();
		this.patternProcessor.processArpeggio();
		this.patternProcessor.processEffectTables();
		this.audioDriver.processInstruments(this.state, this.registerState);
		this.patternProcessor.processVibrato();
		this.patternProcessor.processSlides();
	}

	dispatchPortMessages(type, data) {
		if (this._dispatchChipPortMessage(type, data)) {
			return;
		}

		switch (type) {
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
			case 'change_pattern_during_playback':
				this.handleChangePatternDuringPlayback(data);
				break;
			case 'preview_row':
				this.handlePreviewRow(data);
				break;
			case 'stop_preview':
				this.handleStopPreview(data.channel);
				break;
			case 'set_channel_mute':
				this.handleSetChannelMute(data);
				break;
			default:
				break;
		}
	}

	_dispatchChipPortMessage(_type, _data) {
		return false;
	}

	handleInitTuningTable({ tuningTable }) {
		this.state.setTuningTable(tuningTable);
	}

	handleInitSpeed({ speed }) {
		if (!(speed > 0)) return;
		if (this.chipIndex !== 0) return;
		this.state.publishPlaybackSpeed(speed);
	}

	handleInitTables({ tables }) {
		this.state.setTables(tables);
	}

	handleInitInstruments({ instruments }) {
		this.state.setInstruments(instruments);
	}

	_canPreview() {
		return this.initialized && this.state.wasmModule;
	}

	_beforePreviewRow(_data) {}

	_resetEnginesForPreview() {}

	_beforeStopPreviewAll() {}

	_silencePreviewChannel(_channelIndex) {}

	handlePreviewRow({ pattern, rowIndex, instrument, channelIndex }) {
		if (!this._canPreview()) {
			return;
		}
		this._beforePreviewRow({ pattern, rowIndex, instrument, channelIndex });
		this.paused = true;
		if (!pattern?.channels || !pattern.patternRows || rowIndex < 0) {
			return;
		}
		if (rowIndex >= pattern.length) {
			return;
		}
		if (!this._chipEngineReady()) {
			return;
		}
		if (pattern.channels.length) {
			this._resizeForPatternChannels(pattern.channels.length);
		}
		if (instrument) {
			this.state.setInstruments([instrument]);
		}

		this.state.reset({ resetTimeline: false });
		this.registerState.reset();
		this._resetEnginesForPreview();

		for (let row = 0; row < rowIndex; row++) {
			this._simulateRow(pattern, row, false);
		}
		this.patternProcessor.parsePatternRow(pattern, rowIndex, this.registerState);
		this.patternProcessor.processTables();
		this.audioDriver.processInstruments(this.state, this.registerState);
		this._applyRegisterStateToEngine();

		this.previewActiveChannels = new Set();
		const singleChannelPreview =
			typeof channelIndex === 'number' && channelIndex >= 0;
		if (singleChannelPreview) {
			this.previewActiveChannels.add(channelIndex);
			for (let ch = 0; ch < this.registerState.channelCount; ch++) {
				if (ch === channelIndex) continue;
				this._silencePreviewChannel(ch);
				this.state.channelSoundEnabled[ch] = false;
			}
			this._applyRegisterStateToEngine();
		} else {
			for (let ch = 0; ch < this.registerState.channelCount; ch++) {
				this.previewActiveChannels.add(ch);
			}
		}
		this.previewTickSampleCounter = 0;
	}

	handleStopPreview(channel) {
		if (channel === undefined) {
			this._beforeStopPreviewAll();
		}
		if (channel !== undefined) {
			this.previewActiveChannels.delete(channel);
			this._silencePreviewChannel(channel);
			this.state.channelSoundEnabled[channel] = false;
			this._applyRegisterStateToEngine();
		} else {
			this.previewActiveChannels.clear();
			this.registerState.reset();
			this._resetEnginesForPreview();
			this._applyRegisterStateToEngine();
		}
	}

	isPreviewActive() {
		return this.previewActiveChannels.size > 0;
	}

	runSharedPlaybackQuantum() {
		if (!this.state.currentPattern || this.state.currentPattern.length === 0) return;
		if (this.state.timeline.currentTick === 0) {
			this.timelinePattern.maybeRequestPrefetchForSharedTimeline(
				this.state.currentPattern,
				this.state.timeline
			);

			if (this.state.currentPattern.channels) {
				this._resizeForPatternChannels(this.state.currentPattern.channels.length);
			}
			const rowIndex = this.state.timeline.currentRow;
			if (this._rowParsePrimed !== rowIndex) {
				this.patternProcessor.parsePatternRow(
					this.state.currentPattern,
					rowIndex,
					this.registerState
				);
				this.patternProcessor.processSpeedTable();
			} else {
				this._rowParsePrimed = -1;
			}
			this.timelinePattern.queueOrSendPositionUpdate();
		}

		this.enforceMuteState();
		this._processTrackerTick();
		this.enforceMuteState();
		this._applyRegisterStateToEngine();
	}

	runPreviewStep() {
		this.previewTickSampleCounter++;
		if (this.previewTickSampleCounter >= this.state.timeline.samplesPerTick) {
			this.previewTickSampleCounter = 0;
			this.patternProcessor.processTables();
			if (this.state.channelInstruments) {
				this.audioDriver.processInstruments(this.state, this.registerState);
			}
		}
		this._applyRegisterStateToEngine();
	}
}
