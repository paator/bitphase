import type { Project } from '../../models/project';
import { downloadFile, sanitizeFilename } from '../../utils/file-download';
import { getTotalVirtualChannelCount } from '../../models/virtual-channels';
import JSZip from 'jszip';
import {
	convertRegisterStateToAYRegisters,
	extractHardwareEnvFmStates,
	extractHardwareFmStates,
	extractHardwareSidStates,
	extractHardwareSyncBuzzerStates,
	TONE_CHANNELS,
	type SongCaptureFrame
} from './ay-export-utils';

const DEFAULT_SPEED = 6;

export type SongCaptureResult = {
	frames: SongCaptureFrame[];
	chipFrequency: number;
	interruptFrequency: number;
	isYm: boolean;
};

export type PsgExportModules = {
	AyumiState: new (channelCount?: number) => any;
	TrackerPatternProcessor: new (
		state: any,
		driver: any,
		port: { postMessage?: (...args: unknown[]) => void }
	) => any;
	AYAudioDriver: new (channelCount?: number) => any;
	AYChipRegisterState: new (channelCount?: number) => any;
	VirtualChannelMixer: new () => any;
};

function encodePSG(registerFrames: number[][]): ArrayBuffer {
	const headerSize = 16;
	const data: number[] = [];

	data.push(0x50);
	data.push(0x53);
	data.push(0x47);
	data.push(0x1a);

	for (let i = 0; i < 12; i++) {
		data.push(0);
	}

	const currentRegs = new Array(14).fill(0);

	for (const frameRegs of registerFrames) {
		data.push(0xff);

		for (let reg = 0; reg < 14; reg++) {
			if (frameRegs[reg] !== currentRegs[reg]) {
				data.push(reg);
				data.push(frameRegs[reg]);
				currentRegs[reg] = frameRegs[reg];
			}
		}
	}

	data.push(0xfd);

	const buffer = new ArrayBuffer(headerSize + data.length);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < data.length; i++) {
		view[i] = data[i];
	}

	return buffer;
}

class PsgExportService {
	private getAYSongIndices(project: Project): number[] {
		const aySongIndices: number[] = [];
		for (let i = 0; i < project.songs.length; i++) {
			const song = project.songs[i];
			if (song && (!song.chipType || song.chipType === 'ay')) {
				aySongIndices.push(i);
			}
		}
		return aySongIndices;
	}

	private getPatterns(song: any, patternOrder: number[]): any[] {
		const patterns: any[] = [];
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((p: any) => p.id === patternId);
			if (pattern) {
				patterns.push(pattern);
			}
		}
		return patterns;
	}

	private calculateTotalRows(song: any, patternOrder: number[]): number {
		let totalRows = 0;
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((p: any) => p.id === patternId);
			if (pattern) {
				totalRows += pattern.length;
			}
		}
		return totalRows;
	}

	private async captureRegisterStates(
		state: any,
		patternProcessor: any,
		audioDriver: any,
		registerState: any,
		mixer: any,
		song: any,
		totalRows: number,
		patterns: any[],
		onProgress?: (progress: number, message: string) => void
	): Promise<SongCaptureFrame[]> {
		const captureFrames: SongCaptureFrame[] = [];
		let totalTicks = 0;
		const maxTicks = 1000000;

		let lastProgressUpdate = 0;
		const progressUpdateInterval = 1000;
		let lastProgressTime = Date.now();
		const minProgressUpdateMs = 100;

		onProgress?.(50, 'Capturing register states...');

		while (totalTicks < maxTicks) {
			const now = Date.now();
			if (
				(totalTicks - lastProgressUpdate >= progressUpdateInterval ||
					now - lastProgressTime >= minProgressUpdateMs) &&
				totalTicks > 0
			) {
				let currentRow = 0;
				for (let i = 0; i < state.timeline.currentPatternOrderIndex; i++) {
					const patternId = state.timeline.patternOrder[i];
					const pattern = song.patterns.find((p: any) => p.id === patternId);
					if (pattern) {
						currentRow += pattern.length;
					}
				}
				if (state.currentPattern) {
					currentRow += state.timeline.currentRow;
				}
				const captureProgress = (currentRow / totalRows) * 50;
				const progress = 50 + captureProgress;
				const message = `Capturing... ${currentRow}/${totalRows} rows`;
				onProgress?.(progress, message);
				lastProgressUpdate = totalTicks;
				lastProgressTime = now;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			if (state.timeline.currentTick === 0 && state.currentPattern) {
				patternProcessor.parsePatternRow(
					state.currentPattern,
					state.timeline.currentRow,
					registerState
				);
				patternProcessor.processSpeedTable();
			}

			patternProcessor.processTables();
			patternProcessor.processArpeggio();
			patternProcessor.processEffectTables();
			audioDriver.processInstruments(state, registerState);
			patternProcessor.processVibrato();
			patternProcessor.processSlides();

			const stateToConvert = mixer.hasVirtualChannels()
				? mixer.merge(registerState, state)
				: registerState;
			const ayRegisters = convertRegisterStateToAYRegisters(stateToConvert);
			captureFrames.push({
				registers: [...ayRegisters],
				sid: extractHardwareSidStates(stateToConvert),
				syncbuzzer: extractHardwareSyncBuzzerStates(stateToConvert),
				fm: extractHardwareFmStates(stateToConvert),
				envFm: extractHardwareEnvFmStates(stateToConvert)
			});
			if (mixer.hasVirtualChannels()) {
				registerState.forceEnvelopeShapeWrite = false;
			}

			const isLastPattern = state.timeline.currentPatternOrderIndex >= state.timeline.patternOrder.length - 1;
			const isLastRow = state.timeline.currentRow >= state.currentPattern.length - 1;
			const isLastTick = state.timeline.currentTick >= state.timeline.currentSpeed - 1;

			if (isLastPattern && isLastRow && isLastTick) {
				break;
			}

			const needsPatternChange = state.advancePosition();
			if (needsPatternChange) {
				if (state.timeline.currentPatternOrderIndex >= state.timeline.patternOrder.length) {
					break;
				}
				if (state.timeline.currentPatternOrderIndex < patterns.length) {
					state.currentPattern = patterns[state.timeline.currentPatternOrderIndex];
				} else {
					break;
				}
			}

			totalTicks++;
		}

		return captureFrames;
	}

	async captureSongFrames(
		project: Project,
		songIndex: number,
		modules: PsgExportModules,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal
	): Promise<SongCaptureResult> {
		const song = project.songs[songIndex];
		if (!song || song.patterns.length === 0) {
			throw new Error('Song is empty');
		}

		const chipFrequency = song.chipFrequency ?? 1773400;
		const interruptFrequency = song.interruptFrequency ?? 50;
		const isYm = chipFrequency >= 2000000;

		const {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AYChipRegisterState,
			VirtualChannelMixer
		} = modules;
		const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
		const hasVirtual = Object.values(virtualChannelMap).some((c: number) => c > 1);
		const totalChannelCount = hasVirtual
			? getTotalVirtualChannelCount(TONE_CHANNELS, virtualChannelMap)
			: TONE_CHANNELS;

		const state = new AyumiState(totalChannelCount);
		state.setTuningTable(song.tuningTable);
		state.setInstruments(project.instruments);
		state.setTables(project.tables);
		state.setPatternOrder(project.patternOrder || [0]);
		state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
		if (song.interruptFrequency) {
			state.timeline.intFrequency = song.interruptFrequency;
		}

		const audioDriver = new AYAudioDriver(totalChannelCount);
		const registerState = new AYChipRegisterState(totalChannelCount);
		const mixer = new VirtualChannelMixer();
		if (hasVirtual) {
			mixer.configure(virtualChannelMap, TONE_CHANNELS);
		}
		const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
			postMessage: () => {}
		});

		const patternOrder = project.patternOrder || [0];
		const patterns = this.getPatterns(song, patternOrder);

		if (patterns.length === 0) {
			throw new Error('No patterns found');
		}

		state.currentPattern = patterns[0];
		state.timeline.currentPatternOrderIndex = 0;

		const totalRows = this.calculateTotalRows(song, patternOrder);
		const frames = await this.captureRegisterStates(
			state,
			patternProcessor,
			audioDriver,
			registerState,
			mixer,
			song,
			totalRows,
			patterns,
			onProgress
		);

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		return {
			frames,
			chipFrequency,
			interruptFrequency,
			isYm
		};
	}

	async runCaptureWithModules(
		project: Project,
		songIndex: number,
		modules: PsgExportModules,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal
	): Promise<ArrayBuffer> {
		const capture = await this.captureSongFrames(
			project,
			songIndex,
			modules,
			onProgress,
			abortSignal
		);
		return encodePSG(capture.frames.map((frame) => frame.registers));
	}

	async export(
		project: Project,
		songIndex: number = 0,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal
	): Promise<void> {
		onProgress?.(0, 'Preparing PSG export...');

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		const song = project.songs[songIndex];
		if (!song || song.patterns.length === 0) {
			throw new Error('Song is empty');
		}

		onProgress?.(10, 'Loading processor modules...');
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

		const modules: PsgExportModules = {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AYChipRegisterState,
			VirtualChannelMixer
		};

		try {
			const filename = project.name || 'export';
			const sanitizedFilename = sanitizeFilename(filename);
			const aySongIndices = this.getAYSongIndices(project);

			if (aySongIndices.length > 1) {
				const zip = new JSZip();
				for (let i = 0; i < aySongIndices.length; i++) {
					if (abortSignal?.aborted) {
						throw new Error('Export cancelled');
					}
					const currentSongIndex = aySongIndices[i]!;
					const startProgress = 10 + (i / aySongIndices.length) * 80;
					onProgress?.(
						startProgress,
						`Generating PSG ${i + 1}/${aySongIndices.length}...`
					);
					const songBuffer = await this.runCaptureWithModules(
						project,
						currentSongIndex,
						modules,
						(progressValue, messageValue) => {
							const mappedProgress =
								startProgress + (progressValue / 100) * (80 / aySongIndices.length);
							onProgress?.(
								mappedProgress,
								`PSG ${i + 1}/${aySongIndices.length}: ${messageValue}`
							);
						},
						abortSignal
					);
					zip.file(`${sanitizedFilename}_ay${i + 1}.psg`, songBuffer);
				}

				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}

				onProgress?.(95, 'Creating ZIP archive...');
				const zipBlob = await zip.generateAsync({ type: 'blob' });

				if (abortSignal?.aborted) {
					throw new Error('Export cancelled');
				}

				onProgress?.(99, 'Downloading...');
				downloadFile(zipBlob, `${sanitizedFilename}.zip`);
				onProgress?.(100, 'Complete!');
				return;
			}

			onProgress?.(50, 'Initializing capture...');
			const psgBuffer = await this.runCaptureWithModules(
				project,
				songIndex,
				modules,
				onProgress,
				abortSignal
			);

			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}

			onProgress?.(95, 'Encoding PSG file...');
			const blob = new Blob([psgBuffer], { type: 'application/octet-stream' });

			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}

			onProgress?.(99, 'Downloading...');
			downloadFile(blob, `${sanitizedFilename}.psg`);
			onProgress?.(100, 'Complete!');
		} catch (error) {
			throw error;
		}
	}
}

const psgExportService = new PsgExportService();

interface GeneratePSGBufferOptions {
	modules?: PsgExportModules;
}

export interface GenerateCaptureOptions {
	modules?: PsgExportModules;
}

export async function captureSongRegisterFrames(
	project: Project,
	songIndex: number = 0,
	options?: GenerateCaptureOptions
): Promise<SongCaptureResult> {
	const song = project.songs[songIndex];
	if (!song || song.patterns.length === 0) {
		throw new Error('Song is empty');
	}

	let modules: PsgExportModules;
	if (options?.modules) {
		modules = options.modules;
	} else {
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
		modules = {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AYChipRegisterState,
			VirtualChannelMixer
		};
	}

	return psgExportService.captureSongFrames(project, songIndex, modules);
}

export async function generatePSGBuffer(
	project: Project,
	songIndex: number = 0,
	options?: GeneratePSGBufferOptions
): Promise<ArrayBuffer> {
	const capture = await captureSongRegisterFrames(project, songIndex, options);
	return encodePSG(capture.frames.map((frame) => frame.registers));
}

export async function exportToPSG(
	project: Project,
	songIndex: number = 0,
	onProgress?: (progress: number, message: string) => void,
	abortSignal?: AbortSignal
): Promise<void> {
	try {
		await psgExportService.export(project, songIndex, onProgress, abortSignal);
	} catch (error) {
		if (error instanceof Error && error.message === 'Export cancelled') {
			onProgress?.(0, 'Export cancelled');
			throw error;
		}
		console.error('Failed to export PSG:', error);
		onProgress?.(0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}
