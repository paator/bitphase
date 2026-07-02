import type { SharedTimelineExportLaneHandle } from '../../chips/base/renderer';
import {
	leaderPatternLengthFromSlots,
	runSharedTimelineQuantum,
	sortPlaySlotsForQuantum
} from '../../../../public/tracker/shared-playback-orchestrator.js';

export type OfflineSharedTimeline = {
	tickAccumulator: number;
	tickStep: number;
	currentTick: number;
	currentSpeed: number;
	currentRow: number;
	currentPatternOrderIndex: number;
	patternOrder: number[];
	advancePosition: (leaderPatternLength: number) => boolean;
};

export type OfflineSharedTimelineRenderOptions = {
	lanes: SharedTimelineExportLaneHandle[];
	timeline: OfflineSharedTimeline;
	sampleRate: number;
	loopCount: number;
	totalRows: number;
	onProgress?: (progress: number, message: string) => void;
	calculateCurrentRow?: () => number;
};

export async function renderOfflineSharedTimeline({
	lanes,
	timeline,
	sampleRate,
	loopCount,
	onProgress,
	calculateCurrentRow,
	totalRows
}: OfflineSharedTimelineRenderOptions): Promise<Float32Array[][]> {
	const leftByLane = lanes.map(() => [] as number[]);
	const rightByLane = lanes.map(() => [] as number[]);
	const channelByLane = lanes.some((lane) => lane.separateChannels)
		? lanes.map((lane) => (lane.separateChannels ? lane.createChannelBuffers!() : null))
		: null;

	let totalSamples = 0;
	const maxSamples = sampleRate * 300 * Math.max(1, loopCount);
	let completedLoops = 0;
	let lastProgressUpdate = 0;
	const progressUpdateInterval = sampleRate * 0.1;
	let lastProgressTime = Date.now();
	const minProgressUpdateMs = 100;

	while (totalSamples < maxSamples) {
		const now = Date.now();
		if (
			onProgress &&
			(totalSamples - lastProgressUpdate >= progressUpdateInterval ||
				now - lastProgressTime >= minProgressUpdateMs) &&
			totalSamples > 0
		) {
			const renderProgress = (totalSamples / maxSamples) * 50;
			const progress = 50 + renderProgress;
			const currentRow = calculateCurrentRow ? calculateCurrentRow() : 0;
			onProgress(progress, `Rendering... ${currentRow}/${totalRows} rows`);
			lastProgressUpdate = totalSamples;
			lastProgressTime = now;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		timeline.tickAccumulator += timeline.tickStep;

		if (timeline.tickAccumulator >= 1.0) {
			const playSlots = sortPlaySlotsForQuantum(lanes);
			const leaderLen = leaderPatternLengthFromSlots(lanes);
			runSharedTimelineQuantum(playSlots, lanes, timeline, leaderLen);

			const isLastPattern =
				timeline.currentPatternOrderIndex >= timeline.patternOrder.length - 1;
			const leaderRowCount = leaderPatternLengthFromSlots(lanes);
			const isLastRow = timeline.currentRow >= leaderRowCount - 1;
			const isLastTick = timeline.currentTick >= timeline.currentSpeed - 1;

			if (isLastPattern && isLastRow && isLastTick) {
				completedLoops++;
				if (completedLoops >= loopCount) {
					break;
				}
			}

			timeline.tickAccumulator -= 1.0;
		}

		for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
			const lane = lanes[laneIndex]!;
			const captured = lane.captureSample(totalSamples);
			if (lane.separateChannels && channelByLane?.[laneIndex]) {
				for (let ch = 0; ch < captured.channels!.length; ch++) {
					channelByLane[laneIndex]![ch]!.push(captured.channels![ch]!);
				}
			} else {
				leftByLane[laneIndex]!.push(captured.left);
				rightByLane[laneIndex]!.push(captured.right);
			}
		}

		totalSamples++;
	}

	return lanes.map((lane, laneIndex) => {
		if (lane.separateChannels && channelByLane?.[laneIndex]) {
			return channelByLane[laneIndex]!.map((samples) => new Float32Array(samples));
		}
		return [
			new Float32Array(leftByLane[laneIndex]!),
			new Float32Array(rightByLane[laneIndex]!)
		];
	});
}
