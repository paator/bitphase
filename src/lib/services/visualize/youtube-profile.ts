export const YOUTUBE_FRAME_RATE = 30;
export const YOUTUBE_KEYFRAME_INTERVAL = YOUTUBE_FRAME_RATE / 2;
export const YOUTUBE_AUDIO_SAMPLE_RATE = 48_000;
export const YOUTUBE_AUDIO_CODEC = 'mp4a.40.2';
export const YOUTUBE_AUDIO_BITRATES = [384_000, 256_000] as const;

export type YoutubeVideoProfile = {
	width: number;
	height: number;
	bitrate: number;
	codec: string;
	label: string;
};

export const YOUTUBE_VIDEO_LADDER: readonly YoutubeVideoProfile[] = [
	{ width: 3840, height: 2160, bitrate: 45_000_000, codec: 'avc1.640034', label: '2160p30' },
	{ width: 2560, height: 1440, bitrate: 16_000_000, codec: 'avc1.640033', label: '1440p30' },
	{ width: 1920, height: 1080, bitrate: 8_000_000, codec: 'avc1.64002a', label: '1080p30' },
	{ width: 1920, height: 1080, bitrate: 8_000_000, codec: 'avc1.4d002a', label: '1080p30' },
	{ width: 1280, height: 720, bitrate: 5_000_000, codec: 'avc1.42001f', label: '720p30' }
];

export type VideoEncoderAttempt = {
	profile: YoutubeVideoProfile;
	config: VideoEncoderConfig;
};

export function youtubeVideoEncoderAttempts(): VideoEncoderAttempt[] {
	const attempts: VideoEncoderAttempt[] = [];
	for (const profile of YOUTUBE_VIDEO_LADDER) {
		const base: VideoEncoderConfig = {
			codec: profile.codec,
			width: profile.width,
			height: profile.height,
			bitrate: profile.bitrate,
			framerate: YOUTUBE_FRAME_RATE,
			bitrateMode: 'variable',
			avc: { format: 'avc' }
		};
		for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
			attempts.push({
				profile,
				config: { ...base, hardwareAcceleration, latencyMode: 'quality' }
			});
			attempts.push({
				profile,
				config: { ...base, hardwareAcceleration }
			});
		}
	}
	return attempts;
}

export async function selectYoutubeVideoProfile(
	isSupported: (config: VideoEncoderConfig) => Promise<boolean>
): Promise<VideoEncoderAttempt> {
	for (const attempt of youtubeVideoEncoderAttempts()) {
		if (await isSupported(attempt.config)) return attempt;
	}
	throw new Error('This browser cannot encode an H.264 MP4. Use Chrome or Edge.');
}

export function youtubeAudioEncoderConfig(bitrate: number): AudioEncoderConfig {
	return {
		codec: YOUTUBE_AUDIO_CODEC,
		sampleRate: YOUTUBE_AUDIO_SAMPLE_RATE,
		numberOfChannels: 2,
		bitrate
	};
}

export async function selectYoutubeAudioBitrate(
	isSupported: (bitrate: number) => Promise<boolean>
): Promise<number> {
	for (const bitrate of YOUTUBE_AUDIO_BITRATES) {
		if (await isSupported(bitrate)) return bitrate;
	}
	throw new Error('This browser cannot encode AAC audio. Use Chrome or Edge.');
}
