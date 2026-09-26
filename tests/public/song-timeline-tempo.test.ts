import { describe, expect, it } from 'vitest';
import SongTimeline from '../../public/tracker/song-timeline.js';

function rowLengths(timeline: SongTimeline, count: number): number[] {
	timeline.setPatternOrder([0]);
	const lengths: number[] = [];
	let frames = 0;
	while (lengths.length < count) {
		const row = timeline.currentRow;
		timeline.advancePosition(64);
		frames++;
		if (timeline.currentRow !== row) {
			lengths.push(frames);
			frames = 0;
		}
	}
	return lengths;
}

describe('SongTimeline tempo', () => {
	it('keeps one frame per speed tick when tempo is off', () => {
		const timeline = new SongTimeline();
		timeline.setIntFrequency(60, 48000);
		timeline.setSpeed(6);
		expect(rowLengths(timeline, 4)).toEqual([6, 6, 6, 6]);
	});

	it('matches the NTSC 125 clock for speeds 6, 4 and 2', () => {
		const speed6 = new SongTimeline();
		speed6.setIntFrequency(60, 48000);
		speed6.setSpeed(6);
		speed6.setTempo(125);
		expect(rowLengths(speed6, 5)).toEqual([8, 7, 7, 7, 7]);

		const speed4 = new SongTimeline();
		speed4.setIntFrequency(60, 48000);
		speed4.setSpeed(4);
		speed4.setTempo(125);
		expect(rowLengths(speed4, 5)).toEqual([5, 5, 5, 5, 4]);

		const speed2 = new SongTimeline();
		speed2.setIntFrequency(60, 48000);
		speed2.setSpeed(2);
		speed2.setTempo(125);
		expect(rowLengths(speed2, 5)).toEqual([3, 2, 3, 2, 2]);
	});

	it('keeps the accumulator when speed changes', () => {
		const timeline = new SongTimeline();
		timeline.setIntFrequency(60, 48000);
		timeline.setSpeed(6);
		timeline.setTempo(125);
		expect(rowLengths(timeline, 1)).toEqual([8]);
		timeline.setSpeed(4);
		expect(rowLengths(timeline, 3)).toEqual([5, 5, 4]);
	});

	it('uses exact speed frames at the default tempo for that rate', () => {
		const ntsc = new SongTimeline();
		ntsc.setIntFrequency(60, 48000);
		ntsc.setSpeed(6);
		ntsc.setTempo(150);
		expect(rowLengths(ntsc, 3)).toEqual([6, 6, 6]);

		const pal = new SongTimeline();
		pal.setIntFrequency(50, 48000);
		pal.setSpeed(6);
		pal.setTempo(125);
		expect(rowLengths(pal, 3)).toEqual([6, 6, 6]);
	});

	it('marks the last frame from the tempo clock, including rows shorter than speed', () => {
		const timeline = new SongTimeline();
		timeline.setIntFrequency(60, 48000);
		timeline.setSpeed(2);
		timeline.setTempo(125);
		const marked: number[] = [];
		let frames = 0;
		while (marked.length < 5) {
			frames++;
			if (timeline.isLastFrameOfRow()) {
				marked.push(frames);
				frames = 0;
			}
			timeline.advancePosition(64);
		}
		expect(marked).toEqual([3, 2, 3, 2, 2]);
	});

	it('keeps the Pentagon rate in the tempo divider', () => {
		const timeline = new SongTimeline();
		timeline.setIntFrequency(48.828, 48000);
		timeline.setSpeed(6);
		timeline.setTempo(125);
		const rounded = new SongTimeline();
		rounded.setIntFrequency(49, 48000);
		rounded.setSpeed(6);
		rounded.setTempo(125);
		expect(rowLengths(timeline, 8)).not.toEqual(rowLengths(rounded, 8));
	});
});
