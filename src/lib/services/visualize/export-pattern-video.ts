import type { Project } from '../../models/project';
import type { EmptyNoteAlignment } from '../../ui-rendering/empty-note-alignment';
import { BrowserResourceLoader } from '../../chips/base/resource-loader';
import { getChipByType } from '../../chips/registry';
import { mixAudioChannels } from '../../utils/audio-mixer';
import {
	PLAYBACK_SAMPLE_RATE,
	renderProjectPlaybackAudio
} from '../file/wav/mixed-chip-shared-timeline-export';
import type { SharedTimelinePosition } from '../file/wav/offline-shared-timeline-render';
import { encodeYoutubeMp4 } from './encode-mp4';
import { createPatternRollFrame } from './pattern-frame';
import { fadeOutTail, limitPeak, resampleStereo } from './prepare-stereo';
import { rowMotionAtSample, rowSpansFromChanges } from './playback-position';
import {
	selectYoutubeVideoProfile,
	YOUTUBE_AUDIO_SAMPLE_RATE,
	YOUTUBE_FRAME_RATE
} from './youtube-profile';

export type PatternVideoExportOptions = {
	project: Project;
	fontFamily: string;
	selectionStyle: 'inverted' | 'filled';
	emptyNoteAlignment: EmptyNoteAlignment;
	writable?: FileSystemWritableFileStream;
	signal?: AbortSignal;
	onProgress?: (progress: number, message: string) => void;
	onFrame?: (canvas: HTMLCanvasElement) => void;
};

export async function exportPatternVideo(options: PatternVideoExportOptions): Promise<Blob | null> {
	throwIfCancelled(options.signal);
	if (typeof VideoEncoder === 'undefined') {
		throw new Error('This browser cannot encode an MP4. Use Chrome or Edge.');
	}
	const attempt = await selectYoutubeVideoProfile(async (config) => {
		const supported = await VideoEncoder.isConfigSupported(config);
		return supported.supported === true;
	});
	options.onProgress?.(1, `Loading the player · ${attempt.profile.label}`);
	const changes: SharedTimelinePosition[] = [];
	const rendered = await renderProjectPlaybackAudio(options.project, {
		loopCount: 1,
		resourceLoader: new BrowserResourceLoader(),
		getChip: getChipByType,
		abortSignal: options.signal,
		onPositionChange: (position) => changes.push(position),
		onProgress: (progress, message) => options.onProgress?.(progress * 0.4, message)
	});
	throwIfCancelled(options.signal);

	const mixed = mixAudioChannels(rendered.buffers);
	const left = mixed[0]!;
	const right = mixed[1]!;
	if (left.length === 0) {
		throw new Error('Song is empty');
	}
	fadeOutTail(left, right, Math.round(PLAYBACK_SAMPLE_RATE * 0.01));
	limitPeak(left, right);
	const spans = rowSpansFromChanges(changes, left.length);

	options.onProgress?.(42, 'Resampling to 48 kHz');
	const [resampledLeft, resampledRight] = await resampleStereo(
		left,
		right,
		PLAYBACK_SAMPLE_RATE,
		YOUTUBE_AUDIO_SAMPLE_RATE
	);
	limitPeak(resampledLeft, resampledRight);
	throwIfCancelled(options.signal);

	const canvas = document.createElement('canvas');
	canvas.width = attempt.profile.width;
	canvas.height = attempt.profile.height;
	const frame = await createPatternRollFrame({
		canvas,
		project: options.project,
		songIndex: rendered.leaderSongIndex,
		fontFamily: options.fontFamily,
		selectionStyle: options.selectionStyle,
		emptyNoteAlignment: options.emptyNoteAlignment
	});

	const duration = left.length / PLAYBACK_SAMPLE_RATE;
	options.onProgress?.(45, `Encoding ${attempt.profile.label} · ${formatClock(duration)}`);
	const result = await encodeYoutubeMp4({
		canvas,
		attempt,
		audioLeft: resampledLeft,
		audioRight: resampledRight,
		writable: options.writable,
		signal: options.signal,
		onFrame: options.onFrame,
		onProgress: options.onProgress,
		drawFrame: (frameIndex) => {
			const sample = (frameIndex / YOUTUBE_FRAME_RATE) * PLAYBACK_SAMPLE_RATE;
			frame.draw(rowMotionAtSample(spans, sample));
		}
	});
	options.onProgress?.(100, `Saved ${result.profile.label}`);
	return result.blob;
}

function formatClock(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const minutes = Math.floor(total / 60);
	const remain = total % 60;
	return `${minutes}:${remain.toString().padStart(2, '0')}`;
}

function throwIfCancelled(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error('Export cancelled');
}
