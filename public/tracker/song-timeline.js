const DEFAULT_SONG_HZ = 50;
const DEFAULT_SPEED = 3;

class SongTimeline {
	constructor() {
		this.patternOrder = [];
		this.currentPatternOrderIndex = 0;
		this.loopPointId = 0;
		this.intFrequency = DEFAULT_SONG_HZ;
		this.samplesPerTick = 0;
		this.sampleCounter = 0;
		this.tickAccumulator = 0.0;
		this.tickStep = 0.0;
		this.currentRow = 0;
		this.currentTick = 0;
		this.currentSpeed = DEFAULT_SPEED;
	}

	reset() {
		this.sampleCounter = 0;
		this.tickAccumulator = 0.0;
		this.currentRow = 0;
		this.currentTick = 0;
		this.currentSpeed = DEFAULT_SPEED;
	}

	updateSamplesPerTick(sampleRate) {
		this.samplesPerTick = Math.floor(sampleRate / this.intFrequency);
		this.tickStep = this.intFrequency / sampleRate;
	}

	setPatternOrder(order, loopPointId = this.loopPointId) {
		this.patternOrder = order;
		this.setLoopPointId(loopPointId);
	}

	setLoopPointId(loopPointId) {
		this.loopPointId = Number.isInteger(loopPointId) ? loopPointId : 0;
	}

	getLoopPointIndex() {
		const orderLength = this.patternOrder.length;
		if (orderLength <= 0) return 0;
		if (this.loopPointId >= 0 && this.loopPointId < orderLength) {
			return this.loopPointId;
		}
		return 0;
	}

	getNextPatternOrderIndex(currentPatternOrderIndex = this.currentPatternOrderIndex) {
		const orderLength = this.patternOrder.length;
		if (orderLength <= 0) return 0;
		const nextPatternOrderIndex = currentPatternOrderIndex + 1;
		if (nextPatternOrderIndex < orderLength) {
			return nextPatternOrderIndex;
		}
		return this.getLoopPointIndex();
	}

	setIntFrequency(frequency, sampleRate) {
		this.intFrequency = frequency;
		this.updateSamplesPerTick(sampleRate);
	}

	setSpeed(speed) {
		this.currentSpeed = speed;
	}

	publishPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.setSpeed(speed);
	}

	advancePosition(leaderPatternLength) {
		const len = leaderPatternLength > 0 ? leaderPatternLength : 1;
		this.currentTick++;
		if (this.currentTick >= this.currentSpeed) {
			this.currentTick = 0;
			this.currentRow++;
			if (this.currentRow >= len) {
				this.currentRow = 0;
				this.currentPatternOrderIndex++;
				if (this.currentPatternOrderIndex >= this.patternOrder.length) {
					this.currentPatternOrderIndex = this.getLoopPointIndex();
				}
				return true;
			}
		}
		return false;
	}
}

export default SongTimeline;
