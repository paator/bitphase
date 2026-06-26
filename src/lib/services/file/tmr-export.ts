import type { Project } from '../../models/project';
import { downloadFile, sanitizeFilename } from '../../utils/file-download';
import JSZip from 'jszip';
import {
	captureSongRegisterFrames,
	type GenerateCaptureOptions,
	type PsgExportModules
} from './psg-export';
import { encodeTMR, type EncodedTmrFiles } from './tmr-encoder';

async function loadPsgExportModules(): Promise<PsgExportModules> {
	const baseUrl = import.meta.env.BASE_URL;
	const { default: AyumiState } = await import(/* @vite-ignore */ `${baseUrl}ayumi-state.js`);
	const { default: TrackerPatternProcessor } = await import(
		/* @vite-ignore */ `${baseUrl}tracker-pattern-processor.js`
	);
	const { default: AYAudioDriver } = await import(/* @vite-ignore */ `${baseUrl}ay-audio-driver.js`);
	const { default: AYChipRegisterState } = await import(
		/* @vite-ignore */ `${baseUrl}ay-chip-register-state.js`
	);
	const { default: VirtualChannelMixer } = await import(
		/* @vite-ignore */ `${baseUrl}virtual-channel-mixer.js`
	);
	return {
		AyumiState,
		TrackerPatternProcessor,
		AYAudioDriver,
		AYChipRegisterState,
		VirtualChannelMixer
	};
}

function getAYSongIndices(project: Project): number[] {
	const aySongIndices: number[] = [];
	for (let index = 0; index < project.songs.length; index++) {
		const song = project.songs[index];
		if (song && (!song.chipType || song.chipType === 'ay')) {
			aySongIndices.push(index);
		}
	}
	return aySongIndices;
}

function downloadTmrPair(baseName: string, encoded: EncodedTmrFiles): void {
	downloadFile(new Blob([encoded.tmr], { type: 'application/octet-stream' }), `${baseName}.tmr`);
	downloadFile(
		new Blob([encoded.eventList], { type: 'application/octet-stream' }),
		`${baseName}.tel`
	);
}

export interface GenerateTMRBufferOptions extends GenerateCaptureOptions {}

export async function generateTMRFiles(
	project: Project,
	songIndex: number = 0,
	options?: GenerateTMRBufferOptions
): Promise<EncodedTmrFiles> {
	const capture = await captureSongRegisterFrames(project, songIndex, options);
	return encodeTMR(capture.frames, {
		chipFrequency: capture.chipFrequency,
		interruptFrequency: capture.interruptFrequency,
		isYm: capture.isYm
	});
}

export async function exportToTMR(
	project: Project,
	songIndex: number = 0,
	onProgress?: (progress: number, message: string) => void,
	abortSignal?: AbortSignal
): Promise<void> {
	try {
		onProgress?.(0, 'Preparing TMR export...');
		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		const song = project.songs[songIndex];
		if (!song || song.patterns.length === 0) {
			throw new Error('Song is empty');
		}

		onProgress?.(10, 'Loading processor modules...');
		const modules = await loadPsgExportModules();
		const filename = project.name || 'export';
		const sanitizedFilename = sanitizeFilename(filename);
		const aySongIndices = getAYSongIndices(project);

		if (aySongIndices.length > 1) {
			const zip = new JSZip();
			for (let index = 0; index < aySongIndices.length; index++) {
				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}
				const currentSongIndex = aySongIndices[index]!;
				const startProgress = 10 + (index / aySongIndices.length) * 80;
				onProgress?.(startProgress, `Generating TMR ${index + 1}/${aySongIndices.length}...`);
				const capture = await captureSongRegisterFrames(project, currentSongIndex, { modules });
				const encoded = encodeTMR(capture.frames, {
					chipFrequency: capture.chipFrequency,
					interruptFrequency: capture.interruptFrequency,
					isYm: capture.isYm,
					chipIndex: index
				});
				const baseName = `${sanitizedFilename}_ay${index + 1}`;
				zip.file(`${baseName}.tmr`, encoded.tmr);
				zip.file(`${baseName}.tel`, encoded.eventList);
			}

			onProgress?.(95, 'Creating ZIP archive...');
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			onProgress?.(99, 'Downloading...');
			downloadFile(zipBlob, `${sanitizedFilename}_tmr.zip`);
			onProgress?.(100, 'Complete!');
			return;
		}

		onProgress?.(50, 'Capturing timer effects...');
		const capture = await captureSongRegisterFrames(project, songIndex, { modules });
		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		onProgress?.(95, 'Encoding TMR files...');
		const encoded = encodeTMR(capture.frames, {
			chipFrequency: capture.chipFrequency,
			interruptFrequency: capture.interruptFrequency,
			isYm: capture.isYm
		});
		onProgress?.(99, 'Downloading...');
		downloadTmrPair(sanitizedFilename, encoded);
		onProgress?.(100, 'Complete!');
	} catch (error) {
		if (error instanceof Error && error.message === 'Export cancelled') {
			onProgress?.(0, 'Export cancelled');
			throw error;
		}
		console.error('Failed to export TMR:', error);
		onProgress?.(0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}
