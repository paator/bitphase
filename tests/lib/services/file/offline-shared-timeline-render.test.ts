import { describe, it, expect } from 'vitest';
import SongTimeline from '../../../../public/tracker/song-timeline.js';
import { renderOfflineSharedTimeline } from '../../../../src/lib/services/file/offline-shared-timeline-render';

describe('offline shared timeline render', () => {
	it('produces equal buffer lengths for all lanes when one lane changes speed', async () => {
		const timeline = new SongTimeline();
		timeline.setPatternOrder([0]);
		timeline.updateSamplesPerTick(44100);
		timeline.tickAccumulator = 1.0;
		timeline.currentSpeed = 3;

		const ayLane = {
			songIndex: 0,
			audioSlotKind: 'ayumi',
			separateChannels: false,
			getLeaderPatternRowCount() {
				return 4;
			},
			runSharedPlaybackQuantum() {
				if (timeline.currentTick === 0 && timeline.currentRow === 2) {
					timeline.publishPlaybackSpeed(6);
				}
			},
			onPatternOrderAdvanced() {},
			captureSample() {
				return { left: 0.1, right: 0.1 };
			},
			release() {}
		};

		const nesLane = {
			songIndex: 1,
			audioSlotKind: 'nes',
			separateChannels: false,
			getLeaderPatternRowCount() {
				return 4;
			},
			runSharedPlaybackQuantum() {},
			onPatternOrderAdvanced() {},
			captureSample() {
				return { left: 0.2, right: 0.2 };
			},
			release() {}
		};

		const buffers = await renderOfflineSharedTimeline({
			lanes: [ayLane, nesLane],
			timeline,
			sampleRate: 44100,
			loopCount: 1,
			totalRows: 4
		});

		expect(buffers).toHaveLength(2);
		expect(buffers[0]![0]!.length).toBe(buffers[1]![0]!.length);
		expect(buffers[0]![1]!.length).toBe(buffers[1]![1]!.length);
		expect(buffers[0]![0]!.length).toBeGreaterThan(0);
	});
});
