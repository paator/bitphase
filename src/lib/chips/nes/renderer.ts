import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import {
	assertSharedTimelineSlotsForChip,
	type ChipRenderer,
	type ChipRendererBinding,
	type RenderOptions,
	type SharedTimelineExportResult,
	type SharedTimelineExportSlot
} from '../base/renderer';
import { NES_AUDIO_SLOT_KIND } from './audio-slot-kind';
import type { ResourceLoader } from '../base/resource-loader';
import { BrowserResourceLoader } from '../base/resource-loader';
import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
import { NES_NTSC_CPU_FREQUENCY } from './schema';

const SAMPLE_RATE = 44100;
const DEFAULT_SPEED = 6;
const DEFAULT_INTERRUPT_FREQUENCY = 50;

type NesSlotLane = {
	songIndex: number;
	song: { patterns: Pattern[]; chipType?: string; chipVariant?: string; chipFrequency?: number; interruptFrequency?: number; initialSpeed?: number; tuningTable: number[] };
	state: {
		currentPattern: Pattern | null;
		timeline: {
			tickAccumulator: number;
			tickStep: number;
			currentTick: number;
			currentSpeed: number;
			currentRow: number;
			currentPatternOrderIndex: number;
			patternOrder: number[];
			loopPointId: number;
		};
		advancePosition: (leaderPatternLength?: number) => boolean;
	};
	patternProcessor: {
		parsePatternRow: (pattern: Pattern, rowIndex: number, registerState: unknown) => void;
		processSpeedTable: () => void;
		processTables: () => void;
		processArpeggio: () => void;
		processEffectTables: () => void;
		processVibrato: () => void;
		processSlides: () => void;
	};
	audioDriver: {
		processInstruments: (state: unknown, registerState: unknown) => void;
		advancePulseWidthTable: (state: unknown) => void;
		advanceSweepTable: (state: unknown) => void;
		syncSweepTableRegisterState: (state: unknown, registerState: unknown) => void;
	};
	apuEngine: {
		applyRegisterState: (registerState: unknown) => void;
		process: (sampleRate: number) => { left: number; right: number };
		setCpuFrequency: (frequency: number) => void;
		setChipVariant: (variant: string) => void;
		dispose: () => void;
	};
	registerState: unknown;
	patterns: Pattern[];
	apuPtr: number;
	dmcPtr: number;
};

export class NESChipRenderer implements ChipRenderer {
	private loader: ResourceLoader;
	private readonly binding: ChipRendererBinding;

	constructor(loader?: ResourceLoader, binding?: ChipRendererBinding) {
		this.loader = loader ?? new BrowserResourceLoader();
		this.binding = binding ?? {
			chipType: 'nes',
			audioSlotKind: NES_AUDIO_SLOT_KIND
		};
	}

	private async loadWasmModule(
		onProgress?: (progress: number, message: string) => void
	): Promise<{ wasm: Record<string, unknown>; wasmBuffer: ArrayBuffer }> {
		onProgress?.(0, 'Loading WASM module...');
		const wasmBuffer = await this.loader.loadWasm('nes/nes_apu.wasm');
		onProgress?.(10, 'Instantiating WASM...');
		const result = await WebAssembly.instantiate(wasmBuffer, {
			env: { emscripten_notify_memory_growth: () => {} }
		});
		return { wasm: result.instance.exports as Record<string, unknown>, wasmBuffer };
	}

	private async loadProcessorModules(
		onProgress?: (progress: number, message: string) => void
	): Promise<{
		NesState: new (sharedTimeline?: unknown) => NesSlotLane['state'];
		TrackerPatternProcessor: new (
			state: unknown,
			driver: unknown,
			port: { postMessage?: (...args: unknown[]) => void }
		) => NesSlotLane['patternProcessor'];
		NesAudioDriver: new () => NesSlotLane['audioDriver'];
		createNesApuEngine: (
			wasm: Record<string, unknown>
		) => { engine: NesSlotLane['apuEngine']; apuPtr: number; dmcPtr: number };
		NesChipRegisterState: new (channelCount?: number) => unknown;
	}> {
		onProgress?.(20, 'Loading processor modules...');
		const { default: NesState } = await this.loader.loadModule<{ default: new (...args: unknown[]) => unknown }>(
			'nes/nes-state.js'
		);
		onProgress?.(30, 'Loading pattern processor...');
		const { default: TrackerPatternProcessor } = await this.loader.loadModule<{
			default: new (...args: unknown[]) => unknown;
		}>('tracker/tracker-pattern-processor.js');
		onProgress?.(40, 'Loading audio driver...');
		const { default: NesAudioDriver } = await this.loader.loadModule<{
			default: new () => unknown;
		}>('nes/nes-audio-driver.js');
		const { createNesApuEngine } = await this.loader.loadModule<{
			createNesApuEngine: (wasm: Record<string, unknown>) => {
				engine: NesSlotLane['apuEngine'];
				apuPtr: number;
				dmcPtr: number;
			};
		}>('nes/nes-apu-engine.js');
		const { default: NesChipRegisterState } = await this.loader.loadModule<{
			default: new (channelCount?: number) => unknown;
		}>('nes/nes-chip-register-state.js');

		return {
			NesState: NesState as new (sharedTimeline?: unknown) => NesSlotLane['state'],
			TrackerPatternProcessor: TrackerPatternProcessor as new (
				state: unknown,
				driver: unknown,
				port: { postMessage?: (...args: unknown[]) => void }
			) => NesSlotLane['patternProcessor'],
			NesAudioDriver: NesAudioDriver as new () => NesSlotLane['audioDriver'],
			createNesApuEngine,
			NesChipRegisterState
		};
	}

	private setupExportState(
		state: NesSlotLane['state'] & {
			setWasmModule: (wasm: unknown, apuPtr: number, dmcPtr: number, wasmBuffer: ArrayBuffer) => void;
			setCpuFrequency: (frequency: number) => void;
			setChipVariant: (variant: string) => void;
			setTuningTable: (table: number[]) => void;
			setInstruments: (instruments: unknown[]) => void;
			setTables: (tables: unknown[]) => void;
			setIntFrequency: (frequency: number, sampleRate: number) => void;
			setPatternOrder: (order: number[], loopPointId: number) => void;
			setSpeed: (speed: number) => void;
			updateSamplesPerTick: (sampleRate: number) => void;
		},
		song: NesSlotLane['song'],
		project: Project,
		wasm: Record<string, unknown>,
		apuPtr: number,
		dmcPtr: number,
		wasmBuffer: ArrayBuffer,
		ownsSharedPlaybackTimeline: boolean
	): void {
		state.setWasmModule(wasm, apuPtr, dmcPtr, wasmBuffer);
		state.setCpuFrequency(song.chipFrequency ?? NES_NTSC_CPU_FREQUENCY);
		state.setChipVariant(song.chipVariant ?? 'NTSC');
		state.setTuningTable(song.tuningTable);
		state.setInstruments(filterInstrumentsForChip(project.instruments, song.chipType ?? 'nes'));
		state.setTables(project.tables);
		if (ownsSharedPlaybackTimeline) {
			state.setIntFrequency(song.interruptFrequency ?? DEFAULT_INTERRUPT_FREQUENCY, SAMPLE_RATE);
			state.setPatternOrder(project.patternOrder || [0], project.loopPointId || 0);
			state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
			state.updateSamplesPerTick(SAMPLE_RATE);
		}
	}

	private getPatterns(song: NesSlotLane['song'], patternOrder: number[]): Pattern[] {
		const patterns: Pattern[] = [];
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((p) => p.id === patternId);
			if (pattern) {
				patterns.push(pattern);
			}
		}
		return patterns;
	}

	private calculateTotalRows(song: NesSlotLane['song'], patternOrder: number[]): number {
		let totalRows = 0;
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((p) => p.id === patternId);
			if (pattern) {
				totalRows += pattern.length;
			}
		}
		return totalRows;
	}

	private calculateCurrentRow(state: NesSlotLane['state'], song: NesSlotLane['song']): number {
		let currentRow = 0;
		for (let i = 0; i < state.timeline.currentPatternOrderIndex; i++) {
			const patternId = state.timeline.patternOrder[i];
			const pattern = song.patterns.find((p) => p.id === patternId);
			if (pattern) {
				currentRow += pattern.length;
			}
		}
		if (state.currentPattern) {
			currentRow += state.timeline.currentRow;
		}
		return currentRow;
	}

	private freeWasmPointers(wasm: Record<string, unknown>, apuPtr: number, dmcPtr: number): void {
		const free = wasm.free as ((ptr: number) => void) | undefined;
		if (!free) return;
		try {
			free(apuPtr);
			free(dmcPtr);
		} catch {
			/* ignore */
		}
	}

	private async renderAudioLoop(
		lane: NesSlotLane,
		song: NesSlotLane['song'],
		totalRows: number,
		patterns: Pattern[],
		loopCount: number,
		onProgress?: (progress: number, message: string) => void
	): Promise<Float32Array[]> {
		const leftSamples: number[] = [];
		const rightSamples: number[] = [];
		let totalSamples = 0;
		const maxSamples = SAMPLE_RATE * 300 * Math.max(1, loopCount);
		let completedLoops = 0;
		let lastProgressUpdate = 0;
		const progressUpdateInterval = SAMPLE_RATE * 0.1;
		let lastProgressTime = Date.now();
		const minProgressUpdateMs = 100;

		onProgress?.(50, 'Starting render...');

		while (totalSamples < maxSamples) {
			const now = Date.now();
			if (
				(totalSamples - lastProgressUpdate >= progressUpdateInterval ||
					now - lastProgressTime >= minProgressUpdateMs) &&
				totalSamples > 0
			) {
				const renderProgress = (totalSamples / maxSamples) * 50;
				const progress = 50 + renderProgress;
				const currentRow = this.calculateCurrentRow(lane.state, song);
				onProgress?.(progress, `Rendering... ${currentRow}/${totalRows} rows`);
				lastProgressUpdate = totalSamples;
				lastProgressTime = now;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			const tl = lane.state.timeline;
			tl.tickAccumulator += tl.tickStep;

			if (tl.tickAccumulator >= 1.0) {
				if (tl.currentTick === 0 && lane.state.currentPattern) {
					lane.patternProcessor.parsePatternRow(
						lane.state.currentPattern,
						tl.currentRow,
						lane.registerState
					);
					lane.patternProcessor.processSpeedTable();
				}

				lane.patternProcessor.processTables();
				lane.patternProcessor.processArpeggio();
				lane.patternProcessor.processEffectTables();
				lane.audioDriver.processInstruments(lane.state, lane.registerState);
				lane.audioDriver.advancePulseWidthTable(lane.state);
				lane.audioDriver.advanceSweepTable(lane.state);
				lane.audioDriver.syncSweepTableRegisterState(lane.state, lane.registerState);
				lane.patternProcessor.processVibrato();
				lane.patternProcessor.processSlides();
				lane.apuEngine.applyRegisterState(lane.registerState);

				const isLastPattern =
					tl.currentPatternOrderIndex >= tl.patternOrder.length - 1;
				const isLastRow =
					lane.state.currentPattern != null &&
					tl.currentRow >= lane.state.currentPattern.length - 1;
				const isLastTick = tl.currentTick >= tl.currentSpeed - 1;

				if (isLastPattern && isLastRow && isLastTick) {
					completedLoops++;
					if (completedLoops >= loopCount) {
						break;
					}
				}

				const needsPatternChange = lane.state.advancePosition();
				if (needsPatternChange) {
					if (tl.currentPatternOrderIndex >= tl.patternOrder.length) {
						break;
					}
					if (tl.currentPatternOrderIndex < patterns.length) {
						lane.state.currentPattern = patterns[tl.currentPatternOrderIndex]!;
					} else {
						break;
					}
				}

				tl.tickAccumulator -= 1.0;
			}

			const { left, right } = lane.apuEngine.process(SAMPLE_RATE);
			leftSamples.push(left);
			rightSamples.push(right);
			totalSamples++;
		}

		return [new Float32Array(leftSamples), new Float32Array(rightSamples)];
	}

	private async renderAudioLoopSharedTimeline(
		contexts: NesSlotLane[],
		leaderSong: NesSlotLane['song'],
		totalRows: number,
		loopCount: number,
		onProgress?: (progress: number, message: string) => void
	): Promise<Float32Array[][]> {
		const leftByChip: number[][] = contexts.map(() => []);
		const rightByChip: number[][] = contexts.map(() => []);
		let totalSamples = 0;
		const maxSamples = SAMPLE_RATE * 300 * Math.max(1, loopCount);
		let completedLoops = 0;
		let lastProgressUpdate = 0;
		const progressUpdateInterval = SAMPLE_RATE * 0.1;
		let lastProgressTime = Date.now();
		const minProgressUpdateMs = 100;
		const leader = contexts[0]!;

		while (totalSamples < maxSamples) {
			const now = Date.now();
			if (
				(totalSamples - lastProgressUpdate >= progressUpdateInterval ||
					now - lastProgressTime >= minProgressUpdateMs) &&
				totalSamples > 0
			) {
				const renderProgress = (totalSamples / maxSamples) * 50;
				const progress = 50 + renderProgress;
				const currentRow = this.calculateCurrentRow(leader.state, leaderSong);
				onProgress?.(progress, `Rendering... ${currentRow}/${totalRows} rows`);
				lastProgressUpdate = totalSamples;
				lastProgressTime = now;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			const tl = leader.state.timeline;
			tl.tickAccumulator += tl.tickStep;

			if (tl.tickAccumulator >= 1.0) {
				for (const ctx of contexts) {
					if (tl.currentTick === 0 && ctx.state.currentPattern) {
						ctx.patternProcessor.parsePatternRow(
							ctx.state.currentPattern,
							tl.currentRow,
							ctx.registerState
						);
						ctx.patternProcessor.processSpeedTable();
					}
					ctx.patternProcessor.processTables();
					ctx.patternProcessor.processArpeggio();
					ctx.patternProcessor.processEffectTables();
					ctx.audioDriver.processInstruments(ctx.state, ctx.registerState);
					ctx.audioDriver.advancePulseWidthTable(ctx.state);
					ctx.audioDriver.advanceSweepTable(ctx.state);
					ctx.audioDriver.syncSweepTableRegisterState(ctx.state, ctx.registerState);
					ctx.patternProcessor.processVibrato();
					ctx.patternProcessor.processSlides();
					ctx.apuEngine.applyRegisterState(ctx.registerState);
				}

				const isLastPattern = tl.currentPatternOrderIndex >= tl.patternOrder.length - 1;
				const isLastRow =
					leader.state.currentPattern != null &&
					tl.currentRow >= leader.state.currentPattern.length - 1;
				const isLastTick = tl.currentTick >= tl.currentSpeed - 1;

				if (isLastPattern && isLastRow && isLastTick) {
					completedLoops++;
					if (completedLoops >= loopCount) {
						break;
					}
				}

				const needsPatternChange = leader.state.advancePosition();
				if (needsPatternChange) {
					if (tl.currentPatternOrderIndex >= tl.patternOrder.length) {
						break;
					}
					for (const ctx of contexts) {
						const pattern = ctx.patterns[tl.currentPatternOrderIndex];
						if (pattern) {
							ctx.state.currentPattern = pattern;
						}
					}
				}

				tl.tickAccumulator -= 1.0;
			}

			for (let ci = 0; ci < contexts.length; ci++) {
				const { left, right } = contexts[ci]!.apuEngine.process(SAMPLE_RATE);
				leftByChip[ci].push(left);
				rightByChip[ci].push(right);
			}
			totalSamples++;
		}

		return contexts.map((_, ci) => [
			new Float32Array(leftByChip[ci]),
			new Float32Array(rightByChip[ci])
		]);
	}

	async renderSharedTimelineSlots(
		project: Project,
		slots: readonly SharedTimelineExportSlot[],
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<SharedTimelineExportResult[]> {
		assertSharedTimelineSlotsForChip(slots, this.binding);
		const songIndices = slots.map((s) => s.songIndex);
		const loopCount = Math.max(1, options?.loopCount ?? 1);
		const patternOrder = project.patternOrder || [0];
		const requestedStartOrderIndex = options?.startPatternOrderIndex ?? 0;
		const startOrderIndex =
			requestedStartOrderIndex >= 0 && requestedStartOrderIndex < patternOrder.length
				? requestedStartOrderIndex
				: 0;

		const { wasm, wasmBuffer } = await this.loadWasmModule(onProgress);
		const { NesState, TrackerPatternProcessor, NesAudioDriver, createNesApuEngine, NesChipRegisterState } =
			await this.loadProcessorModules(onProgress);

		const contexts: NesSlotLane[] = [];
		const ptrPairs: Array<{ apuPtr: number; dmcPtr: number }> = [];

		try {
			for (const songIndex of songIndices) {
				const song = project.songs[songIndex];
				if (!song?.patterns?.length) {
					throw new Error('Song is empty');
				}

				const { engine, apuPtr, dmcPtr } = createNesApuEngine(wasm);
				ptrPairs.push({ apuPtr, dmcPtr });

				const state = (
					contexts.length === 0
						? new NesState()
						: new NesState(contexts[0]!.state.timeline)
				) as NesSlotLane['state'] & {
					setWasmModule: (...args: unknown[]) => void;
					setCpuFrequency: (frequency: number) => void;
					setChipVariant: (variant: string) => void;
					setTuningTable: (table: number[]) => void;
					setInstruments: (instruments: unknown[]) => void;
					setTables: (tables: unknown[]) => void;
					setIntFrequency: (frequency: number, sampleRate: number) => void;
					setPatternOrder: (order: number[], loopPointId: number) => void;
					setSpeed: (speed: number) => void;
					updateSamplesPerTick: (sampleRate: number) => void;
				};

				this.setupExportState(
					state,
					song as NesSlotLane['song'],
					project,
					wasm,
					apuPtr,
					dmcPtr,
					wasmBuffer,
					contexts.length === 0
				);

				const audioDriver = new NesAudioDriver();
				engine.setCpuFrequency(song.chipFrequency ?? NES_NTSC_CPU_FREQUENCY);
				engine.setChipVariant(song.chipVariant ?? 'NTSC');
				const registerState = new NesChipRegisterState();
				const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
					postMessage: () => {}
				});

				const patterns = this.getPatterns(song as NesSlotLane['song'], patternOrder);
				if (patterns.length === 0) {
					throw new Error('No patterns found');
				}

				state.currentPattern = patterns[startOrderIndex]!;
				state.timeline.currentPatternOrderIndex = startOrderIndex;
				if (contexts.length === 0) {
					state.timeline.tickAccumulator = 1.0;
				}

				engine.applyRegisterState(registerState);

				contexts.push({
					songIndex,
					song: song as NesSlotLane['song'],
					state,
					patternProcessor,
					audioDriver,
					apuEngine: engine,
					registerState,
					patterns,
					apuPtr,
					dmcPtr
				});
			}

			const leaderSong = contexts[0]!.song;
			const firstPassRows = this.calculateTotalRows(leaderSong, patternOrder);
			const validLoopPointId =
				project.loopPointId >= 0 && project.loopPointId < patternOrder.length
					? project.loopPointId
					: 0;
			const loopOrderSegment = patternOrder.slice(validLoopPointId);
			const loopSegmentRows = this.calculateTotalRows(leaderSong, loopOrderSegment);
			const totalRows =
				loopCount <= 1 ? firstPassRows : firstPassRows + loopSegmentRows * (loopCount - 1);

			const buffers = await this.renderAudioLoopSharedTimeline(
				contexts,
				leaderSong,
				totalRows,
				loopCount,
				onProgress
			);

			for (const ctx of contexts) {
				ctx.apuEngine.dispose();
			}
			for (const { apuPtr, dmcPtr } of ptrPairs) {
				this.freeWasmPointers(wasm, apuPtr, dmcPtr);
			}

			return contexts.map((ctx, i) => ({
				songIndex: ctx.songIndex,
				channels: buffers[i]!
			}));
		} catch (error) {
			for (const ctx of contexts) {
				try {
					ctx.apuEngine.dispose();
				} catch {
					/* ignore */
				}
			}
			for (const { apuPtr, dmcPtr } of ptrPairs) {
				this.freeWasmPointers(wasm, apuPtr, dmcPtr);
			}
			throw error;
		}
	}

	async render(
		project: Project,
		songIndex: number,
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<Float32Array[]> {
		const song = project.songs[songIndex];
		if (!song || song.patterns.length === 0) {
			throw new Error('Song is empty');
		}

		const loopCount = Math.max(1, options?.loopCount ?? 1);
		const patternOrder = project.patternOrder || [0];
		const requestedStartOrderIndex = options?.startPatternOrderIndex ?? 0;
		const startOrderIndex =
			requestedStartOrderIndex >= 0 && requestedStartOrderIndex < patternOrder.length
				? requestedStartOrderIndex
				: 0;

		const { wasm, wasmBuffer } = await this.loadWasmModule(onProgress);
		const { NesState, TrackerPatternProcessor, NesAudioDriver, createNesApuEngine, NesChipRegisterState } =
			await this.loadProcessorModules(onProgress);

		const { engine, apuPtr, dmcPtr } = createNesApuEngine(wasm);

		try {
			const state = new NesState() as NesSlotLane['state'] & {
				setWasmModule: (...args: unknown[]) => void;
				setCpuFrequency: (frequency: number) => void;
				setChipVariant: (variant: string) => void;
				setTuningTable: (table: number[]) => void;
				setInstruments: (instruments: unknown[]) => void;
				setTables: (tables: unknown[]) => void;
				setIntFrequency: (frequency: number, sampleRate: number) => void;
				setPatternOrder: (order: number[], loopPointId: number) => void;
				setSpeed: (speed: number) => void;
				updateSamplesPerTick: (sampleRate: number) => void;
			};

			this.setupExportState(
				state,
				song as NesSlotLane['song'],
				project,
				wasm,
				apuPtr,
				dmcPtr,
				wasmBuffer,
				true
			);

			const audioDriver = new NesAudioDriver();
			engine.setCpuFrequency(song.chipFrequency ?? NES_NTSC_CPU_FREQUENCY);
			engine.setChipVariant(song.chipVariant ?? 'NTSC');
			const registerState = new NesChipRegisterState();
			const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
				postMessage: () => {}
			});

			engine.applyRegisterState(registerState);

			const patterns = this.getPatterns(song as NesSlotLane['song'], patternOrder);
			if (patterns.length === 0) {
				throw new Error('No patterns found');
			}

			state.currentPattern = patterns[startOrderIndex]!;
			state.timeline.currentPatternOrderIndex = startOrderIndex;
			state.timeline.tickAccumulator = 1.0;

			onProgress?.(50, 'Initializing renderer...');
			const firstPassRows = this.calculateTotalRows(song as NesSlotLane['song'], patternOrder);
			const validLoopPointId =
				project.loopPointId >= 0 && project.loopPointId < patternOrder.length
					? project.loopPointId
					: 0;
			const loopOrderSegment = patternOrder.slice(validLoopPointId);
			const loopSegmentRows = this.calculateTotalRows(song as NesSlotLane['song'], loopOrderSegment);
			const totalRows =
				loopCount <= 1 ? firstPassRows : firstPassRows + loopSegmentRows * (loopCount - 1);

			const lane: NesSlotLane = {
				songIndex,
				song: song as NesSlotLane['song'],
				state,
				patternProcessor,
				audioDriver,
				apuEngine: engine,
				registerState,
				patterns,
				apuPtr,
				dmcPtr
			};

			const channels = await this.renderAudioLoop(
				lane,
				song as NesSlotLane['song'],
				totalRows,
				patterns,
				loopCount,
				onProgress
			);

			engine.dispose();
			this.freeWasmPointers(wasm, apuPtr, dmcPtr);
			onProgress?.(100, 'Rendering complete');
			return channels;
		} catch (error) {
			engine.dispose();
			this.freeWasmPointers(wasm, apuPtr, dmcPtr);
			throw error;
		}
	}
}
