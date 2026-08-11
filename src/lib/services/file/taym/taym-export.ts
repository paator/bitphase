import type { Project } from '../../../models/project';
import { downloadFile, sanitizeFilename } from '../../../utils/file-download';
import JSZip from 'jszip';
import {
	captureSongRegisterFrames,
	type GenerateCaptureOptions,
	type PsgExportModules
} from '../ay/psg-export';
import { buildTaymFromCapture } from './taym-builder';
import { buildTaymMetadata } from './taym-metadata';
import { writeTaym } from './codec';
import type { TaymTimerMode } from './taym-export-timers';

export interface TaymExportOptions extends GenerateCaptureOptions {
	timerMode?: TaymTimerMode;
}

async function loadPsgExportModules(): Promise<PsgExportModules> {
	const baseUrl = import.meta.env.BASE_URL;
	const { default: AyumiState } = await import(/* @vite-ignore */ `${baseUrl}ay/ayumi-state.js`);
	const { default: TrackerPatternProcessor } = await import(
		/* @vite-ignore */ `${baseUrl}tracker/tracker-pattern-processor.js`
	);
	const { default: AYAudioDriver } = await import(
		/* @vite-ignore */ `${baseUrl}ay/ay-audio-driver.js`
	);
	const { default: AYChipRegisterState } = await import(
		/* @vite-ignore */ `${baseUrl}ay/ay-chip-register-state.js`
	);
	const { default: VirtualChannelMixer } = await import(
		/* @vite-ignore */ `${baseUrl}ay/virtual-channel-mixer.js`
	);
	const samplePlayback = await import(
		/* @vite-ignore */ `${baseUrl}ay/ay-sample-playback.js`
	);
	return {
		AyumiState,
		TrackerPatternProcessor,
		AYAudioDriver,
		AYChipRegisterState,
		VirtualChannelMixer,
		instrumentHasSample: samplePlayback.instrumentHasSample,
		advanceSamplePosition: samplePlayback.advanceSamplePosition
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

export function resolveSingleAyTaymSongIndex(project: Project, songIndex: number = 0): number {
	const aySongIndices = getAYSongIndices(project);
	return aySongIndices.length === 1 ? aySongIndices[0]! : songIndex;
}

export async function generateTaymFile(
	project: Project,
	songIndex: number = 0,
	options?: TaymExportOptions
): Promise<ArrayBuffer> {
	const capture = await captureSongRegisterFrames(project, songIndex, {
		...options,
		captureDigiSamples: true
	});
	const song = project.songs[songIndex];
	const metadata = song ? buildTaymMetadata(project, song) : undefined;
	return writeTaym(buildTaymFromCapture(capture, { metadata, timerMode: options?.timerMode }));
}

export async function exportToTaym(
	project: Project,
	songIndex: number = 0,
	onProgress?: (progress: number, message: string) => void,
	abortSignal?: AbortSignal
): Promise<void> {
	try {
		onProgress?.(0, 'Preparing TAYM export...');
		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		const aySongIndices = getAYSongIndices(project);
		if (aySongIndices.length === 0) {
			throw new Error('Project has no AY songs to export');
		}

		onProgress?.(10, 'Loading processor modules...');
		const modules = await loadPsgExportModules();
		const filename = project.name || 'export';
		const sanitizedFilename = sanitizeFilename(filename);

		if (aySongIndices.length > 1) {
			const zip = new JSZip();
			for (let index = 0; index < aySongIndices.length; index++) {
				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}
				const currentSongIndex = aySongIndices[index]!;
				const startProgress = 10 + (index / aySongIndices.length) * 80;
				onProgress?.(startProgress, `Generating TAYM ${index + 1}/${aySongIndices.length}...`);
				const taym = await generateTaymFile(project, currentSongIndex, { modules });
				zip.file(`${sanitizedFilename}_ay${index + 1}.taym`, taym);
			}

			onProgress?.(95, 'Creating ZIP archive...');
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			onProgress?.(99, 'Downloading...');
			downloadFile(zipBlob, `${sanitizedFilename}_taym.zip`);
			onProgress?.(100, 'Complete!');
			return;
		}

		const exportSongIndex = resolveSingleAyTaymSongIndex(project, songIndex);
		const song = project.songs[exportSongIndex];
		if (!song || song.patterns.length === 0) {
			throw new Error('Song is empty');
		}

		onProgress?.(50, 'Capturing register frames...');
		const taym = await generateTaymFile(project, exportSongIndex, { modules });
		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		onProgress?.(99, 'Downloading...');
		downloadFile(new Blob([taym], { type: 'application/octet-stream' }), `${sanitizedFilename}.taym`);
		onProgress?.(100, 'Complete!');
	} catch (error) {
		if (error instanceof Error && error.message === 'Export cancelled') {
			onProgress?.(0, 'Export cancelled');
			throw error;
		}
		console.error('Failed to export TAYM:', error);
		onProgress?.(0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}
