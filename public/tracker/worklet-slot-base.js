import { TimelinePatternCoordinator } from './timeline-pattern-coordinator.js';

export class WorkletSlotBase {
	constructor(port, chipIndex) {
		this.port = port;
		this.chipIndex = chipIndex;
		this.paused = true;
		this.timelinePattern = new TimelinePatternCoordinator({
			post: (data) => this._post(data),
			getState: () => this._slotState(),
			resizeForPatternChannelCount: (n) => this._resizeForPatternChannels(n)
		});
	}

	_post(data) {
		this.port.postMessage({ ...data, chipIndex: this.chipIndex });
	}

	_slotState() {
		throw new Error('WorkletSlotBase: _slotState');
	}

	_resizeForPatternChannels(_n) {}

	_isReadyForPlayback() {
		return false;
	}

	_prepareOutputForPlay() {}

	_preparePatternWorkersForPlay() {}

	_replayCatchUpSegments(_segments) {}

	_runCatchUpRows(_upToRow) {}

	_applyPlaybackSpeed(_speed) {}

	_onTransportStop() {}

	_afterTransportStop() {}

	handleInitPattern(data) {
		this.timelinePattern.handleInitPattern(data);
	}

	handleUpdateOrder(data) {
		this.timelinePattern.handleUpdateOrder(data);
	}

	handleSetPatternData(data) {
		this.timelinePattern.handleSetPatternData(data, {
			paused: this.paused,
			onAppliedCurrentOrder: (hadPendingRow, paused) => {
				if (hadPendingRow && !paused) {
					this._runCatchUpRows(this._slotState().timeline.currentRow);
				}
				if (!paused) {
					this.timelinePattern.postPositionUpdate();
				}
			}
		});
	}

	handleChangePatternDuringPlayback({ row, patternOrderIndex, pattern, speed }) {
		if (!this._isReadyForPlayback() || this.paused) {
			return;
		}

		if (pattern?.channels?.length) {
			this._resizeForPatternChannels(pattern.channels.length);
		}

		this.timelinePattern.clearActivePatternFetchState();
		let patternChanged = false;
		const state = this._slotState();

		if (patternOrderIndex !== undefined) {
			const patternOrderChanged = state.timeline.currentPatternOrderIndex !== patternOrderIndex;
			state.timeline.currentPatternOrderIndex = patternOrderIndex;

			if (pattern) {
				state.setPattern(pattern, patternOrderIndex);
				patternChanged = true;
			} else if (patternOrderChanged && !state.currentPattern) {
				this._post({
					type: 'request_pattern',
					patternOrderIndex: patternOrderIndex
				});
				if (row !== undefined) {
					this.timelinePattern.pendingRowAfterPatternChange = row;
				}
			}
		} else if (pattern) {
			state.setPattern(pattern, state.timeline.currentPatternOrderIndex);
			patternChanged = true;
		}

		if (speed !== undefined && speed !== null && speed > 0) {
			this._applyPlaybackSpeed(speed);
		}

		if (row !== undefined && (patternChanged || state.currentPattern)) {
			state.timeline.currentRow = row;
			state.timeline.currentTick = 0;
			state.timeline.tickAccumulator = 1.0;
		} else if (row !== undefined && !patternChanged) {
			this.timelinePattern.pendingRowAfterPatternChange = row;
		}

		this.timelinePattern.postPositionUpdate();
	}

	handlePlay({ startPatternOrderIndex, initialSpeed }) {
		if (!this._isReadyForPlayback()) {
			console.warn('Play aborted: worklet slot not ready');
			return;
		}

		this.startPlaybackCommon();

		const state = this._slotState();
		if (startPatternOrderIndex !== undefined) {
			state.timeline.currentPatternOrderIndex = startPatternOrderIndex;
		}
		if (initialSpeed !== undefined && initialSpeed > 0) {
			this._applyPlaybackSpeed(initialSpeed);
		}

		this.timelinePattern.postPositionUpdate();
	}

	handlePlayFromRow({ row, patternOrderIndex, speed }) {
		if (!this._isReadyForPlayback()) {
			console.warn('Play aborted: worklet slot not ready');
			return;
		}

		this.startPlaybackCommon();

		const state = this._slotState();
		if (patternOrderIndex !== undefined) {
			if (state.timeline.currentPatternOrderIndex !== patternOrderIndex) {
				state.currentPattern = null;
			}
			state.timeline.currentPatternOrderIndex = patternOrderIndex;
			this._post({
				type: 'request_pattern',
				patternOrderIndex: patternOrderIndex
			});
		}
		state.timeline.currentRow = row;
		if (speed !== undefined && speed !== null && speed > 0) {
			this._applyPlaybackSpeed(speed);
		}

		this.timelinePattern.postPositionUpdate();
		this._runCatchUpRows(state.timeline.currentRow);
	}

	handlePlayFromPosition({
		catchUpSegments,
		startPattern,
		startPatternOrderIndex,
		startRow,
		speed
	}) {
		if (!this._isReadyForPlayback()) {
			console.warn('Play aborted: worklet slot not ready');
			return;
		}

		this.startPlaybackCommon();

		if (speed !== undefined && speed !== null && speed > 0) {
			this._applyPlaybackSpeed(speed);
		}

		this._replayCatchUpSegments(catchUpSegments);

		const state = this._slotState();
		if (startPattern?.channels?.length) {
			this._resizeForPatternChannels(startPattern.channels.length);
		}
		state.setPattern(startPattern, startPatternOrderIndex);
		state.timeline.currentPatternOrderIndex = startPatternOrderIndex;
		state.timeline.currentRow = startRow;

		this.timelinePattern.postPositionUpdate();
	}

	startPlaybackCommon() {
		this.paused = false;
		this.timelinePattern.resetPendingForPlaybackStart();
		this._prepareOutputForPlay();
		const state = this._slotState();
		state.reset({ resetTimeline: this.chipIndex === 0 });
		if (this.chipIndex === 0) {
			state.timeline.tickAccumulator = 1.0;
		}
		this._preparePatternWorkersForPlay();
	}

	handleStop() {
		this.paused = true;
		this._onTransportStop();
		const state = this._slotState();
		state.reset({ resetTimeline: this.chipIndex === 0 });
		state.currentPattern = null;
		this.timelinePattern.resetForStop();
		this._afterTransportStop();
	}

	onPatternOrderAdvanced(needsPatternChange) {
		this.timelinePattern.onPatternOrderAdvanced(needsPatternChange);
	}

	getLeaderPatternRowCount() {
		const p = this._slotState().currentPattern;
		return p && p.length > 0 ? p.length : 0;
	}

	shouldRunPlaybackAccumulation() {
		const state = this._slotState();
		return (
			!this.paused &&
			state.currentPattern &&
			state.currentPattern.length > 0
		);
	}

	finishAudioBlockFlushTransport(numSamples, paused) {
		this.timelinePattern.finishAudioBlockFlushPendingPosition(paused);
	}
}
