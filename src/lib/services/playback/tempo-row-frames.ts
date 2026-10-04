export function createTempoRowClock(tempo: number, interruptFrequency: number) {
	let accum = 0;
	const tempoValue = tempo > 0 ? Math.floor(tempo) : 0;
	const hz = interruptFrequency > 0 ? interruptFrequency : 50;

	return {
		framesForSpeed(speed: number): number {
			const safeSpeed = speed > 0 ? speed : 1;
			if (!(tempoValue > 0)) {
				let tick = 0;
				let frames = 0;
				while (tick < safeSpeed) {
					tick++;
					frames++;
				}
				return frames;
			}
			const speedInt = Math.floor(safeSpeed) > 0 ? Math.floor(safeSpeed) : 1;
			const product = tempoValue * 24;
			let decrement = Math.floor(product / speedInt);
			const remainder = product % speedInt;
			if (decrement < 1) decrement = 1;
			const divider = hz * 60;
			let frames = 0;
			while (frames < 1_000_000) {
				frames++;
				if (accum <= 0) accum += divider - remainder;
				accum -= decrement;
				if (accum <= 0) return frames;
			}
			return frames;
		},
		secondsForSpeed(speed: number): number {
			return this.framesForSpeed(speed) / hz;
		}
	};
}
