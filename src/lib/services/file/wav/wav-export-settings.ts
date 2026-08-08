export type WavChannelMode = 'mixed' | 'separateFiles';

export interface WavExportSettings {
	sampleRate: number;
	bitDepth: 16 | 24 | 32;
	loops: number;
	channelMode: WavChannelMode;
	title?: string;
	artist?: string;
	album?: string;
	year?: string;
	comment?: string;
}

export const defaultWavExportSettings: WavExportSettings = {
	sampleRate: 44100,
	bitDepth: 16,
	loops: 1,
	channelMode: 'mixed',
	title: '',
	artist: '',
	album: '',
	year: '',
	comment: ''
};

export const sampleRateOptions = [
	{ label: '22050 Hz', value: 22050 },
	{ label: '44100 Hz', value: 44100 },
	{ label: '48000 Hz', value: 48000 },
	{ label: '96000 Hz', value: 96000 }
];

export const bitDepthOptions = [
	{ label: '16-bit PCM', value: 16 },
	{ label: '24-bit PCM', value: 24 },
	{ label: '32-bit Float', value: 32 }
];

export const channelModeOptions = [
	{ label: 'Mixed (one stereo file)', value: 'mixed' as WavChannelMode },
	{ label: 'Separate (one WAV per channel)', value: 'separateFiles' as WavChannelMode }
];
