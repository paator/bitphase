import type { Project } from '../../../models/project';
import { EffectType } from '../../../models/song';
import { downloadFile, sanitizeFilename } from '../../../utils/file-download';
import { getTotalVirtualChannelCount } from '../../../models/virtual-channels';
import JSZip from 'jszip';
import {
	AY_REGISTER_COUNT,
	convertRegisterStateToAYRegisters,
	createDisabledTaymSampleStates,
	createTaymSampleCaptureTracker,
	suppressSidForTaymSampleChannels,
	type TaymSampleCaptureTracker,
	extractHardwareEnvFmStates,
	extractHardwareFmStates,
	extractHardwareSampleStates,
	extractHardwareTaymSampleStates,
	extractHardwareSidStates,
	extractHardwareSyncBuzzerStates,
	TONE_CHANNELS,
	type CapturedAySampleInstrument,
	type SongCaptureFrame
} from './ay-export-utils';
import { filterInstrumentsForChip } from '../../instrument/instrument-filter';

const DEFAULT_SPEED = 6;
const CAPTURE_OUTPUT_SAMPLE_RATE = 44100;

export type SongCaptureResult = {
	frames: SongCaptureFrame[];
	orderIndices: number[];
	instruments: CapturedAySampleInstrument[];
	chipFrequency: number;
	interruptFrequency: number;
	isYm: boolean;
};

export type PsgExportModules = {
	AyumiState: new (channelCount?: number, sharedTimeline?: unknown) => any;
	TrackerPatternProcessor: new (
		state: any,
		driver: any,
		port: { postMessage?: (...args: unknown[]) => void }
	) => any;
	AYAudioDriver: new (channelCount?: number) => any;
	AYChipRegisterState: new (channelCount?: number) => any;
	VirtualChannelMixer: new () => any;
	instrumentHasSample?: (instrument: any) => boolean;
	advanceSamplePosition?: (
		state: any,
		channelIndex: number,
		instrument: any,
		outputSampleRate: number,
		effectiveTone?: number
	) => { active: boolean; volume: number };
};

export type CaptureRegisterOptions = {
	captureDigiSamples?: boolean;
};

type AyCaptureTick = {
	state: any;
	patternProcessor: any;
	audioDriver: any;
	registerState: any;
	mixer: any;
	patterns: any[];
	chipFrequency: number;
	frames: SongCaptureFrame[];
	orderIndices: number[];
	taymSampleTracker: TaymSampleCaptureTracker;
	captureDigiSamples: boolean;
	samplesPerInterrupt: number;
	instrumentHasSample?: PsgExportModules['instrumentHasSample'];
	advanceSamplePosition?: PsgExportModules['advanceSamplePosition'];
};

export function encodePSG(registerFrames: number[][]): ArrayBuffer {
	const headerSize = 16;
	const data: number[] = [];

	data.push(0x50);
	data.push(0x53);
	data.push(0x47);
	data.push(0x1a);

	for (let i = 0; i < 12; i++) {
		data.push(0);
	}

	const currentRegs = new Array(AY_REGISTER_COUNT).fill(0);

	for (const frameRegs of registerFrames) {
		data.push(0xff);

		for (let reg = 0; reg < AY_REGISTER_COUNT; reg++) {
			const value = frameRegs[reg];
			if (value !== currentRegs[reg]) {
				data.push(reg);
				data.push(value);
				currentRegs[reg] = value;
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

	private rowHasPortamentoCommand(row: any): boolean {
		return (
			row?.effects?.some((effect: any) => effect?.effect === EffectType.Portamento) ?? false
		);
	}

	private readSampleRestartFlags(state: any): boolean[] {
		const flags = new Array(TONE_CHANNELS).fill(false);
		if (state.timeline.currentTick !== 0 || !state.currentPattern) {
			return flags;
		}
		const rowIndex = state.timeline.currentRow;
		const channels = state.currentPattern.channels ?? [];
		for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
			const row = channels[channelIndex]?.rows?.[rowIndex];
			if (
				row &&
				row.note &&
				row.note.name >= 2 &&
				!this.rowHasPortamentoCommand(row) &&
				!state.channelPortamentoActive?.[channelIndex]
			) {
				flags[channelIndex] = true;
			}
		}
		return flags;
	}

	private pushCaptureFrame(tick: AyCaptureTick): void {
		const {
			state,
			patternProcessor,
			audioDriver,
			registerState,
			mixer,
			chipFrequency,
			frames,
			orderIndices,
			taymSampleTracker,
			captureDigiSamples,
			samplesPerInterrupt,
			instrumentHasSample,
			advanceSamplePosition
		} = tick;

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
		const sampleRestartFlags = this.readSampleRestartFlags(state);
		patternProcessor.processSlides();

		const stateToConvert = mixer.hasVirtualChannels()
			? mixer.merge(registerState, state)
			: registerState;
		const ayRegisters = convertRegisterStateToAYRegisters(stateToConvert);
		const sample = captureDigiSamples
			? extractHardwareSampleStates(
					state,
					(channelIndex) => audioDriver.getEffectiveTone(state, channelIndex),
					(channelIndex) =>
						mixer.hasVirtualChannels()
							? mixer.getHardwareChannelIndex(channelIndex)
							: channelIndex
				)
			: Array.from({ length: TONE_CHANNELS }, (_, hardwareChannelIndex) => ({
					enabled: false,
					hardwareChannelIndex,
					instrumentIndex: -1,
					position: 0,
					phase: 0,
					effectiveTone: 0
				}));
		const samples =
			captureDigiSamples && !mixer.hasVirtualChannels()
				? extractHardwareTaymSampleStates(
						state,
						registerState,
						taymSampleTracker,
						chipFrequency,
						sampleRestartFlags
					)
				: createDisabledTaymSampleStates();
		const sid = extractHardwareSidStates(stateToConvert);
		if (captureDigiSamples) {
			suppressSidForTaymSampleChannels(sid, samples);
		}
		frames.push({
			registers: [...ayRegisters],
			sid,
			syncbuzzer: extractHardwareSyncBuzzerStates(stateToConvert),
			fm: extractHardwareFmStates(stateToConvert),
			envFm: extractHardwareEnvFmStates(stateToConvert),
			sample,
			samples
		});
		orderIndices.push(state.timeline.currentPatternOrderIndex);
		if (mixer.hasVirtualChannels()) {
			registerState.forceEnvelopeShapeWrite = false;
		}

		if (captureDigiSamples && instrumentHasSample && advanceSamplePosition) {
			for (
				let channelIndex = 0;
				channelIndex < state.channelInstruments.length;
				channelIndex++
			) {
				if (state.channelMuted?.[channelIndex]) continue;
				if (!state.channelSoundEnabled?.[channelIndex]) continue;
				const instrumentIndex = state.channelInstruments[channelIndex];
				const instrument = instrumentIndex >= 0 ? state.instruments[instrumentIndex] : null;
				if (!instrumentHasSample(instrument)) continue;
				const effectiveTone = audioDriver.getEffectiveTone(state, channelIndex);
				if (effectiveTone <= 0) continue;
				for (let sampleIndex = 0; sampleIndex < samplesPerInterrupt; sampleIndex++) {
					const playback = advanceSamplePosition(
						state,
						channelIndex,
						instrument,
						CAPTURE_OUTPUT_SAMPLE_RATE,
						effectiveTone
					);
					if (!playback.active) {
						state.channelSoundEnabled[channelIndex] = false;
						break;
					}
				}
			}
		}
	}

	private async captureTicks(
		ticks: AyCaptureTick[],
		song: { patterns: Array<{ id: number; length: number }> },
		totalRows: number,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal
	): Promise<void> {
		const leader = ticks[0]!;
		const timeline = leader.state.timeline;
		let totalTicks = 0;
		const maxTicks = 1000000;
		let lastProgressUpdate = 0;
		let lastProgressTime = Date.now();

		onProgress?.(50, 'Capturing register states...');

		while (totalTicks < maxTicks) {
			if (abortSignal?.aborted) {
				throw new Error('Export cancelled');
			}

			const now = Date.now();
			if (
				(totalTicks - lastProgressUpdate >= 1000 || now - lastProgressTime >= 100) &&
				totalTicks > 0
			) {
				let currentRow = 0;
				for (let i = 0; i < timeline.currentPatternOrderIndex; i++) {
					const patternId = timeline.patternOrder[i];
					const pattern = song.patterns.find((entry) => entry.id === patternId);
					if (pattern) {
						currentRow += pattern.length;
					}
				}
				if (leader.state.currentPattern) {
					currentRow += timeline.currentRow;
				}
				onProgress?.(
					50 + (currentRow / totalRows) * 50,
					`Capturing... ${currentRow}/${totalRows} rows`
				);
				lastProgressUpdate = totalTicks;
				lastProgressTime = now;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			for (const tick of ticks) {
				this.pushCaptureFrame(tick);
			}

			const singleChip = ticks.length === 1;
			const leaderLen = singleChip
				? leader.state.currentPattern.length
				: this.leaderPatternRowCount(ticks);
			const isLastPattern =
				timeline.currentPatternOrderIndex >= timeline.patternOrder.length - 1;
			const isLastRow = timeline.currentRow >= leaderLen - 1;
			const isLastTick = timeline.isLastFrameOfRow();
			if (isLastPattern && isLastRow && isLastTick) {
				break;
			}

			const needsPatternChange = singleChip
				? leader.state.advancePosition()
				: leader.state.advancePosition(leaderLen);
			if (needsPatternChange) {
				if (timeline.currentPatternOrderIndex >= timeline.patternOrder.length) {
					break;
				}
				let missingPattern = false;
				for (const tick of ticks) {
					if (timeline.currentPatternOrderIndex < tick.patterns.length) {
						tick.state.currentPattern =
							tick.patterns[timeline.currentPatternOrderIndex];
					} else if (singleChip) {
						missingPattern = true;
					}
				}
				if (missingPattern) {
					break;
				}
			}

			totalTicks++;
		}
	}

	async captureSongFrames(
		project: Project,
		songIndex: number,
		modules: PsgExportModules,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal,
		captureOptions: CaptureRegisterOptions = {}
	): Promise<SongCaptureResult> {
		const created = this.createSharedCaptureTick(
			project,
			songIndex,
			modules,
			captureOptions,
			null,
			true
		);
		const song = project.songs[songIndex]!;
		const totalRows = this.calculateTotalRows(song, project.patternOrder || [0]);
		await this.captureTicks([created.tick], song, totalRows, onProgress, abortSignal);
		return created.result;
	}

	private createSharedCaptureTick(
		project: Project,
		songIndex: number,
		modules: PsgExportModules,
		captureOptions: CaptureRegisterOptions,
		sharedTimeline: unknown | null,
		ownsTimeline: boolean
	): { tick: AyCaptureTick; result: SongCaptureResult; timeline: unknown } {
		const song = project.songs[songIndex];
		if (!song || song.patterns.length === 0) {
			throw new Error('Song is empty');
		}

		const chipFrequency = song.chipFrequency ?? 1773400;
		const interruptFrequency = song.interruptFrequency ?? 50;
		const isYm =
			Boolean((song as { stMixing?: boolean }).stMixing) ||
			song.chipVariant === 'YM' ||
			chipFrequency >= 2000000;

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

		const filteredInstruments = filterInstrumentsForChip(
			project.instruments,
			song.chipType ?? 'ay'
		);
		const state = sharedTimeline
			? new AyumiState(totalChannelCount, sharedTimeline)
			: new AyumiState(totalChannelCount);
		const timeline = state.timeline;

		state.setTuningTable(song.tuningTable);
		state.setInstruments(filteredInstruments);
		state.setTables(project.tables);
		if (ownsTimeline) {
			state.setPatternOrder(project.patternOrder || [0]);
			state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
			state.setTempo(song.tempo ?? 0);
			if (song.interruptFrequency) {
				timeline.intFrequency = song.interruptFrequency;
			}
		}
		if (typeof state.setChipVariant === 'function') {
			state.setChipVariant(isYm ? 'YM' : 'AY');
		}
		if (typeof state.setAymFrequency === 'function') {
			state.setAymFrequency(chipFrequency);
		} else if (state.aymFrequency !== undefined) {
			state.aymFrequency = chipFrequency;
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

		if (ownsTimeline) {
			state.currentPattern = patterns[0];
			timeline.currentPatternOrderIndex = 0;
		} else {
			const index = Math.min(
				Math.max(0, timeline.currentPatternOrderIndex | 0),
				Math.max(0, patterns.length - 1)
			);
			state.currentPattern = patterns[index];
		}

		const frames: SongCaptureFrame[] = [];
		const orderIndices: number[] = [];
		const tick: AyCaptureTick = {
			state,
			patternProcessor,
			audioDriver,
			registerState,
			mixer,
			patterns,
			chipFrequency,
			frames,
			orderIndices,
			taymSampleTracker: createTaymSampleCaptureTracker(),
			captureDigiSamples: captureOptions.captureDigiSamples === true,
			samplesPerInterrupt: Math.max(
				1,
				Math.round(CAPTURE_OUTPUT_SAMPLE_RATE / interruptFrequency)
			),
			instrumentHasSample: modules.instrumentHasSample,
			advanceSamplePosition: modules.advanceSamplePosition
		};

		return {
			tick,
			timeline,
			result: {
				frames,
				orderIndices,
				instruments: filteredInstruments as CapturedAySampleInstrument[],
				chipFrequency,
				interruptFrequency,
				isYm
			}
		};
	}

	private leaderPatternRowCount(ticks: AyCaptureTick[]): number {
		const primary = ticks[0]?.state.currentPattern?.length ?? 0;
		if (primary > 0) return primary;
		for (const tick of ticks) {
			const length = tick.state.currentPattern?.length ?? 0;
			if (length > 0) return length;
		}
		return 1;
	}

	async captureSharedAySongs(
		project: Project,
		songIndices: number[],
		modules: PsgExportModules,
		onProgress?: (progress: number, message: string) => void,
		abortSignal?: AbortSignal,
		captureOptions: CaptureRegisterOptions = {}
	): Promise<SongCaptureResult[]> {
		if (songIndices.length === 0) {
			throw new Error('No AY songs to export');
		}

		const interruptFrequency = project.songs[songIndices[0]!]?.interruptFrequency ?? 50;
		for (const songIndex of songIndices) {
			const song = project.songs[songIndex];
			if (!song || song.patterns.length === 0) {
				throw new Error('Song is empty');
			}
			if ((song.interruptFrequency ?? 50) !== interruptFrequency) {
				throw new Error(
					'PSG export requires all AY songs to use the same interrupt frequency'
				);
			}
		}

		const patternOrder = project.patternOrder || [0];
		const created: Array<{ tick: AyCaptureTick; result: SongCaptureResult }> = [];
		let sharedTimeline: unknown | null = null;
		for (const songIndex of songIndices) {
			const ownsTimeline = sharedTimeline == null;
			const entry = this.createSharedCaptureTick(
				project,
				songIndex,
				modules,
				captureOptions,
				sharedTimeline,
				ownsTimeline
			);
			if (ownsTimeline) {
				sharedTimeline = entry.timeline;
			}
			created.push({ tick: entry.tick, result: entry.result });
		}

		const ticks = created.map((entry) => entry.tick);
		const leaderSong = project.songs[songIndices[0]!]!;
		const totalRows = Math.max(1, this.calculateTotalRows(leaderSong, patternOrder));
		await this.captureTicks(ticks, leaderSong, totalRows, onProgress, abortSignal);
		return created.map((entry) => entry.result);
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
		const { modules } = await loadPsgExportModules();

		try {
			const filename = project.name || 'export';
			const sanitizedFilename = sanitizeFilename(filename);
			const aySongIndices = this.getAYSongIndices(project);

			if (aySongIndices.length > 1) {
				const zip = new JSZip();
				onProgress?.(20, `Generating ${aySongIndices.length} PSGs...`);
				const captures = await this.captureSharedAySongs(
					project,
					aySongIndices,
					modules,
					onProgress,
					abortSignal
				);
				for (let i = 0; i < captures.length; i++) {
					zip.file(
						`${sanitizedFilename}_ay${i + 1}.psg`,
						encodePSG(captures[i]!.frames.map((frame) => frame.registers))
					);
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
	onProgress?: (progress: number, message: string) => void;
	abortSignal?: AbortSignal;
	captureDigiSamples?: boolean;
}

async function loadPsgExportModules(
	options?: GenerateCaptureOptions
): Promise<{ modules: PsgExportModules; captureDigiSamples: boolean }> {
	const captureDigiSamples = options?.captureDigiSamples === true;
	let modules = options?.modules;
	if (!modules) {
		const baseUrl = import.meta.env.BASE_URL;
		const { default: AyumiState } = await import(`${baseUrl}ay/ayumi-state.js`);
		const { default: TrackerPatternProcessor } = await import(
			`${baseUrl}tracker/tracker-pattern-processor.js`
		);
		const { default: AYAudioDriver } = await import(`${baseUrl}ay/ay-audio-driver.js`);
		const { default: AYChipRegisterState } = await import(
			`${baseUrl}ay/ay-chip-register-state.js`
		);
		const { default: VirtualChannelMixer } = await import(
			`${baseUrl}ay/virtual-channel-mixer.js`
		);
		modules = {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AYChipRegisterState,
			VirtualChannelMixer
		};
	}
	if (captureDigiSamples && (!modules.instrumentHasSample || !modules.advanceSamplePosition)) {
		const baseUrl = import.meta.env.BASE_URL;
		const samplePlayback = await import(`${baseUrl}ay/ay-sample-playback.js`);
		modules = {
			...modules,
			instrumentHasSample: samplePlayback.instrumentHasSample,
			advanceSamplePosition: samplePlayback.advanceSamplePosition
		};
	}
	return { modules, captureDigiSamples };
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

	const { modules, captureDigiSamples } = await loadPsgExportModules(options);
	return psgExportService.captureSongFrames(
		project,
		songIndex,
		modules,
		options?.onProgress,
		options?.abortSignal,
		{ captureDigiSamples }
	);
}

export async function generatePSGBuffer(
	project: Project,
	songIndex: number = 0,
	options?: GeneratePSGBufferOptions
): Promise<ArrayBuffer> {
	const capture = await captureSongRegisterFrames(project, songIndex, options);
	return encodePSG(capture.frames.map((frame) => frame.registers));
}

export async function generateSharedPSGBuffers(
	project: Project,
	songIndices: number[],
	options?: GenerateCaptureOptions
): Promise<ArrayBuffer[]> {
	if (songIndices.length <= 1) {
		const songIndex = songIndices[0] ?? 0;
		return [await generatePSGBuffer(project, songIndex, options)];
	}

	const { modules, captureDigiSamples } = await loadPsgExportModules(options);
	const captures = await psgExportService.captureSharedAySongs(
		project,
		songIndices,
		modules,
		options?.onProgress,
		options?.abortSignal,
		{ captureDigiSamples }
	);
	return captures.map((capture) => encodePSG(capture.frames.map((frame) => frame.registers)));
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
