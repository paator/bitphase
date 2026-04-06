import type { Project } from '../../models/project';
import type { Chip } from '../../chips/types';
import type { ResourceLoader } from '../../chips/base/resource-loader';
import { mixAudioChannels } from '../../utils/audio-mixer';

async function getRegistry() {
	return import('../../chips/registry');
}
import { downloadFile, sanitizeFilename } from '../../utils/file-download';
import type { WavExportSettings } from './wav-export-settings';
import { defaultWavExportSettings } from './wav-export-settings';
import JSZip from 'jszip';

export type WavExportOptions = {
	onOutput?: (buffer: ArrayBuffer, filename: string) => void | Promise<void>;
	resourceLoader?: ResourceLoader;
	getChip?: (chipType: string) => Chip | null;
};

type ExportChannelDescriptor = {
	songIndex: number;
	chipType: string;
	channelIndex: number;
	label: string;
	samples: Float32Array;
};

const RENDERER_SAMPLE_RATE = 44100;
const RENDERING_PROGRESS_MAX = 90;
const RESAMPLING_PROGRESS = 91;
const ENCODING_PROGRESS = 92;
const DOWNLOAD_PROGRESS = 99;
const COMPLETE_PROGRESS = 100;

function writeString(view: DataView, offset: number, string: string) {
	for (let i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}

function resampleAudio(
	channels: Float32Array[],
	fromRate: number,
	toRate: number
): Float32Array[] {
	if (fromRate === toRate) {
		return channels;
	}

	const ratio = fromRate / toRate;
	const newLength = Math.floor(channels[0].length / ratio);
	const resampled: Float32Array[] = [];

	for (const channel of channels) {
		const output = new Float32Array(newLength);
		for (let i = 0; i < newLength; i++) {
			const srcIndex = i * ratio;
			const srcIndexFloor = Math.floor(srcIndex);
			const srcIndexCeil = Math.min(srcIndexFloor + 1, channel.length - 1);
			const frac = srcIndex - srcIndexFloor;
			output[i] = channel[srcIndexFloor] * (1 - frac) + channel[srcIndexCeil] * frac;
		}
		resampled.push(output);
	}

	return resampled;
}

function createMetadataChunk(settings: WavExportSettings): ArrayBuffer | null {
	const fields: { tag: string; value: string }[] = [];

	if (settings.title) fields.push({ tag: 'INAM', value: settings.title });
	if (settings.artist) fields.push({ tag: 'IART', value: settings.artist });
	if (settings.album) fields.push({ tag: 'IPRD', value: settings.album });
	if (settings.year) fields.push({ tag: 'ICRD', value: settings.year });
	if (settings.comment) fields.push({ tag: 'ICMT', value: settings.comment });

	if (fields.length === 0) return null;

	let totalSize = 4;
	const fieldBuffers: ArrayBuffer[] = [];

	for (const field of fields) {
		const valueLength = field.value.length + (field.value.length % 2);
		const fieldSize = 8 + valueLength;
		const buffer = new ArrayBuffer(fieldSize);
		const view = new DataView(buffer);

		writeString(view, 0, field.tag);
		view.setUint32(4, field.value.length, true);
		writeString(view, 8, field.value);

		fieldBuffers.push(buffer);
		totalSize += fieldSize;
	}

	const listBuffer = new ArrayBuffer(8 + totalSize);
	const listView = new DataView(listBuffer);

	writeString(listView, 0, 'LIST');
	listView.setUint32(4, totalSize, true);
	writeString(listView, 8, 'INFO');

	let offset = 12;
	for (const fieldBuffer of fieldBuffers) {
		new Uint8Array(listBuffer, offset).set(new Uint8Array(fieldBuffer));
		offset += fieldBuffer.byteLength;
	}

	return listBuffer;
}

function encodeWAV(
	samples: Float32Array[],
	sampleRate: number,
	settings: WavExportSettings
): ArrayBuffer {
	const numChannels = samples.length;
	const length = samples[0].length;
	const bitDepth = settings.bitDepth;
	const isFloat = bitDepth === 32;
	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;
	const byteRate = sampleRate * blockAlign;
	const dataSize = length * blockAlign;

	const metadataChunk = createMetadataChunk(settings);
	const metadataSize = metadataChunk ? metadataChunk.byteLength : 0;

	const headerSize = 44;
	const totalSize = headerSize + dataSize + metadataSize;
	const buffer = new ArrayBuffer(totalSize);
	const view = new DataView(buffer);

	writeString(view, 0, 'RIFF');
	view.setUint32(4, totalSize - 8, true);
	writeString(view, 8, 'WAVE');
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, isFloat ? 3 : 1, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeString(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = headerSize;

	if (isFloat) {
		const output = new Float32Array(buffer, offset, length * numChannels);
		for (let i = 0; i < length; i++) {
			for (let channel = 0; channel < numChannels; channel++) {
				output[i * numChannels + channel] = Math.max(-1, Math.min(1, samples[channel][i]));
			}
		}
	} else if (bitDepth === 24) {
		for (let i = 0; i < length; i++) {
			for (let channel = 0; channel < numChannels; channel++) {
				const s = Math.max(-1, Math.min(1, samples[channel][i]));
				const val = Math.round(s * (s < 0 ? 0x800000 : 0x7fffff));
				view.setInt8(offset++, val & 0xff);
				view.setInt8(offset++, (val >> 8) & 0xff);
				view.setInt8(offset++, (val >> 16) & 0xff);
			}
		}
	} else {
		const output = new Int16Array(buffer, offset, length * numChannels);
		for (let i = 0; i < length; i++) {
			for (let channel = 0; channel < numChannels; channel++) {
				const s = Math.max(-1, Math.min(1, samples[channel][i]));
				output[i * numChannels + channel] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
		}
		offset += output.byteLength;
	}

	if (metadataChunk) {
		new Uint8Array(buffer, offset).set(new Uint8Array(metadataChunk));
	}

	return buffer;
}

export type { ChipRenderer } from '../../chips/base/renderer';

class WavExportService {

	private async getChipForSong(
		project: Project,
		songIndex: number,
		getChipOverride?: (chipType: string) => Chip | null
	): Promise<Chip> {
		const resolveChip =
			getChipOverride ?? (await getRegistry()).getChipByType;
		const song = project.songs[songIndex];

		if (song?.chipType) {
			const chip = resolveChip(song.chipType);
			if (chip) {
				return chip;
			}
		}

		const defaultChip = resolveChip('ay');
		if (!defaultChip) {
			throw new Error('No chip available');
		}
		return defaultChip;
	}

	private calculateSongProgressRange(
		songIndex: number,
		totalSongs: number
	): { start: number; end: number } {
		return {
			start: (songIndex / totalSongs) * RENDERING_PROGRESS_MAX,
			end: ((songIndex + 1) / totalSongs) * RENDERING_PROGRESS_MAX
		};
	}

	private async renderSong(
		project: Project,
		songIndex: number,
		totalSongs: number,
		loops: number,
		onProgress?: (progress: number, message: string) => void,
		separateChannels?: boolean,
		resourceLoader?: ResourceLoader,
		getChipOverride?: (chipType: string) => Chip | null
	): Promise<Float32Array[]> {
		const song = project.songs[songIndex];
		if (!song || song.patterns.length === 0) {
			const progress = (songIndex / totalSongs) * RENDERING_PROGRESS_MAX;
			onProgress?.(progress, `Skipping empty song ${songIndex + 1}/${totalSongs}...`);
			throw new Error('Song is empty');
		}

		const { start: progressStart, end: progressEnd } = this.calculateSongProgressRange(
			songIndex,
			totalSongs
		);

		onProgress?.(
			progressStart,
			`Rendering song ${songIndex + 1}/${totalSongs} (${song.chipType || 'unknown chip'})...`
		);

		const chip = await this.getChipForSong(project, songIndex, getChipOverride);
		onProgress?.(
			progressStart + 2,
			`Loading ${chip.name} renderer for song ${songIndex + 1}...`
		);

		const renderer = chip.createRenderer(resourceLoader);
		if (!renderer) {
			throw new Error(`No renderer available for chip: ${chip.name} (song ${songIndex + 1})`);
		}

		onProgress?.(progressStart + 5, `Rendering song ${songIndex + 1}/${totalSongs}...`);

		return renderer.render(
			project,
			songIndex,
			(progress, message) => {
				const mappedProgress = progressStart + 5 + (progress / 100) * (progressEnd - progressStart - 5);
				onProgress?.(mappedProgress, `Song ${songIndex + 1}/${totalSongs}: ${message}`);
			},
			{
				separateChannels: separateChannels ?? false,
				loopCount: loops
			}
		);
	}

	private async buildSeparateChannels(
		project: Project,
		renderedBySongIndex: Map<number, Float32Array[]>,
		getChipOverride?: (chipType: string) => Chip | null
	): Promise<ExportChannelDescriptor[]> {
		const resolveChip = getChipOverride ?? (await getRegistry()).getChipByType;
		const descriptors: ExportChannelDescriptor[] = [];
		let maxLength = 0;
		for (const channels of renderedBySongIndex.values()) {
			if (channels[0].length > maxLength) {
				maxLength = channels[0].length;
			}
		}

		const sortedSongIndices = Array.from(renderedBySongIndex.keys()).sort((a, b) => a - b);
		for (const songIndex of sortedSongIndices) {
			const song = project.songs[songIndex];
			const chip = song?.chipType ? resolveChip(song.chipType) : null;
			const labels = chip?.schema?.channelLabels ?? ['L', 'R'];
			const channels = renderedBySongIndex.get(songIndex)!;
			const chipType = song?.chipType ?? 'unknown';

			for (let ch = 0; ch < channels.length; ch++) {
				const label = labels[ch] ?? `Ch${ch}`;
				const src = channels[ch];
				let samples: Float32Array;
				if (src.length < maxLength) {
					samples = new Float32Array(maxLength);
					samples.set(src);
				} else {
					samples = src;
				}
				descriptors.push({
					songIndex,
					chipType,
					channelIndex: ch,
					label,
					samples
				});
			}
		}

		return descriptors;
	}

	async export(
		project: Project,
		settings: WavExportSettings,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal,
		options?: WavExportOptions
	): Promise<void> {
		const { onOutput, resourceLoader, getChip } = options ?? {};
		onProgress?.(0, 'Preparing export...');

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		if (project.songs.length === 0) {
			throw new Error('Project has no songs');
		}

		const totalSongs = project.songs.length;
		const separateFiles = settings.channelMode === 'separateFiles';

		if (separateFiles) {
			const renderedBySongIndex = new Map<number, Float32Array[]>();
			for (let i = 0; i < project.songs.length; i++) {
				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}
				try {
					const channels = await this.renderSong(
						project,
						i,
						totalSongs,
						settings.loops,
						onProgress,
						true,
						resourceLoader,
						getChip
					);
					renderedBySongIndex.set(i, channels);
				} catch (error) {
					if (error instanceof Error && error.message === 'Song is empty') {
						continue;
					}
					throw error;
				}
			}

			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}

			if (renderedBySongIndex.size === 0) {
				throw new Error('No audio data to export');
			}

			const descriptors = await this.buildSeparateChannels(
				project,
				renderedBySongIndex,
				getChip
			);
			const allSamples = descriptors.map((d) => d.samples);
			let samplesToEncode = allSamples;

			if (settings.sampleRate !== RENDERER_SAMPLE_RATE) {
				onProgress?.(RESAMPLING_PROGRESS, `Resampling to ${settings.sampleRate} Hz...`);
				samplesToEncode = resampleAudio(
					allSamples,
					RENDERER_SAMPLE_RATE,
					settings.sampleRate
				);
				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}
			}

			const baseFilename = settings.title || project.name || 'export';
			const sanitizedBase = sanitizeFilename(baseFilename);

			onProgress?.(ENCODING_PROGRESS, 'Creating ZIP archive...');
			const zip = new JSZip();
			for (let i = 0; i < descriptors.length; i++) {
				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}
				const d = descriptors[i]!;
				const channelFilename = `${sanitizedBase}_song${d.songIndex + 1}_${d.chipType}_${d.label}.wav`;
				const wavBuffer = encodeWAV([samplesToEncode[i]!], settings.sampleRate, settings);
				zip.file(channelFilename, wavBuffer);
			}

			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}

			onProgress?.(DOWNLOAD_PROGRESS, 'Downloading...');
			const zipOutputType = onOutput ? 'arraybuffer' : 'blob';
			const zipOutput = await zip.generateAsync({ type: zipOutputType });
			if (onOutput) {
				await onOutput(zipOutput as ArrayBuffer, `${sanitizedBase}_channels.zip`);
			} else {
				downloadFile(zipOutput as Blob, `${sanitizedBase}_channels.zip`);
			}

			onProgress?.(COMPLETE_PROGRESS, 'Complete!');
			return;
		}

		const renderedSongs: Float32Array[][] = [];
		for (let i = 0; i < project.songs.length; i++) {
			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}
			try {
				const channels = await this.renderSong(
					project,
					i,
					totalSongs,
					settings.loops,
					onProgress,
					false,
					resourceLoader,
					getChip
				);
				renderedSongs.push(channels);
			} catch (error) {
				if (error instanceof Error && error.message === 'Song is empty') {
					continue;
				}
				throw error;
			}
		}

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		if (renderedSongs.length === 0) {
			throw new Error('No audio data to export');
		}

		onProgress?.(RENDERING_PROGRESS_MAX, 'Mixing songs...');
		let [mixedLeft, mixedRight] = mixAudioChannels(renderedSongs);

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		if (settings.sampleRate !== RENDERER_SAMPLE_RATE) {
			onProgress?.(RESAMPLING_PROGRESS, `Resampling to ${settings.sampleRate} Hz...`);
			[mixedLeft, mixedRight] = resampleAudio(
				[mixedLeft, mixedRight],
				RENDERER_SAMPLE_RATE,
				settings.sampleRate
			);

			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}
		}

		onProgress?.(ENCODING_PROGRESS, 'Encoding WAV file...');
		const wavBuffer = encodeWAV([mixedLeft, mixedRight], settings.sampleRate, settings);
		const filename = settings.title || project.name || 'export';
		const sanitizedFilename = sanitizeFilename(filename);

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		onProgress?.(DOWNLOAD_PROGRESS, 'Downloading...');
		if (onOutput) {
			await onOutput(wavBuffer, `${sanitizedFilename}.wav`);
		} else {
			downloadFile(new Blob([wavBuffer], { type: 'audio/wav' }), `${sanitizedFilename}.wav`);
		}

		onProgress?.(COMPLETE_PROGRESS, 'Complete!');
	}
}

const wavExportService = new WavExportService();

export async function exportToWAV(
	project: Project,
	settings: WavExportSettings = defaultWavExportSettings,
	onProgress?: (progress: number, message: string) => void,
	abortSignal?: AbortSignal,
	options?: WavExportOptions
): Promise<void> {
	try {
		await wavExportService.export(project, settings, onProgress, abortSignal, options);
	} catch (error) {
		if (error instanceof Error && error.message === 'Export cancelled') {
			onProgress?.(0, 'Export cancelled');
			throw error;
		}
		console.error('Failed to export WAV:', error);
		onProgress?.(0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}
