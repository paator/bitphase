import SongTimeline from './song-timeline.js';

const CHANNEL_ARRAY_SPECS = [
	['channelPatternVolumes', 15],
	['channelTables', -1],
	['tablePositions', 0],
	['tableCounters', 0],
	['channelBaseNotes', 0],
	['channelCurrentNotes', 0],
	['channelToneSliding', 0],
	['channelVibratoSliding', 0],
	['channelSlideStep', 0],
	['channelSlideDelay', 0],
	['channelSlideCount', 0],
	['channelPreviousNotes', 0],
	['channelPortamentoTarget', -1],
	['channelPortamentoDelta', 0],
	['channelPortamentoActive', false],
	['channelPortamentoDelay', 0],
	['channelPortamentoCount', 0],
	['channelOnDuration', 0],
	['channelOffDuration', 0],
	['channelOnOffCounter', 0],
	['channelArpeggioSemitone1', 0],
	['channelArpeggioSemitone2', 0],
	['channelArpeggioDelay', 0],
	['channelArpeggioCounter', 0],
	['channelArpeggioPosition', 0],
	['channelVibratoSpeed', 0],
	['channelVibratoDepth', 0],
	['channelVibratoDelay', 0],
	['channelVibratoCounter', 0],
	['channelVibratoPosition', 0],
	['channelDetune', 0],
	['channelEffectTables', -1],
	['channelEffectTablePositions', 0],
	['channelEffectTableCounters', 0],
	['channelEffectTableDelays', 1],
	['channelEffectTypes', 0]
];

class TrackerState {
	constructor(channelCount = 3, sharedTimeline = null) {
		this.currentPattern = null;
		this.currentTuningTable = [];
		this.timeline = sharedTimeline ?? new SongTimeline();

		for (const [name, defaultVal] of CHANNEL_ARRAY_SPECS) {
			this[name] = Array(channelCount).fill(defaultVal);
		}

		this.tables = [];
		this.tablesById = {};

		this.speedTable = -1;
		this.speedTablePosition = 0;
	}

	resizeChannels(newCount) {
		for (const [name, defaultVal] of CHANNEL_ARRAY_SPECS) {
			const arr = this[name];
			while (arr.length < newCount) arr.push(defaultVal);
			if (arr.length > newCount) arr.length = newCount;
		}
	}

	reset(opts = {}) {
		const resetTimeline = opts.resetTimeline !== false;
		if (resetTimeline) {
			this.timeline.reset();
		}

		for (const [name, defaultVal] of CHANNEL_ARRAY_SPECS) {
			this[name].fill(defaultVal);
		}

		this.speedTable = -1;
		this.speedTablePosition = 0;
	}

	setTuningTable(table) {
		this.currentTuningTable = table;
	}

	updateSamplesPerTick(sampleRate) {
		this.timeline.updateSamplesPerTick(sampleRate);
	}

	setPattern(pattern, orderIndex) {
		this.currentPattern = pattern;
		if (orderIndex !== undefined) {
			this.timeline.currentPatternOrderIndex = orderIndex;
		}
		if (this.currentPattern && this.timeline.currentRow >= this.currentPattern.length) {
			this.timeline.currentRow = Math.max(0, this.currentPattern.length - 1);
		}
	}

	setSpeed(speed) {
		this.timeline.setSpeed(speed);
	}

	publishPlaybackSpeed(speed) {
		this.timeline.publishPlaybackSpeed(speed);
	}

	setPatternOrder(order, loopPointId = this.timeline.loopPointId) {
		this.timeline.setPatternOrder(order, loopPointId);
	}

	setLoopPointId(loopPointId) {
		this.timeline.setLoopPointId(loopPointId);
	}

	getLoopPointIndex() {
		return this.timeline.getLoopPointIndex();
	}

	getNextPatternOrderIndex(currentPatternOrderIndex = this.timeline.currentPatternOrderIndex) {
		return this.timeline.getNextPatternOrderIndex(currentPatternOrderIndex);
	}

	setTables(tables) {
		this.tables = tables;
		this.tablesById = {};
		if (tables) {
			for (let i = 0; i < tables.length; i++) {
				const t = tables[i];
				if (t && t.id !== undefined) {
					this.tablesById[t.id] = t;
				}
			}
		}
	}

	getTable(id) {
		return this.tablesById?.[id];
	}

	setIntFrequency(frequency, sampleRate) {
		this.timeline.setIntFrequency(frequency, sampleRate);
	}

	advancePosition(leaderPatternLength) {
		const len =
			leaderPatternLength !== undefined && leaderPatternLength > 0
				? leaderPatternLength
				: this.currentPattern != null && this.currentPattern.length > 0
					? this.currentPattern.length
					: 1;
		return this.timeline.advancePosition(len);
	}
}

export default TrackerState;
