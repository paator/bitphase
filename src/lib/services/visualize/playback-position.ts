import type { SharedTimelinePosition } from '../file/wav/offline-shared-timeline-render';

export type RowSpan = {
	sampleStart: number;
	sampleEnd: number;
	orderIndex: number;
	row: number;
};

export type RowMotion = {
	orderIndex: number;
	row: number;
	fraction: number;
};

export function rowSpansFromChanges(
	changes: readonly SharedTimelinePosition[],
	totalSamples: number
): RowSpan[] {
	const spans: RowSpan[] = [];
	for (let index = 0; index < changes.length; index++) {
		const current = changes[index]!;
		const nextStart = changes[index + 1]?.sampleIndex ?? totalSamples;
		if (nextStart <= current.sampleIndex) continue;
		spans.push({
			sampleStart: current.sampleIndex,
			sampleEnd: nextStart,
			orderIndex: current.orderIndex,
			row: current.row
		});
	}
	if (spans.length === 0 && totalSamples > 0) {
		spans.push({ sampleStart: 0, sampleEnd: totalSamples, orderIndex: 0, row: 0 });
	}
	return spans;
}

export function rowMotionAtSample(spans: readonly RowSpan[], sample: number): RowMotion {
	if (spans.length === 0) {
		return { orderIndex: 0, row: 0, fraction: 0 };
	}

	let span = spans[0]!;
	for (const candidate of spans) {
		if (candidate.sampleStart <= sample) span = candidate;
		else break;
	}

	const duration = span.sampleEnd - span.sampleStart;
	if (duration <= 0) {
		return { orderIndex: span.orderIndex, row: span.row, fraction: 0 };
	}

	const lastSample = span.sampleEnd - 1;
	const clamped = Math.min(Math.max(sample, span.sampleStart), lastSample);
	return {
		orderIndex: span.orderIndex,
		row: span.row,
		fraction: (clamped - span.sampleStart) / duration
	};
}
