import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PLAYBACK_ORDER_SEEK_DEBOUNCE_MS,
	PlaybackSeekScheduler
} from '../../../../src/lib/services/audio/playback-seek-scheduler';

describe('PlaybackSeekScheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not seek until the debounce window elapses', () => {
		const onSeek = vi.fn();
		const scheduler = new PlaybackSeekScheduler(onSeek);

		scheduler.schedule();
		expect(onSeek).not.toHaveBeenCalled();

		vi.advanceTimersByTime(PLAYBACK_ORDER_SEEK_DEBOUNCE_MS - 1);
		expect(onSeek).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(onSeek).toHaveBeenCalledTimes(1);
	});

	it('keeps only the latest seek when many changes arrive quickly', () => {
		const onSeek = vi.fn();
		const scheduler = new PlaybackSeekScheduler(onSeek);

		scheduler.schedule();
		vi.advanceTimersByTime(40);
		scheduler.schedule();
		vi.advanceTimersByTime(40);
		scheduler.schedule();
		vi.advanceTimersByTime(PLAYBACK_ORDER_SEEK_DEBOUNCE_MS);

		expect(onSeek).toHaveBeenCalledTimes(1);
	});

	it('does not seek after cancel', () => {
		const onSeek = vi.fn();
		const scheduler = new PlaybackSeekScheduler(onSeek);

		scheduler.schedule();
		scheduler.cancel();
		vi.advanceTimersByTime(PLAYBACK_ORDER_SEEK_DEBOUNCE_MS);

		expect(onSeek).not.toHaveBeenCalled();
		expect(scheduler.isPending).toBe(false);
	});

	it('seeks immediately on flush and cancels a pending debounce', () => {
		const onSeek = vi.fn();
		const scheduler = new PlaybackSeekScheduler(onSeek);

		scheduler.schedule();
		scheduler.flush();

		expect(onSeek).toHaveBeenCalledTimes(1);
		expect(scheduler.isPending).toBe(false);

		vi.advanceTimersByTime(PLAYBACK_ORDER_SEEK_DEBOUNCE_MS);
		expect(onSeek).toHaveBeenCalledTimes(1);
	});
});
