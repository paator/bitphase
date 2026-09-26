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
		this.tempo = 0;
		this.tempoAccum = 0;
		this.tempoDecrement = 0;
		this.tempoRemainder = 0;
	}

	reset() {
		this.sampleCounter = 0;
		this.tickAccumulator = 0.0;
		this.currentRow = 0;
		this.currentTick = 0;
		this.currentSpeed = DEFAULT_SPEED;
		this.tempoAccum = 0;
		this._setupTempo();
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
		this._setupTempo();
	}

	setSpeed(speed) {
		this.currentSpeed = speed;
		this._setupTempo();
	}

	setTempo(tempo) {
		this.tempo = tempo > 0 ? Math.floor(tempo) : 0;
		this.tempoAccum = 0;
		this._setupTempo();
	}

	_setupTempo() {
		const speed = this.currentSpeed > 0 ? Math.floor(this.currentSpeed) : 1;
		if (!(this.tempo > 0)) {
			this.tempoDecrement = 0;
			this.tempoRemainder = 0;
			return;
		}
		const product = this.tempo * 24;
		this.tempoDecrement = Math.floor(product / speed);
		this.tempoRemainder = product % speed;
		if (this.tempoDecrement < 1) this.tempoDecrement = 1;
	}

	_tempoDivider() {
		const frameRate = this.intFrequency > 0 ? this.intFrequency : DEFAULT_SONG_HZ;
		return frameRate * 60;
	}

	isLastFrameOfRow() {
		if (this.tempo > 0 && this.tempoDecrement > 0) {
			let accum = this.tempoAccum;
			if (accum <= 0) accum += this._tempoDivider() - this.tempoRemainder;
			accum -= this.tempoDecrement;
			return accum <= 0;
		}
		const speed = this.currentSpeed > 0 ? this.currentSpeed : 1;
		return this.currentTick >= speed - 1;
	}

	publishPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.setSpeed(speed);
	}

	advancePosition(leaderPatternLength) {
		const len = leaderPatternLength > 0 ? leaderPatternLength : 1;
		this.currentTick++;
		if (this.tempo > 0 && this.tempoDecrement > 0) {
			if (this.tempoAccum <= 0) {
				this.tempoAccum += this._tempoDivider() - this.tempoRemainder;
			}
			this.tempoAccum -= this.tempoDecrement;
			if (this.tempoAccum > 0) return false;
		} else if (this.currentTick < this.currentSpeed) {
			return false;
		}
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
		return false;
	}
}

export default SongTimeline;
