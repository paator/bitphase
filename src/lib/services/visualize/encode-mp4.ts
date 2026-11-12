import { ArrayBufferTarget, Muxer, StreamTarget } from 'mp4-muxer';
import {
	selectYoutubeAudioBitrate,
	YOUTUBE_AUDIO_SAMPLE_RATE,
	YOUTUBE_FRAME_RATE,
	YOUTUBE_KEYFRAME_INTERVAL,
	youtubeAudioEncoderConfig,
	type VideoEncoderAttempt,
	type YoutubeVideoProfile
} from './youtube-profile';

const AAC_FRAME = 1024;

export type YoutubeEncodeRequest = {
	canvas: HTMLCanvasElement;
	attempt: VideoEncoderAttempt;
	drawFrame: (frameIndex: number) => void;
	audioLeft: Float32Array;
	audioRight: Float32Array;
	writable?: FileSystemWritableFileStream;
	signal?: AbortSignal;
	onProgress?: (progress: number, message: string) => void;
	onFrame?: (canvas: HTMLCanvasElement) => void;
};

export type YoutubeEncodeResult = {
	profile: YoutubeVideoProfile;
	audioBitrate: number;
	blob: Blob | null;
};

export async function encodeYoutubeMp4(request: YoutubeEncodeRequest): Promise<YoutubeEncodeResult> {
	if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
		throw new Error('This browser cannot encode an MP4. Use Chrome or Edge.');
	}
	throwIfCancelled(request.signal);

	const attempt = request.attempt;
	const audioBitrate = await selectYoutubeAudioBitrate(async (bitrate) => {
		const support = await AudioEncoder.isConfigSupported(youtubeAudioEncoderConfig(bitrate));
		return support.supported === true;
	});

	const [left, right] = padStereo(request.audioLeft, request.audioRight, AAC_FRAME);
	const audioChunks = left.length / AAC_FRAME;
	const frameCount = Math.max(1, Math.round((left.length / YOUTUBE_AUDIO_SAMPLE_RATE) * YOUTUBE_FRAME_RATE));
	const profile = attempt.profile;

	if (request.canvas.width !== profile.width || request.canvas.height !== profile.height) {
		throw new Error('Pattern frame size does not match the video');
	}

	const writer = request.writable ? new OrderedFileWriter(request.writable) : null;
	const target = writer
		? new StreamTarget({
				onData: (data, position) => writer.write(data, position),
				chunked: true,
				chunkSize: 16 * 1024 * 1024
			})
		: new ArrayBufferTarget();
	const muxer = new Muxer({
		target,
		video: {
			codec: 'avc',
			width: profile.width,
			height: profile.height,
			frameRate: YOUTUBE_FRAME_RATE
		},
		audio: {
			codec: 'aac',
			numberOfChannels: 2,
			sampleRate: YOUTUBE_AUDIO_SAMPLE_RATE
		},
		fastStart: {
			expectedVideoChunks: frameCount + 8,
			expectedAudioChunks: audioChunks + 8
		},
		firstTimestampBehavior: 'strict'
	});

	let rejectEncode: (error: Error) => void = () => {};
	const failed = new Promise<never>((_, reject) => {
		rejectEncode = reject;
	});

	const videoEncoder = new VideoEncoder({
		output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
		error: (error) => rejectEncode(error instanceof Error ? error : new Error(String(error)))
	});
	const audioEncoder = new AudioEncoder({
		output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
		error: (error) => rejectEncode(error instanceof Error ? error : new Error(String(error)))
	});

	try {
		await Promise.race([
			encodeTracks({
				request,
				muxer,
				writer,
				videoEncoder,
				audioEncoder,
				config: attempt.config,
				audioBitrate,
				left,
				right,
				frameCount,
				profile
			}),
			failed
		]);
		if (writer) {
			await writer.finish();
			return { profile, audioBitrate, blob: null };
		}
		if (!(target instanceof ArrayBufferTarget)) {
			throw new Error('Encoded video was not stored');
		}
		return {
			profile,
			audioBitrate,
			blob: new Blob([target.buffer], { type: 'video/mp4' })
		};
	} catch (error) {
		await writer?.abort();
		throw error;
	} finally {
		if (videoEncoder.state !== 'closed') videoEncoder.close();
		if (audioEncoder.state !== 'closed') audioEncoder.close();
	}
}

async function encodeTracks(options: {
	request: YoutubeEncodeRequest;
	muxer: Muxer<ArrayBufferTarget | StreamTarget>;
	writer: OrderedFileWriter | null;
	videoEncoder: VideoEncoder;
	audioEncoder: AudioEncoder;
	config: VideoEncoderConfig;
	audioBitrate: number;
	left: Float32Array;
	right: Float32Array;
	frameCount: number;
	profile: YoutubeVideoProfile;
}): Promise<void> {
	const { request, videoEncoder, audioEncoder, left, right, frameCount, profile } = options;
	videoEncoder.configure(options.config);
	audioEncoder.configure(youtubeAudioEncoderConfig(options.audioBitrate));
	request.onProgress?.(46, `Encoding ${profile.label} audio`);

	for (let offset = 0, index = 0; offset < left.length; offset += AAC_FRAME, index++) {
		throwIfCancelled(request.signal);
		const planar = new Float32Array(AAC_FRAME * 2);
		planar.set(left.subarray(offset, offset + AAC_FRAME), 0);
		planar.set(right.subarray(offset, offset + AAC_FRAME), AAC_FRAME);
		const audio = new AudioData({
			format: 'f32-planar',
			sampleRate: YOUTUBE_AUDIO_SAMPLE_RATE,
			numberOfFrames: AAC_FRAME,
			numberOfChannels: 2,
			timestamp: Math.round((index * AAC_FRAME * 1_000_000) / YOUTUBE_AUDIO_SAMPLE_RATE),
			data: planar
		});
		audioEncoder.encode(audio);
		audio.close();
		if (audioEncoder.encodeQueueSize > 8) {
			await waitForDequeue(audioEncoder);
		}
		if (index % 8 === 0) await options.writer?.drain();
	}
	await audioEncoder.flush();
	throwIfCancelled(request.signal);

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
		throwIfCancelled(request.signal);
		request.drawFrame(frameIndex);
		if (frameIndex % 15 === 0 || frameIndex === frameCount - 1) {
			request.onFrame?.(request.canvas);
			request.onProgress?.(
				46 + (frameIndex / frameCount) * 52,
				`Encoding ${profile.label} · frame ${frameIndex + 1}/${frameCount}`
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		const timestamp = frameTimestamp(frameIndex);
		const duration = frameTimestamp(frameIndex + 1) - timestamp;
		const videoFrame = new VideoFrame(request.canvas, {
			timestamp,
			duration,
			alpha: 'discard'
		});
		try {
			videoEncoder.encode(videoFrame, {
				keyFrame: frameIndex % YOUTUBE_KEYFRAME_INTERVAL === 0
			});
		} finally {
			videoFrame.close();
		}
		if (videoEncoder.encodeQueueSize > 6) {
			await waitForDequeue(videoEncoder);
		}
		if (frameIndex % 4 === 0) await options.writer?.drain();
	}
	await videoEncoder.flush();
	options.muxer.finalize();
}

function padStereo(
	left: Float32Array,
	right: Float32Array,
	frameSize: number
): [Float32Array, Float32Array] {
	const length = Math.min(left.length, right.length);
	const padded = Math.max(frameSize, Math.ceil(length / frameSize) * frameSize);
	if (padded === left.length && padded === right.length) {
		return [left, right];
	}
	const nextLeft = new Float32Array(padded);
	const nextRight = new Float32Array(padded);
	nextLeft.set(left.subarray(0, length));
	nextRight.set(right.subarray(0, length));
	return [nextLeft, nextRight];
}

function frameTimestamp(index: number): number {
	return Math.round((index * 1_000_000) / YOUTUBE_FRAME_RATE);
}

class OrderedFileWriter {
	private chain: Promise<void> = Promise.resolve();

	constructor(private readonly stream: FileSystemWritableFileStream) {}

	write(data: Uint8Array, position: number): void {
		const copy = new Uint8Array(data.byteLength);
		copy.set(data);
		this.chain = this.chain.then(() =>
			this.stream.write({ type: 'write', data: copy, position })
		);
	}

	drain(): Promise<void> {
		return this.chain;
	}

	async finish(): Promise<void> {
		await this.chain;
		await this.stream.close();
	}

	async abort(): Promise<void> {
		await this.chain.catch(() => undefined);
		await this.stream.abort().catch(() => undefined);
	}
}

function throwIfCancelled(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error('Export cancelled');
}

function waitForDequeue(encoder: VideoEncoder | AudioEncoder): Promise<void> {
	return new Promise((resolve) => {
		encoder.addEventListener('dequeue', () => resolve(), { once: true });
	});
}
