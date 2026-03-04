const DEFAULT_SONG_HZ = 50;
const DEFAULT_SPEED = 3;

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
	['channelEffectTypes', 0],
	['channelTimerEnabled', false]
];

class TrackerState {
	constructor(channelCount = 3) {
		this.currentPattern = null;
		this.currentTuningTable = [];

		this.patternOrder = [];
		this.currentPatternOrderIndex = 0;

		this.intFrequency = DEFAULT_SONG_HZ;
		this.samplesPerTick = 0;
		this.sampleCounter = 0;
		this.tickAccumulator = 0.0;
		this.tickStep = 0.0;
		this.currentRow = 0;
		this.currentTick = 0;
		this.currentSpeed = DEFAULT_SPEED;

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

	reset() {
		this.sampleCounter = 0;
		this.tickAccumulator = 0.0;
		this.currentRow = 0;
		this.currentTick = 0;
		this.currentSpeed = DEFAULT_SPEED;

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
		this.samplesPerTick = Math.floor(sampleRate / this.intFrequency);
		this.tickStep = this.intFrequency / sampleRate;
	}

	setPattern(pattern, orderIndex) {
		this.currentPattern = pattern;
		if (orderIndex !== undefined) {
			this.currentPatternOrderIndex = orderIndex;
		}
		if (this.currentPattern && this.currentRow >= this.currentPattern.length) {
			this.currentRow = Math.max(0, this.currentPattern.length - 1);
		}
	}

	setSpeed(speed) {
		this.currentSpeed = speed;
	}

	setPatternOrder(order) {
		this.patternOrder = order;
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
		this.intFrequency = frequency;
		this.updateSamplesPerTick(sampleRate);
	}

	advancePosition() {
		this.currentTick++;
		if (this.currentTick >= this.currentSpeed) {
			this.currentTick = 0;
			this.currentRow++;
			if (this.currentRow >= this.currentPattern.length) {
				this.currentRow = 0;
				this.currentPatternOrderIndex++;
				if (this.currentPatternOrderIndex >= this.patternOrder.length) {
					this.currentPatternOrderIndex = 0;
				}
				return true;
			}
		}
		return false;
	}
}

export default TrackerState;
