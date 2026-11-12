export function limitPeak(
	left: Float32Array,
	right: Float32Array,
	ceiling = 0.98
): void {
	let peak = 0;
	const length = Math.min(left.length, right.length);
	for (let index = 0; index < length; index++) {
		peak = Math.max(peak, Math.abs(left[index]!), Math.abs(right[index]!));
	}
	if (peak <= ceiling || peak === 0) return;
	const gain = ceiling / peak;
	for (let index = 0; index < length; index++) {
		left[index] = left[index]! * gain;
		right[index] = right[index]! * gain;
	}
}

export function fadeOutTail(
	left: Float32Array,
	right: Float32Array,
	sampleCount: number
): void {
	const count = Math.min(sampleCount, left.length, right.length);
	if (count <= 0) return;
	const start = left.length - count;
	for (let index = 0; index < count; index++) {
		const gain = 1 - (index + 1) / count;
		left[start + index] = left[start + index]! * gain;
		right[start + index] = right[start + index]! * gain;
	}
}

export async function resampleStereo(
	left: Float32Array,
	right: Float32Array,
	fromRate: number,
	toRate: number
): Promise<[Float32Array, Float32Array]> {
	if (left.length === 0) {
		throw new Error('Song is empty');
	}
	if (fromRate === toRate) {
		return [left, right];
	}

	const length = Math.min(left.length, right.length);
	const outputLength = Math.max(1, Math.ceil((length * toRate) / fromRate));
	const offline = new OfflineAudioContext(2, outputLength, toRate);
	const buffer = offline.createBuffer(2, length, fromRate);
	buffer.copyToChannel(left.subarray(0, length), 0);
	buffer.copyToChannel(right.subarray(0, length), 1);
	const source = offline.createBufferSource();
	source.buffer = buffer;
	source.connect(offline.destination);
	source.start();
	const rendered = await offline.startRendering();
	return [new Float32Array(rendered.getChannelData(0)), new Float32Array(rendered.getChannelData(1))];
}
