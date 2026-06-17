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
import { AYUMI_AUDIO_SLOT_KIND } from './audio-slot-kind';
import type { ResourceLoader } from '../base/resource-loader';
import { BrowserResourceLoader } from '../base/resource-loader';
import { getTotalVirtualChannelCount } from '../../models/virtual-channels';
import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
import {
	AYUMI_STRUCT_SIZE,
	AYUMI_STRUCT_LEFT_OFFSET,
	AYUMI_STRUCT_RIGHT_OFFSET,
	AYUMI_STRUCT_CHANNEL_OUT_OFFSET,
	DEFAULT_AYM_FREQUENCY
} from './ayumi-constants';

const SAMPLE_RATE = 44100;
const DEFAULT_SPEED = 6;
const TONE_CHANNELS = 3;

type PanSetting = { channel: number; pan: number; isEqp: number };
type GetPanSettingsForLayout = (layout: string) => PanSetting[];

type AyumiSlotLane = {
	songIndex: number;
	song: any;
	state: any;
	patternProcessor: any;
	audioDriver: any;
	ayumiEngine: any;
	registerState: any;
	mixer: any;
	ayumiPtr: number;
	patterns: Pattern[];
};

export class AYChipRenderer implements ChipRenderer {
	private loader: ResourceLoader;
	private readonly binding: ChipRendererBinding;

	constructor(loader?: ResourceLoader, binding?: ChipRendererBinding) {
		this.loader = loader ?? new BrowserResourceLoader();
		this.binding = binding ?? {
			chipType: 'ay',
			audioSlotKind: AYUMI_AUDIO_SLOT_KIND
		};
	}

	private async loadWasmModule(
		onProgress?: (progress: number, message: string) => void
	): Promise<{ wasm: any; wasmBuffer: ArrayBuffer }> {
		onProgress?.(0, 'Loading WASM module...');
		const wasmBuffer = await this.loader.loadWasm('ayumi.wasm');

		onProgress?.(10, 'Instantiating WASM...');
		const result = await WebAssembly.instantiate(wasmBuffer, {
			env: { emscripten_notify_memory_growth: () => {} }
		});

		return { wasm: result.instance.exports as any, wasmBuffer };
	}

	private initializeAyumi(
		wasm: any,
		song: any,
		getPanSettingsForLayout: GetPanSettingsForLayout
	): number {
		const chipFrequency = song.chipFrequency || DEFAULT_AYM_FREQUENCY;
		const structSize =
			typeof wasm.ayumi_struct_size === 'function'
				? wasm.ayumi_struct_size()
				: AYUMI_STRUCT_SIZE;
		const ayumiPtr = wasm.malloc(structSize);
		if (!ayumiPtr) {
			throw new Error('Failed to allocate Ayumi structure');
		}

		const isYM =
			song.chipType === 'ay' &&
			(song.chipVariant === 'YM' || Boolean((song as { stMixing?: boolean }).stMixing))
				? 1
				: 0;
		const stMixing = Boolean((song as { stMixing?: boolean }).stMixing);
		const isST = song.chipType === 'ay' && stMixing ? 1 : 0;
		wasm.ayumi_configure(ayumiPtr, isYM, chipFrequency, SAMPLE_RATE, isST);

		const stereoLayout = stMixing
			? 'mono'
			: ((song as { stereoLayout?: string }).stereoLayout ?? 'ABC');
		const panSettings = getPanSettingsForLayout(stereoLayout);
		panSettings.forEach(({ channel, pan, isEqp }) => {
			wasm.ayumi_set_pan(ayumiPtr, channel, pan, isEqp);
		});

		return ayumiPtr;
	}

	private async loadProcessorModules(
		onProgress?: (progress: number, message: string) => void
	): Promise<{
		AyumiState: any;
		TrackerPatternProcessor: any;
		AYAudioDriver: any;
		AyumiEngine: any;
		AYChipRegisterState: any;
		VirtualChannelMixer: any;
	}> {
		onProgress?.(20, 'Loading processor modules...');
		const { default: AyumiState } = await this.loader.loadModule<{
			default: new () => unknown;
		}>('ayumi-state.js');
		onProgress?.(30, 'Loading pattern processor...');
		const { default: TrackerPatternProcessor } = await this.loader.loadModule<{
			default: new (a: unknown, b: unknown, c: unknown) => unknown;
		}>('tracker-pattern-processor.js');
		onProgress?.(40, 'Loading audio driver...');
		const { default: AYAudioDriver } = await this.loader.loadModule<{
			default: new () => unknown;
		}>('ay-audio-driver.js');
		const { default: AyumiEngine } = await this.loader.loadModule<{
			default: new (a: unknown, b: unknown) => unknown;
		}>('ayumi-engine.js');
		const { default: AYChipRegisterState } = await this.loader.loadModule<{
			default: new () => unknown;
		}>('ay-chip-register-state.js');
		const { default: VirtualChannelMixer } = await this.loader.loadModule<{
			default: new () => unknown;
		}>('virtual-channel-mixer.js');

		return {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AyumiEngine,
			AYChipRegisterState,
			VirtualChannelMixer
		};
	}

	private setupState(
		state: any,
		song: any,
		project: Project,
		wasm: any,
		ayumiPtr: number,
		wasmBuffer: ArrayBuffer
	): void {
		this.applyAyExportLaneSetup(state, song, project, wasm, ayumiPtr, wasmBuffer, true);
	}

	private syncExportEngineRegisterState(
		audioDriver: any,
		ayumiEngine: any,
		registerState: any,
		mixer: any,
		state: any
	): void {
		audioDriver.resetChannelMixerState();
		registerState.reset();
		ayumiEngine.reset();
		if (mixer.hasVirtualChannels()) {
			ayumiEngine.applyRegisterState(mixer.merge(registerState, state));
		} else {
			ayumiEngine.applyRegisterState(registerState);
		}
	}

	private resolveSampleAyumiChannel(
		mixer: { hasVirtualChannels?: () => boolean; getHardwareChannelIndex?: (i: number) => number },
		channelIndex: number
	): number {
		if (mixer?.hasVirtualChannels?.()) {
			return mixer.getHardwareChannelIndex?.(channelIndex) ?? channelIndex;
		}
		return channelIndex;
	}

	private applyAyExportLaneSetup(
		state: any,
		song: any,
		project: Project,
		wasm: any,
		ayumiPtr: number,
		wasmBuffer: ArrayBuffer,
		ownsSharedPlaybackTimeline: boolean
	): void {
		const chipFrequency = song.chipFrequency || DEFAULT_AYM_FREQUENCY;
		const interruptFrequency = song.interruptFrequency || 50;
		state.setWasmModule(wasm, ayumiPtr, wasmBuffer);
		state.setAymFrequency(chipFrequency);
		state.setTuningTable(song.tuningTable);
		state.setInstruments(filterInstrumentsForChip(project.instruments, song.chipType ?? 'ay'));
		state.setTables(project.tables);
		if (ownsSharedPlaybackTimeline) {
			state.setIntFrequency(interruptFrequency, SAMPLE_RATE);
			state.setPatternOrder(project.patternOrder || [0], project.loopPointId || 0);
			state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
			state.updateSamplesPerTick(SAMPLE_RATE);
		}
	}

	private getPatterns(song: any, patternOrder: number[]): Pattern[] {
		const patterns: Pattern[] = [];
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((p: Pattern) => p.id === patternId);
			if (pattern) {
				patterns.push(pattern);
			}
		}
		return patterns;
	}

	private calculateTotalRows(song: any, patternOrder: number[]): number {
		let totalRows = 0;
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((p: Pattern) => p.id === patternId);
			if (pattern) {
				totalRows += pattern.length;
			}
		}
		return totalRows;
	}

	private calculateCurrentRow(state: any, song: any): number {
		let currentRow = 0;
		for (let i = 0; i < state.timeline.currentPatternOrderIndex; i++) {
			const patternId = state.timeline.patternOrder[i];
			const pattern = song.patterns.find((p: Pattern) => p.id === patternId);
			if (pattern) {
				currentRow += pattern.length;
			}
		}
		if (state.currentPattern) {
			currentRow += state.timeline.currentRow;
		}
		return currentRow;
	}

	private async renderAudioLoop(
		state: any,
		patternProcessor: any,
		audioDriver: any,
		ayumiEngine: any,
		registerState: any,
		mixer: any,
		wasm: any,
		ayumiPtr: number,
		song: any,
		totalRows: number,
		patterns: Pattern[],
		loopCount: number,
		onProgress?: (progress: number, message: string) => void,
		separateChannels?: boolean
	): Promise<Float32Array[]> {
		const leftSamples: number[] = [];
		const rightSamples: number[] = [];
		const channelSamples: number[][] = separateChannels
			? Array.from({ length: TONE_CHANNELS }, () => [])
			: [];
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
				const currentRow = this.calculateCurrentRow(state, song);
				const message = `Rendering... ${currentRow}/${totalRows} rows`;
				onProgress?.(progress, message);
				lastProgressUpdate = totalSamples;
				lastProgressTime = now;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			state.timeline.tickAccumulator += state.timeline.tickStep;

			if (state.timeline.tickAccumulator >= 1.0) {
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

				if (mixer.hasVirtualChannels()) {
					const hwState = mixer.merge(registerState, state);
					ayumiEngine.applyRegisterState(hwState);
					registerState.forceEnvelopeShapeWrite = false;
				} else {
					ayumiEngine.applyRegisterState(registerState);
				}

				const isLastPattern =
					state.timeline.currentPatternOrderIndex >=
					state.timeline.patternOrder.length - 1;
				const isLastRow = state.timeline.currentRow >= state.currentPattern.length - 1;
				const isLastTick = state.timeline.currentTick >= state.timeline.currentSpeed - 1;

				if (isLastPattern && isLastRow && isLastTick) {
					completedLoops++;
					if (completedLoops >= loopCount) {
						break;
					}
				}

				const needsPatternChange = state.advancePosition();
				if (needsPatternChange) {
					if (
						state.timeline.currentPatternOrderIndex >=
						state.timeline.patternOrder.length
					) {
						break;
					}
					if (state.timeline.currentPatternOrderIndex < patterns.length) {
						state.currentPattern = patterns[state.timeline.currentPatternOrderIndex];
					} else {
						break;
					}
				}

				state.timeline.tickAccumulator -= 1.0;
			}

			audioDriver.updateSamplePlayback(
				state,
				registerState,
				ayumiEngine,
				SAMPLE_RATE,
				(channelIndex: number) => this.resolveSampleAyumiChannel(mixer, channelIndex)
			);
			ayumiEngine.process();
			ayumiEngine.removeDC();

			if (separateChannels) {
				for (let ch = 0; ch < TONE_CHANNELS; ch++) {
					const offset = ayumiPtr + AYUMI_STRUCT_CHANNEL_OUT_OFFSET + ch * 8;
					const value = new Float64Array(wasm.memory.buffer, offset, 1)[0];
					channelSamples[ch].push(value);
				}
			} else {
				const leftOffset = ayumiPtr + AYUMI_STRUCT_LEFT_OFFSET;
				const rightOffset = ayumiPtr + AYUMI_STRUCT_RIGHT_OFFSET;
				const leftValue = new Float64Array(wasm.memory.buffer, leftOffset, 1)[0];
				const rightValue = new Float64Array(wasm.memory.buffer, rightOffset, 1)[0];
				leftSamples.push(leftValue);
				rightSamples.push(rightValue);
			}
			totalSamples++;
		}

		if (separateChannels) {
			return channelSamples.map((s) => new Float32Array(s));
		}
		return [new Float32Array(leftSamples), new Float32Array(rightSamples)];
	}

	private leaderPatternRowCountSharedTimelineExport(contexts: AyumiSlotLane[]): number {
		const rowCount = (c: AyumiSlotLane) =>
			c.state.currentPattern != null && c.state.currentPattern.length > 0
				? c.state.currentPattern.length
				: 0;
		const n0 = rowCount(contexts[0]!);
		if (n0 > 0) return n0;
		for (const c of contexts) {
			const n = rowCount(c);
			if (n > 0) return n;
		}
		return 1;
	}

	private async renderAudioLoopAySharedTimelineExport(
		contexts: AyumiSlotLane[],
		wasm: any,
		leaderSong: any,
		totalRows: number,
		patternOrder: number[],
		loopCount: number,
		onProgress?: (progress: number, message: string) => void,
		separateChannels?: boolean
	): Promise<Float32Array[][]> {
		const leftByChip: number[][] = contexts.map(() => []);
		const rightByChip: number[][] = contexts.map(() => []);
		const chanByChip: number[][][] | null = separateChannels
			? contexts.map(() => Array.from({ length: TONE_CHANNELS }, () => [] as number[]))
			: null;

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
				const message = `Rendering... ${currentRow}/${totalRows} rows`;
				onProgress?.(progress, message);
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
				}

				for (const ctx of contexts) {
					ctx.patternProcessor.processTables();
					ctx.patternProcessor.processArpeggio();
					ctx.patternProcessor.processEffectTables();
					ctx.audioDriver.processInstruments(ctx.state, ctx.registerState);
					ctx.patternProcessor.processVibrato();
					ctx.patternProcessor.processSlides();

					if (ctx.mixer.hasVirtualChannels()) {
						const hwState = ctx.mixer.merge(ctx.registerState, ctx.state);
						ctx.ayumiEngine.applyRegisterState(hwState);
						ctx.registerState.forceEnvelopeShapeWrite = false;
					} else {
						ctx.ayumiEngine.applyRegisterState(ctx.registerState);
					}
				}

				const leaderLen = this.leaderPatternRowCountSharedTimelineExport(contexts);
				const isLastPattern = tl.currentPatternOrderIndex >= tl.patternOrder.length - 1;
				const isLastRow =
					leader.state.currentPattern != null
						? tl.currentRow >= leader.state.currentPattern.length - 1
						: false;
				const isLastTick = tl.currentTick >= tl.currentSpeed - 1;

				if (isLastPattern && isLastRow && isLastTick) {
					completedLoops++;
					if (completedLoops >= loopCount) {
						break;
					}
				}

				const needsPatternChange = leader.state.advancePosition(leaderLen);
				if (needsPatternChange) {
					if (tl.currentPatternOrderIndex >= tl.patternOrder.length) {
						break;
					}
					for (const ctx of contexts) {
						if (tl.currentPatternOrderIndex < ctx.patterns.length) {
							ctx.state.currentPattern = ctx.patterns[tl.currentPatternOrderIndex]!;
						} else {
							break;
						}
					}
				}

				tl.tickAccumulator -= 1.0;
			}

			for (const ctx of contexts) {
				ctx.audioDriver.updateSamplePlayback(
					ctx.state,
					ctx.registerState,
					ctx.ayumiEngine,
					SAMPLE_RATE,
					(channelIndex: number) => this.resolveSampleAyumiChannel(ctx.mixer, channelIndex)
				);
				ctx.ayumiEngine.process();
				ctx.ayumiEngine.removeDC();
			}

			for (let ci = 0; ci < contexts.length; ci++) {
				const ptr = contexts[ci]!.ayumiPtr;
				if (separateChannels && chanByChip) {
					for (let ch = 0; ch < TONE_CHANNELS; ch++) {
						const offset = ptr + AYUMI_STRUCT_CHANNEL_OUT_OFFSET + ch * 8;
						const value = new Float64Array(wasm.memory.buffer, offset, 1)[0];
						chanByChip[ci][ch].push(value);
					}
				} else {
					const leftOffset = ptr + AYUMI_STRUCT_LEFT_OFFSET;
					const rightOffset = ptr + AYUMI_STRUCT_RIGHT_OFFSET;
					const leftValue = new Float64Array(wasm.memory.buffer, leftOffset, 1)[0];
					const rightValue = new Float64Array(wasm.memory.buffer, rightOffset, 1)[0];
					leftByChip[ci].push(leftValue);
					rightByChip[ci].push(rightValue);
				}
			}
			totalSamples++;
		}

		return contexts.map((_, ci) =>
			separateChannels && chanByChip
				? chanByChip[ci].map((arr) => new Float32Array(arr))
				: [new Float32Array(leftByChip[ci]), new Float32Array(rightByChip[ci])]
		);
	}

	async renderSharedTimelineSlots(
		project: Project,
		slots: readonly SharedTimelineExportSlot[],
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<SharedTimelineExportResult[]> {
		assertSharedTimelineSlotsForChip(slots, this.binding);
		const songIndices = slots.map((s) => s.songIndex);

		const separateChannels = options?.separateChannels ?? false;
		const loopCount = Math.max(1, options?.loopCount ?? 1);
		const patternOrder = project.patternOrder || [0];
		const requestedStartOrderIndex = options?.startPatternOrderIndex ?? 0;
		const startOrderIndex =
			requestedStartOrderIndex >= 0 && requestedStartOrderIndex < patternOrder.length
				? requestedStartOrderIndex
				: 0;

		const { wasm, wasmBuffer } = await this.loadWasmModule(onProgress);
		const { getPanSettingsForLayout } = await this.loader.loadModule<{
			getPanSettingsForLayout: GetPanSettingsForLayout;
		}>('ayumi-constants.js');
		const {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AyumiEngine,
			AYChipRegisterState,
			VirtualChannelMixer
		} = await this.loadProcessorModules(onProgress);

		const contexts: AyumiSlotLane[] = [];
		const ptrs: number[] = [];

		try {
			for (const songIndex of songIndices) {
				const song = project.songs[songIndex];
				if (!song?.patterns?.length) {
					throw new Error('Song is empty');
				}

				const ayumiPtr = this.initializeAyumi(wasm, song, getPanSettingsForLayout);
				ptrs.push(ayumiPtr);

				const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
				const hasVirtual = Object.values(virtualChannelMap).some((c: number) => c > 1);
				const totalChannelCount = hasVirtual
					? getTotalVirtualChannelCount(TONE_CHANNELS, virtualChannelMap)
					: TONE_CHANNELS;

				const state =
					contexts.length === 0
						? new AyumiState(totalChannelCount)
						: new AyumiState(totalChannelCount, contexts[0]!.state.timeline);

				this.applyAyExportLaneSetup(
					state,
					song,
					project,
					wasm,
					ayumiPtr,
					wasmBuffer,
					contexts.length === 0
				);

				const audioDriver = new AYAudioDriver(totalChannelCount);
				const ayumiEngine = new AyumiEngine(wasm, ayumiPtr);
				const registerState = new AYChipRegisterState(totalChannelCount);
				const mixer = new VirtualChannelMixer();
				if (hasVirtual) {
					mixer.configure(virtualChannelMap, TONE_CHANNELS);
				}
				const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
					postMessage: () => {}
				});

				this.syncExportEngineRegisterState(
					audioDriver,
					ayumiEngine,
					registerState,
					mixer,
					state
				);

				const patterns = this.getPatterns(song, patternOrder);
				if (patterns.length === 0) {
					throw new Error('No patterns found');
				}

				state.currentPattern = patterns[startOrderIndex]!;
				state.timeline.currentPatternOrderIndex = startOrderIndex;
				if (contexts.length === 0) {
					state.timeline.tickAccumulator = 1.0;
				}

				contexts.push({
					songIndex,
					song,
					state,
					patternProcessor,
					audioDriver,
					ayumiEngine,
					registerState,
					mixer,
					ayumiPtr,
					patterns
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

			const buffers = await this.renderAudioLoopAySharedTimelineExport(
				contexts,
				wasm,
				leaderSong,
				totalRows,
				patternOrder,
				loopCount,
				onProgress,
				separateChannels
			);

			for (const p of ptrs) {
				wasm.free(p);
			}

			return contexts.map((ctx, i) => ({
				songIndex: ctx.songIndex,
				channels: buffers[i]!
			}));
		} catch (error) {
			for (const p of ptrs) {
				try {
					wasm.free(p);
				} catch {
					/* ignore */
				}
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

		const separateChannels = options?.separateChannels ?? false;
		const loopCount = Math.max(1, options?.loopCount ?? 1);
		const patternOrder = project.patternOrder || [0];
		const requestedStartOrderIndex = options?.startPatternOrderIndex ?? 0;
		const startOrderIndex =
			requestedStartOrderIndex >= 0 && requestedStartOrderIndex < patternOrder.length
				? requestedStartOrderIndex
				: 0;

		const { wasm, wasmBuffer } = await this.loadWasmModule(onProgress);
		const { getPanSettingsForLayout } = await this.loader.loadModule<{
			getPanSettingsForLayout: GetPanSettingsForLayout;
		}>('ayumi-constants.js');
		const ayumiPtr = this.initializeAyumi(wasm, song, getPanSettingsForLayout);
		const {
			AyumiState,
			TrackerPatternProcessor,
			AYAudioDriver,
			AyumiEngine,
			AYChipRegisterState,
			VirtualChannelMixer
		} = await this.loadProcessorModules(onProgress);

		const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
		const hasVirtual = Object.values(virtualChannelMap).some((c: number) => c > 1);
		const totalChannelCount = hasVirtual
			? getTotalVirtualChannelCount(TONE_CHANNELS, virtualChannelMap)
			: TONE_CHANNELS;

		const state = new AyumiState(totalChannelCount);
		this.setupState(state, song, project, wasm, ayumiPtr, wasmBuffer);

		const audioDriver = new AYAudioDriver(totalChannelCount);
		const ayumiEngine = new AyumiEngine(wasm, ayumiPtr);
		const registerState = new AYChipRegisterState(totalChannelCount);
		const mixer = new VirtualChannelMixer();
		if (hasVirtual) {
			mixer.configure(virtualChannelMap, TONE_CHANNELS);
		}
		const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
			postMessage: () => {}
		});

		this.syncExportEngineRegisterState(audioDriver, ayumiEngine, registerState, mixer, state);

		const patterns = this.getPatterns(song, patternOrder);

		if (patterns.length === 0) {
			wasm.free(ayumiPtr);
			throw new Error('No patterns found');
		}

		state.currentPattern = patterns[startOrderIndex];
		state.timeline.currentPatternOrderIndex = startOrderIndex;
		state.timeline.tickAccumulator = 1.0;

		onProgress?.(50, 'Initializing renderer...');
		const firstPassRows = this.calculateTotalRows(song, patternOrder);
		const validLoopPointId =
			project.loopPointId >= 0 && project.loopPointId < patternOrder.length
				? project.loopPointId
				: 0;
		const loopOrderSegment = patternOrder.slice(validLoopPointId);
		const loopSegmentRows = this.calculateTotalRows(song, loopOrderSegment);
		const totalRows =
			loopCount <= 1 ? firstPassRows : firstPassRows + loopSegmentRows * (loopCount - 1);

		try {
			const channels = await this.renderAudioLoop(
				state,
				patternProcessor,
				audioDriver,
				ayumiEngine,
				registerState,
				mixer,
				wasm,
				ayumiPtr,
				song,
				totalRows,
				patterns,
				loopCount,
				onProgress,
				separateChannels
			);

			wasm.free(ayumiPtr);
			onProgress?.(100, 'Rendering complete');
			return channels;
		} catch (error) {
			wasm.free(ayumiPtr);
			throw error;
		}
	}
}
