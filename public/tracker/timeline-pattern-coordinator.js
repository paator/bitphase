export class TimelinePatternCoordinator {
	constructor({ post, getState, resizeForPatternChannelCount }) {
		this.post = post;
		this.getState = getState;
		this.resizeForPatternChannelCount = resizeForPatternChannelCount;
		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
		this.prefetchLeadRows = 8;
		this.pendingRowAfterPatternChange = null;
		this.lastPositionUpdateTime = 0;
		this.positionUpdateThrottleMs = 16;
		this.pendingPositionUpdate = null;
	}

	postPositionUpdate() {
		const state = this.getState();
		this.post({
			type: 'position_update',
			currentRow: state.timeline.currentRow,
			currentTick: state.timeline.currentTick,
			currentPatternOrderIndex: state.timeline.currentPatternOrderIndex
		});
		this.lastPositionUpdateTime = 0;
		this.pendingPositionUpdate = null;
	}

	handleInitPattern(data) {
		const state = this.getState();
		if (
			data.patternOrderIndex !== undefined &&
			state.timeline.currentPatternOrderIndex !== data.patternOrderIndex
		) {
			state.currentPattern = null;
		}
		if (data.pattern?.channels?.length) {
			this.resizeForPatternChannelCount(data.pattern.channels.length);
		}
		state.setPattern(data.pattern, data.patternOrderIndex);
	}

	handleUpdateOrder(data) {
		this.getState().setPatternOrder(data.order, data.loopPointId);
	}

	handleSetPatternData(data, { paused, onAppliedCurrentOrder }) {
		const state = this.getState();
		if (data.pattern?.channels?.length) {
			this.resizeForPatternChannelCount(data.pattern.channels.length);
		}
		if (data.patternOrderIndex !== state.timeline.currentPatternOrderIndex) {
			this.pendingNextPattern = {
				pattern: data.pattern,
				orderIndex: data.patternOrderIndex
			};
			this.nextPatternRequested = false;
			return;
		}

		state.setPattern(data.pattern, data.patternOrderIndex);
		this.pendingNextPattern = null;

		const hadPendingRow = this.pendingRowAfterPatternChange !== null;
		if (this.pendingRowAfterPatternChange !== null) {
			state.timeline.currentRow = this.pendingRowAfterPatternChange;
			state.timeline.currentTick = 0;
			state.timeline.tickAccumulator = 1.0;
			this.pendingRowAfterPatternChange = null;
		}

		if (typeof onAppliedCurrentOrder === 'function') {
			onAppliedCurrentOrder(hadPendingRow, paused);
		}
	}

	onPatternOrderAdvanced(needsPatternChange) {
		if (!needsPatternChange) return;
		const state = this.getState();
		this.nextPatternRequested = false;
		if (
			this.pendingNextPattern &&
			this.pendingNextPattern.orderIndex === state.timeline.currentPatternOrderIndex
		) {
			if (this.pendingNextPattern.pattern.channels) {
				this.resizeForPatternChannelCount(this.pendingNextPattern.pattern.channels.length);
			}
			state.setPattern(this.pendingNextPattern.pattern, this.pendingNextPattern.orderIndex);
			this.pendingNextPattern = null;
			this.post({
				type: 'position_update',
				currentRow: state.timeline.currentRow,
				currentTick: state.timeline.currentTick,
				currentPatternOrderIndex: state.timeline.currentPatternOrderIndex
			});
			this.lastPositionUpdateTime = 0;
			this.pendingPositionUpdate = null;
		} else {
			const order = state.timeline.patternOrder;
			const oi = state.timeline.currentPatternOrderIndex;
			const needId = oi >= 0 && oi < order.length ? order[oi] : null;
			const cur = state.currentPattern;
			if (needId !== null && cur && cur.id === needId) {
				this.post({
					type: 'position_update',
					currentRow: state.timeline.currentRow,
					currentTick: state.timeline.currentTick,
					currentPatternOrderIndex: state.timeline.currentPatternOrderIndex
				});
				this.lastPositionUpdateTime = 0;
				this.pendingPositionUpdate = null;
			} else {
				state.currentPattern = null;
				this.post({
					type: 'request_pattern',
					patternOrderIndex: state.timeline.currentPatternOrderIndex
				});
			}
		}
	}

	maybeRequestPrefetchForSharedTimeline(currentPattern, timeline) {
		if (!currentPattern || currentPattern.length === 0) return;
		if (timeline.currentTick !== 0) return;
		const patternLength = currentPattern.length;
		const rowsFromEnd = patternLength - 1 - timeline.currentRow;
		const effectiveLead = Math.min(this.prefetchLeadRows, Math.max(0, patternLength - 1));
		const shouldPrefetch =
			rowsFromEnd >= 0 &&
			rowsFromEnd <= effectiveLead &&
			!this.nextPatternRequested &&
			timeline.patternOrder.length > 0;
		if (shouldPrefetch) {
			this.nextPatternRequested = true;
			const state = this.getState();
			const nextIndex = state.getNextPatternOrderIndex();
			this.post({
				type: 'request_pattern',
				patternOrderIndex: nextIndex
			});
		}
	}

	queueOrSendPositionUpdate() {
		const state = this.getState();
		const now = currentTime * 1000;
		if (now - this.lastPositionUpdateTime >= this.positionUpdateThrottleMs) {
			this.post({
				type: 'position_update',
				currentRow: state.timeline.currentRow,
				currentTick: state.timeline.currentTick,
				currentPatternOrderIndex: state.timeline.currentPatternOrderIndex
			});
			this.lastPositionUpdateTime = now;
			this.pendingPositionUpdate = null;
		} else {
			this.pendingPositionUpdate = {
				currentRow: state.timeline.currentRow,
				currentTick: state.timeline.currentTick,
				currentPatternOrderIndex: state.timeline.currentPatternOrderIndex
			};
		}
	}

	finishAudioBlockFlushPendingPosition(paused) {
		if (this.pendingPositionUpdate && !paused) {
			const now = currentTime * 1000;
			if (now - this.lastPositionUpdateTime >= this.positionUpdateThrottleMs) {
				this.post({
					type: 'position_update',
					...this.pendingPositionUpdate
				});
				this.lastPositionUpdateTime = now;
				this.pendingPositionUpdate = null;
			}
		}
	}

	resetPendingForPlaybackStart() {
		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
	}

	clearActivePatternFetchState() {
		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
		this.pendingPositionUpdate = null;
	}

	resetForStop() {
		this.pendingNextPattern = null;
		this.nextPatternRequested = false;
		this.pendingRowAfterPatternChange = null;
	}
}
