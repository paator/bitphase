import TrackerState from './tracker-state.js';
import TrackerPatternProcessor from './tracker-pattern-processor.js';
import { WorkletSlotBase } from './worklet-slot-base.js';

const NES_CHANNEL_COUNT = 5;

class NesStubAudioDriver {
	processPatternRow() {}

	processInstruments() {}

	resetChannelMixerState() {}

	resizeChannels() {}
}

class NesState extends TrackerState {
	constructor(sharedTimeline) {
		super(NES_CHANNEL_COUNT, sharedTimeline);
		this.instruments = [];
		this.instrumentIdToIndex = new Map();
		this.channelSoundEnabled = Array(NES_CHANNEL_COUNT).fill(false);
		this.channelMuted = Array(NES_CHANNEL_COUNT).fill(false);
		this.channelInstruments = Array(NES_CHANNEL_COUNT).fill(-1);
	}

	setInstruments(instruments) {
		this.instruments = instruments;
		this.instrumentIdToIndex = new Map();
		instruments.forEach((instrument, index) => {
			if (instrument && instrument.id !== undefined) {
				let numericId;
				if (typeof instrument.id === 'string') {
					numericId = parseInt(instrument.id, 36);
				} else {
					numericId = instrument.id;
				}
				this.instrumentIdToIndex.set(numericId, index);
			}
		});
	}

	resizeChannels(newCount) {
		super.resizeChannels(newCount);
		this._resizeArray('channelSoundEnabled', newCount, false);
		this._resizeArray('channelMuted', newCount, false);
		this._resizeArray('channelInstruments', newCount, -1);
	}

	_resizeArray(name, newCount, defaultVal) {
		const arr = this[name];
		while (arr.length < newCount) arr.push(defaultVal);
		if (arr.length > newCount) arr.length = newCount;
	}
}

export class NesStubSlot extends WorkletSlotBase {
	constructor(port, chipIndex, sharedTimeline) {
		super(port, chipIndex);
		this.state = new NesState(sharedTimeline);
		this.initialized = false;
		this.audioDriver = new NesStubAudioDriver();
		this.patternProcessor = new TrackerPatternProcessor(this.state, this.audioDriver, this.port);
		this.registerState = { channelCount: NES_CHANNEL_COUNT };
	}

	_slotState() {
		return this.state;
	}

	_isReadyForPlayback() {
		return this.initialized;
	}

	_applyPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.state.publishPlaybackSpeed(speed);
	}

	_resizeForPatternChannels(channelCount) {
		if (channelCount <= this.state.channelTables.length) return;
		this.state.resizeChannels(channelCount);
		this.registerState.channelCount = channelCount;
	}

	_prepareOutputForPlay() {}

	_preparePatternWorkersForPlay() {}

	_replayCatchUpSegments(catchUpSegments) {
		if (!catchUpSegments?.length) return;
		for (const segment of catchUpSegments) {
			if (segment.pattern?.channels?.length) {
				this._resizeForPatternChannels(segment.pattern.channels.length);
			}
			this.state.setPattern(segment.pattern, segment.patternOrderIndex);
			const numRows = segment.numRows ?? 0;
			for (let row = 0; row < numRows; row++) {
				this.patternProcessor.parsePatternRow(
					this.state.currentPattern,
					row,
					this.registerState
				);
			}
		}
	}

	_runCatchUpRows(upToRow) {
		if (!this.state.currentPattern || this.state.currentPattern.length === 0 || upToRow <= 0) {
			return;
		}
		for (let row = 0; row < upToRow; row++) {
			this.patternProcessor.parsePatternRow(this.state.currentPattern, row, this.registerState);
		}
	}

	_onTransportStop() {}

	_afterTransportStop() {}

	async handleMessage(payload) {
		if (payload == null || typeof payload !== 'object') return;
		const { type, ...data } = payload;
		if (type === undefined) return;

		if (type === 'init') {
			await this.handleInit(data);
			return;
		}

		this.dispatchPortMessages(type, data);
	}

	async handleInit({ wasmBuffer }) {
		if (!wasmBuffer) return;
		this.initialized = true;
		this.state.updateSamplesPerTick(sampleRate);
	}

	dispatchPortMessages(type, data) {
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
			case 'set_channel_mute':
				this.handleSetChannelMute(data);
				break;
			default:
				break;
		}
	}

	handleInitTuningTable({ tuningTable }) {
		this.state.setTuningTable(tuningTable);
	}

	handleInitSpeed({ speed }) {
		if (!(speed > 0)) return;
		this.state.publishPlaybackSpeed(speed);
	}

	handleInitTables({ tables }) {
		this.state.setTables(tables);
	}

	handleInitInstruments({ instruments }) {
		this.state.setInstruments(instruments);
	}

	handleSetChannelMute({ channelIndex, muted }) {
		if (channelIndex >= 0 && channelIndex < this.state.channelMuted.length) {
			this.state.channelMuted[channelIndex] = muted;
		}
	}

	canRender() {
		return this.initialized;
	}

	isPreviewActive() {
		return false;
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
			this.patternProcessor.parsePatternRow(
				this.state.currentPattern,
				rowIndex,
				this.registerState
			);
			this.patternProcessor.processSpeedTable();
			this.timelinePattern.queueOrSendPositionUpdate();
		}

		this.patternProcessor.processTables();
		this.patternProcessor.processArpeggio();
		this.patternProcessor.processEffectTables();
		this.patternProcessor.processVibrato();
		this.patternProcessor.processSlides();
	}

	runPreviewStep() {}

	accumulateStereoOutput(_sampleIndex, _mix) {}

	finishAudioBlock(numSamples) {
		this.finishAudioBlockFlushTransport(numSamples, this.paused);
	}
}
