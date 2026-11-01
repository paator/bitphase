import type { Project } from '../../models/project';
import type { Pattern, Song } from '../../models/song';
import {
	assertSharedTimelineSlotsForChip,
	type ChipRenderer,
	type ChipRendererBinding,
	type RenderOptions,
	type SharedTimelineExportBuildSession,
	type SharedTimelineExportResult,
	type SharedTimelineExportSlot
} from '../base/renderer';
import { SAA_AUDIO_SLOT_KIND } from './audio-slot-kind';
import type { ResourceLoader } from '../base/resource-loader';
import { BrowserResourceLoader } from '../base/resource-loader';
import { filterInstrumentsForChip } from '../../services/instrument/instrument-filter';
import { resolveSaaTuningTable } from './schema';
import { createSaaSharedTimelineExportLane } from './shared-timeline-export-lane';
import {
	renderOfflineSharedTimeline,
	type OfflineSharedTimeline
} from '../../services/file/wav/offline-shared-timeline-render';

const SAMPLE_RATE = 44100;
const DEFAULT_SPEED = 3;
const DEFAULT_INTERRUPT_FREQUENCY = 50;

type SaaWasmExports = Record<string, WebAssembly.ExportValue>;

export type SaaExportState = {
	currentPattern: Pattern | null;
	setWasmModule: (wasm: unknown, chipPtr: number, wasmBuffer: ArrayBuffer) => void;
	setClockRate: (clockRate: number) => void;
	setTuningTable: (table: number[]) => void;
	setInstruments: (instruments: unknown[]) => void;
	setTables: (tables: unknown[]) => void;
	setIntFrequency: (frequency: number, sampleRate: number) => void;
	setPatternOrder: (order: number[], loopPointId: number) => void;
	setSpeed: (speed: number) => void;
	setTempo: (tempo: number) => void;
	updateSamplesPerTick: (sampleRate: number) => void;
	timeline: OfflineSharedTimeline;
};

export type SaaExportEngine = {
	chipPtr: number;
	apply: (registerState: unknown) => void;
	generate: () => {
		left: number;
		right: number;
		exportChannels: ArrayLike<number>;
	};
	dispose: () => void;
};

export type SaaProcessorModules = {
	SaaState: new (sharedTimeline?: unknown) => SaaExportState;
	SaaAudioDriver: new () => unknown;
	SaaRegisterState: new (channelCount?: number) => unknown;
	TrackerPatternProcessor: new (
		state: unknown,
		driver: unknown,
		port: { postMessage: () => void }
	) => {
		parsePatternRow: (pattern: Pattern, rowIndex: number, registerState: unknown) => void;
		processSpeedTable: () => void;
		processTrackerTick: (registerState: unknown) => void;
	};
	createSaaSoundEngine: (
		wasm: SaaWasmExports,
		clockRate: number,
		sampleRate: number
	) => SaaExportEngine;
	saaPeriodFromCode: (code: number) => number;
};

export class SAAChipRenderer implements ChipRenderer {
	private loader: ResourceLoader;
	private readonly binding: ChipRendererBinding;

	constructor(loader?: ResourceLoader, binding?: ChipRendererBinding) {
		this.loader = loader ?? new BrowserResourceLoader();
		this.binding = binding ?? {
			chipType: 'saa',
			audioSlotKind: SAA_AUDIO_SLOT_KIND
		};
	}

	async loadWasmModule(
		onProgress?: (progress: number, message: string) => void
	): Promise<{ wasm: SaaWasmExports; wasmBuffer: ArrayBuffer }> {
		onProgress?.(0, 'Loading WASM module...');
		const [{ saaWasmImports }, wasmBuffer] = await Promise.all([
			this.loader.loadModule<{ saaWasmImports: () => WebAssembly.Imports }>(
				'saa/saa-wasm-imports.js'
			),
			this.loader.loadWasm('saa/saasound.wasm')
		]);
		onProgress?.(10, 'Instantiating WASM...');
		const result = await WebAssembly.instantiate(wasmBuffer, saaWasmImports());
		return { wasm: result.instance.exports, wasmBuffer };
	}

	async loadProcessorModules(
		onProgress?: (progress: number, message: string) => void
	): Promise<SaaProcessorModules> {
		onProgress?.(20, 'Loading processor modules...');
		const [
			{ default: SaaState },
			{ default: TrackerPatternProcessor },
			{ default: SaaAudioDriver },
			{ createSaaSoundEngine },
			{ default: SaaRegisterState },
			{ saaPeriodFromCode }
		] = await Promise.all([
			this.loader.loadModule<{ default: SaaProcessorModules['SaaState'] }>(
				'saa/saa-state.js'
			),
			this.loader.loadModule<{ default: SaaProcessorModules['TrackerPatternProcessor'] }>(
				'tracker/tracker-pattern-processor.js'
			),
			this.loader.loadModule<{ default: SaaProcessorModules['SaaAudioDriver'] }>(
				'saa/saa-audio-driver.js'
			),
			this.loader.loadModule<{
				createSaaSoundEngine: SaaProcessorModules['createSaaSoundEngine'];
			}>('saa/saa-engine.js'),
			this.loader.loadModule<{ default: SaaProcessorModules['SaaRegisterState'] }>(
				'saa/saa-register-state.js'
			),
			this.loader.loadModule<{ saaPeriodFromCode: SaaProcessorModules['saaPeriodFromCode'] }>(
				'saa/saa-levels.js'
			)
		]);
		onProgress?.(40, 'Preparing SAA renderer...');
		return {
			SaaState,
			TrackerPatternProcessor,
			SaaAudioDriver,
			createSaaSoundEngine,
			SaaRegisterState,
			saaPeriodFromCode
		};
	}

	setupExportState(
		state: SaaExportState,
		song: Song,
		project: Project,
		wasm: SaaWasmExports,
		chipPtr: number,
		wasmBuffer: ArrayBuffer,
		clockRate: number,
		ownsSharedPlaybackTimeline: boolean,
		periodFromCode: (code: number) => number
	): void {
		state.setWasmModule(wasm, chipPtr, wasmBuffer);
		state.setClockRate(clockRate);
		const codes = song.tuningTable?.length
			? song.tuningTable
			: resolveSaaTuningTable(
					clockRate,
					Math.min(880, Math.max(220, Number(song.a4TuningHz ?? 440)))
				);
		state.setTuningTable(codes.map((code) => periodFromCode(code)));
		state.setInstruments(filterInstrumentsForChip(project.instruments, song.chipType ?? 'saa'));
		state.setTables(project.tables);
		if (ownsSharedPlaybackTimeline) {
			state.setIntFrequency(
				song.interruptFrequency || DEFAULT_INTERRUPT_FREQUENCY,
				SAMPLE_RATE
			);
			state.setPatternOrder(
				project.patternOrder?.length ? project.patternOrder : [0],
				project.loopPointId || 0
			);
			state.setSpeed(project.initialSpeed > 0 ? project.initialSpeed : DEFAULT_SPEED);
			state.setTempo(project.tempo ?? 0);
			state.updateSamplesPerTick(SAMPLE_RATE);
		}
	}

	getPatterns(song: Song, patternOrder: number[]): Pattern[] {
		const patterns: Pattern[] = [];
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((entry) => entry.id === patternId);
			if (pattern) patterns.push(pattern);
		}
		return patterns;
	}

	private countRows(song: Song, patternOrder: number[]): number {
		let totalRows = 0;
		for (const patternId of patternOrder) {
			const pattern = song.patterns.find((entry) => entry.id === patternId);
			if (pattern) totalRows += pattern.length;
		}
		return totalRows;
	}

	private totalRowsForExport(
		song: Song,
		patternOrder: number[],
		loopCount: number,
		loopPointId: number
	): number {
		const firstPassRows = this.countRows(song, patternOrder);
		const validLoopPointId =
			loopPointId >= 0 && loopPointId < patternOrder.length ? loopPointId : 0;
		const loopSegmentRows = this.countRows(song, patternOrder.slice(validLoopPointId));
		return loopCount <= 1 ? firstPassRows : firstPassRows + loopSegmentRows * (loopCount - 1);
	}

	private calculateCurrentRow(timeline: OfflineSharedTimeline, song: Song): number {
		let currentRow = 0;
		for (let i = 0; i < timeline.currentPatternOrderIndex; i++) {
			const patternId = timeline.patternOrder[i];
			const pattern = song.patterns.find((entry) => entry.id === patternId);
			if (pattern) currentRow += pattern.length;
		}
		currentRow += timeline.currentRow;
		return currentRow;
	}

	private buildSession(
		project: Project,
		separateChannels: boolean,
		options?: RenderOptions
	): SharedTimelineExportBuildSession {
		const patternOrder = project.patternOrder?.length ? project.patternOrder : [0];
		const requestedStart = options?.startPatternOrderIndex ?? 0;
		const startOrderIndex =
			requestedStart >= 0 && requestedStart < patternOrder.length ? requestedStart : 0;
		return {
			patternOrder,
			startOrderIndex,
			sharedTimeline: null,
			separateChannels,
			resourceCache: new Map()
		};
	}

	private async renderSession(
		project: Project,
		lanes: Awaited<ReturnType<typeof createSaaSharedTimelineExportLane>>[],
		session: SharedTimelineExportBuildSession,
		leaderSong: Song,
		loopCount: number,
		onProgress?: (progress: number, message: string) => void
	): Promise<Float32Array[][]> {
		const timeline = session.sharedTimeline as OfflineSharedTimeline | null;
		if (!timeline) throw new Error('Shared timeline was not initialized');
		onProgress?.(50, 'Initializing renderer...');
		const buffers = await renderOfflineSharedTimeline({
			lanes,
			timeline,
			sampleRate: SAMPLE_RATE,
			loopCount,
			totalRows: this.totalRowsForExport(
				leaderSong,
				session.patternOrder,
				loopCount,
				project.loopPointId || 0
			),
			onProgress,
			calculateCurrentRow: () => this.calculateCurrentRow(timeline, leaderSong)
		});
		onProgress?.(100, 'Rendering complete');
		return buffers;
	}

	async renderSharedTimelineSlots(
		project: Project,
		slots: readonly SharedTimelineExportSlot[],
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<SharedTimelineExportResult[]> {
		assertSharedTimelineSlotsForChip(slots, this.binding);
		const loopCount = Math.max(1, options?.loopCount ?? 1);
		const session = this.buildSession(project, options?.separateChannels ?? false, options);
		const lanes = [];
		try {
			for (const slot of slots) {
				lanes.push(
					await createSaaSharedTimelineExportLane(
						this,
						project,
						slot.songIndex,
						session,
						onProgress
					)
				);
			}
			const leaderSong = project.songs[slots[0]!.songIndex];
			if (!leaderSong) throw new Error('Song is empty');
			const buffers = await this.renderSession(
				project,
				lanes,
				session,
				leaderSong,
				loopCount,
				onProgress
			);
			return lanes.map((lane, index) => ({
				songIndex: lane.songIndex,
				channels: buffers[index]!
			}));
		} finally {
			for (const lane of lanes) lane.release();
		}
	}

	async render(
		project: Project,
		songIndex: number,
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<Float32Array[]> {
		const song = project.songs[songIndex];
		if (!song?.patterns?.length) throw new Error('Song is empty');
		const loopCount = Math.max(1, options?.loopCount ?? 1);
		const session = this.buildSession(project, options?.separateChannels ?? false, options);
		const lane = await createSaaSharedTimelineExportLane(
			this,
			project,
			songIndex,
			session,
			onProgress
		);
		try {
			const buffers = await this.renderSession(
				project,
				[lane],
				session,
				song,
				loopCount,
				onProgress
			);
			return buffers[0]!;
		} finally {
			lane.release();
		}
	}
}
