const SQUARE_DUTY = [0.125, 0.25, 0.5, 0.75];

export class NesWaveformCapture {
	constructor(channelCount) {
		this.phases = new Float64Array(channelCount);
	}

	reset() {
		this.phases.fill(0);
	}

	sample(channelIndex, channel, cpuFrequency, sampleRate) {
		if (!channel?.enabled) return 0;

		if (channelIndex <= 1) {
			if (channel.period <= 0 || channel.volume <= 0) return 0;
			const hz = cpuFrequency / (16 * (channel.period + 1));
			this.phases[channelIndex] += hz / sampleRate;
			if (this.phases[channelIndex] >= 1) this.phases[channelIndex] -= 1;
			const duty = SQUARE_DUTY[channel.duty] ?? 0.5;
			const amplitude = channel.volume / 15;
			return (this.phases[channelIndex] < duty ? 1 : -1) * amplitude * 0.5;
		}

		if (channelIndex === 2) {
			if (channel.period <= 0) return 0;
			const hz = cpuFrequency / (16 * (channel.period + 1));
			this.phases[channelIndex] += hz / sampleRate;
			if (this.phases[channelIndex] >= 1) this.phases[channelIndex] -= 1;
			const phase = this.phases[channelIndex];
			return (phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4) * 0.5;
		}

		if (channelIndex === 3) {
			if (channel.volume <= 0) return 0;
			return ((Math.random() < 0.5 ? 1 : -1) * channel.volume) / 15 * 0.5;
		}

		return 0;
	}
}
