export const SAMPLE_PITCH_REFERENCE_HZ = 261.63;
export const MIN_INSTRUMENT_SAMPLE_RATE = 1_000;
export const MAX_INSTRUMENT_SAMPLE_RATE = 65_535;

export function clampInstrumentSampleRate(rate: number): number {
	if (!Number.isFinite(rate)) {
		return MIN_INSTRUMENT_SAMPLE_RATE;
	}
	return Math.max(
		MIN_INSTRUMENT_SAMPLE_RATE,
		Math.min(MAX_INSTRUMENT_SAMPLE_RATE, Math.round(rate))
	);
}

export function instrumentHasSample(source: { sampleData?: number[] } | null | undefined): boolean {
	return Array.isArray(source?.sampleData) && source.sampleData.length > 0;
}

export type SamplePlaybackBounds = {
	start: number;
	end: number;
	loopStart: number;
	length: number;
	dataLength: number;
};

export type SampleRegion = SamplePlaybackBounds;

type SampleBoundsSource = {
	sampleData?: number[];
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLength?: number;
	sampleLoop?: number;
};

export function normalizeSamplePlaybackBounds(source: SampleBoundsSource): SamplePlaybackBounds | null {
	const dataLength = source.sampleData?.length ?? 0;
	if (dataLength === 0) {
		return null;
	}

	let start = source.sampleStart ?? source.sampleLoop ?? 0;
	let end = source.sampleEnd;

	if (end == null && source.sampleLength != null && Number.isFinite(source.sampleLength)) {
		end = start + Math.floor(source.sampleLength) - 1;
	}
	if (end == null || !Number.isFinite(end)) {
		end = dataLength - 1;
	}

	start = Math.max(0, Math.min(dataLength - 1, Math.floor(start)));
	end = Math.max(start, Math.min(dataLength - 1, Math.floor(end)));

	let loopStart = source.sampleLoopStart ?? source.sampleLoop ?? start;
	loopStart = Math.max(start, Math.min(end, Math.floor(loopStart)));

	return {
		start,
		end,
		loopStart,
		length: end - start + 1,
		dataLength
	};
}

export function normalizeSampleRegion(source: SampleBoundsSource): SamplePlaybackBounds | null {
	return normalizeSamplePlaybackBounds(source);
}

export function defaultSampleRegionFields(dataLength: number): {
	sampleStart: number;
	sampleEnd: number;
	sampleLoopStart: number;
	sampleLoopEnabled: boolean;
} {
	const end = Math.max(0, dataLength - 1);
	return {
		sampleStart: 0,
		sampleEnd: end,
		sampleLoopStart: 0,
		sampleLoopEnabled: true
	};
}

export function resolveSampleLoopEnabled(source: { sampleLoopEnabled?: boolean }): boolean {
	return source.sampleLoopEnabled !== false;
}

export function resolveSamplePitchReferencePeriod(clockHz: number): number {
	if (!clockHz || clockHz <= 0) {
		return 0;
	}
	return clockHz / (16 * SAMPLE_PITCH_REFERENCE_HZ);
}

export function computeSamplePitchScale(referencePeriod: number, effectiveTone: number): number {
	if (referencePeriod <= 0 || effectiveTone <= 0) {
		return 1;
	}
	return referencePeriod / effectiveTone;
}

export function resolveSamplePlaybackRate(
	sampleRate: number | undefined,
	fallbackRate: number
): number {
	if (typeof sampleRate === 'number' && sampleRate > 0) {
		return sampleRate;
	}
	return fallbackRate > 0 ? fallbackRate : 44100;
}

export function computeSampleSidPeriod(clockHz: number, sampleRate: number): number {
	if (!sampleRate || sampleRate <= 0 || !clockHz || clockHz <= 0) {
		return 1;
	}
	return Math.max(1, Math.round(clockHz / (8 * sampleRate)));
}

export function clampSamplePlaybackPosition(bounds: SamplePlaybackBounds, position: number): number {
	return Math.max(bounds.start, Math.min(bounds.end, Math.floor(position)));
}

export function formatSampleRegionDuration(
	sampleRate: number | undefined,
	bounds: SamplePlaybackBounds
): string {
	if (!sampleRate || sampleRate <= 0) {
		return `${bounds.length.toLocaleString()} samples`;
	}
	const seconds = bounds.length / sampleRate;
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	const millis = Math.floor((seconds % 1) * 1000);
	if (minutes > 0) {
		return `${minutes}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
	}
	return `${secs}.${millis.toString().padStart(3, '0')}s`;
}

export function formatLoopRegionDuration(
	sampleRate: number | undefined,
	bounds: SamplePlaybackBounds
): string {
	const loopLength = bounds.end - bounds.loopStart + 1;
	if (!sampleRate || sampleRate <= 0) {
		return `${loopLength.toLocaleString()} samples`;
	}
	const seconds = loopLength / sampleRate;
	const millis = Math.floor((seconds % 1) * 1000);
	const secs = Math.floor(seconds % 60);
	return `${secs}.${millis.toString().padStart(3, '0')}s`;
}
