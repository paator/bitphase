import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import type { ChipRenderer, RenderOptions } from '../base/renderer';
import type { ResourceLoader } from '../base/resource-loader';
import { BrowserResourceLoader } from '../base/resource-loader';
import { getTotalVirtualChannelCount } from '../../models/virtual-channels';

const SAMPLE_RATE = 44100;
const DEFAULT_SPEED = 6;
const AYUMI_STRUCT_SIZE = 22928;
const AYUMI_STRUCT_LEFT_OFFSET = 22888;
const AYUMI_STRUCT_RIGHT_OFFSET = 22896;
const AYUMI_STRUCT_CHANNEL_OUT_OFFSET = 22904;
const TONE_CHANNELS = 3;
const DEFAULT_AYM_FREQUENCY = 1773400;

type PanSetting = { channel: number; pan: number; isEqp: number };
type GetPanSettingsForLayout = (layout: string) => PanSetting[];

export class AYChipRenderer implements ChipRenderer {
	private loader: ResourceLoader;

	constructor(loader?: ResourceLoader) {
		this.loader = loader ?? new BrowserResourceLoader();
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
		const ayumiPtr = wasm.malloc(AYUMI_STRUCT_SIZE);
		if (!ayumiPtr) {
			throw new Error('Failed to allocate Ayumi structure');
		}

		const isYM = song.chipType === 'ay' && song.chipVariant === 'YM' ? 1 : 0;
		wasm.ayumi_configure(ayumiPtr, isYM, chipFrequency, SAMPLE_RATE);

		const stereoLayout = (song as { stereoLayout?: string }).stereoLayout ?? 'ABC';
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
		const { default: AyumiState } = await this.loader.loadModule<{ default: new () => unknown }>(
			'ayumi-state.js'
		);
		onProgress?.(30, 'Loading pattern processor...');
		const { default: TrackerPatternProcessor } =
			await this.loader.loadModule<{ default: new (a: unknown, b: unknown, c: unknown) => unknown }>(
				'tracker-pattern-processor.js'
			);
		onProgress?.(40, 'Loading audio driver...');
		const { default: AYAudioDriver } =
			await this.loader.loadModule<{ default: new () => unknown }>('ay-audio-driver.js');
		const { default: AyumiEngine } =
			await this.loader.loadModule<{ default: new (a: unknown, b: unknown) => unknown }>(
				'ayumi-engine.js'
			);
		const { default: AYChipRegisterState } =
			await this.loader.loadModule<{ default: new () => unknown }>('ay-chip-register-state.js');
		const { default: VirtualChannelMixer } =
			await this.loader.loadModule<{ default: new () => unknown }>('virtual-channel-mixer.js');

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
		const chipFrequency = song.chipFrequency || DEFAULT_AYM_FREQUENCY;
		const interruptFrequency = song.interruptFrequency || 50;
		state.setWasmModule(wasm, ayumiPtr, wasmBuffer);
		state.setAymFrequency(chipFrequency);
		state.setIntFrequency(interruptFrequency, SAMPLE_RATE);
		state.setTuningTable(song.tuningTable);
		state.setInstruments(project.instruments);
		state.setTables(project.tables);
		state.setPatternOrder(project.patternOrder || [0], project.loopPointId || 0);
		state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
		state.updateSamplesPerTick(SAMPLE_RATE);
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
		for (let i = 0; i < state.currentPatternOrderIndex; i++) {
			const patternId = state.patternOrder[i];
			const pattern = song.patterns.find((p: Pattern) => p.id === patternId);
			if (pattern) {
				currentRow += pattern.length;
			}
		}
		if (state.currentPattern) {
			currentRow += state.currentRow;
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

			state.tickAccumulator += state.tickStep;

			if (state.tickAccumulator >= 1.0) {
				if (state.currentTick === 0 && state.currentPattern) {
					patternProcessor.parsePatternRow(
						state.currentPattern,
						state.currentRow,
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

				const isLastPattern = state.currentPatternOrderIndex >= state.patternOrder.length - 1;
				const isLastRow = state.currentRow >= state.currentPattern.length - 1;
				const isLastTick = state.currentTick >= state.currentSpeed - 1;

				if (isLastPattern && isLastRow && isLastTick) {
					completedLoops++;
					if (completedLoops >= loopCount) {
						break;
					}
				}

				const needsPatternChange = state.advancePosition();
				if (needsPatternChange) {
					if (state.currentPatternOrderIndex >= state.patternOrder.length) {
						break;
					}
					if (state.currentPatternOrderIndex < patterns.length) {
						state.currentPattern = patterns[state.currentPatternOrderIndex];
					} else {
						break;
					}
				}

				state.tickAccumulator -= 1.0;
			}

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
		const { getPanSettingsForLayout } =
			await this.loader.loadModule<{ getPanSettingsForLayout: GetPanSettingsForLayout }>(
				'ayumi-constants.js'
			);
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

		const patterns = this.getPatterns(song, patternOrder);

		if (patterns.length === 0) {
			wasm.free(ayumiPtr);
			throw new Error('No patterns found');
		}

		state.currentPattern = patterns[startOrderIndex];
		state.currentPatternOrderIndex = startOrderIndex;

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
