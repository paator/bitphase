import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import type {
	SharedTimelineExportBuildSession,
	SharedTimelineExportLaneHandle
} from '../base/renderer';
import { SAA_AUDIO_SLOT_KIND } from './audio-slot-kind';
import { SAA_SAM_CLOCK, SAA_CHIP_SCHEMA } from './schema';
import type {
	SaaExportEngine,
	SaaExportState,
	SaaProcessorModules,
	SAAChipRenderer
} from './renderer';

function saaExportClockRate(song: { chipFrequency?: number }): number {
	return song.chipFrequency && song.chipFrequency > 0 ? song.chipFrequency : SAA_SAM_CLOCK;
}

const SAMPLE_RATE = 44100;
const EXPORT_CHANNEL_COUNT = SAA_CHIP_SCHEMA.channelLabels?.length ?? 6;

type SaaWasmExports = Record<string, WebAssembly.ExportValue>;

type SaaWasmBundle = {
	wasm: SaaWasmExports;
	wasmBuffer: ArrayBuffer;
	modules: SaaProcessorModules;
};

type SaaPatternProcessor = InstanceType<SaaProcessorModules['TrackerPatternProcessor']>;

type SaaExportLaneContext = {
	songIndex: number;
	state: SaaExportState;
	patternProcessor: SaaPatternProcessor;
	engine: SaaExportEngine;
	registerState: unknown;
	patterns: Pattern[];
	separateChannels: boolean;
};

async function loadSaaWasmBundle(
	renderer: SAAChipRenderer,
	session: SharedTimelineExportBuildSession,
	onProgress?: (progress: number, message: string) => void
): Promise<SaaWasmBundle> {
	const cached = session.resourceCache?.get(SAA_AUDIO_SLOT_KIND) as SaaWasmBundle | undefined;
	if (cached) return cached;
	const wasmBundle = await renderer.loadWasmModule(onProgress);
	const modules = await renderer.loadProcessorModules(onProgress);
	const bundle: SaaWasmBundle = {
		wasm: wasmBundle.wasm,
		wasmBuffer: wasmBundle.wasmBuffer,
		modules
	};
	session.resourceCache?.set(SAA_AUDIO_SLOT_KIND, bundle);
	return bundle;
}

function createSaaLaneHandle(context: SaaExportLaneContext): SharedTimelineExportLaneHandle {
	const {
		songIndex,
		state,
		patternProcessor,
		engine,
		registerState,
		patterns,
		separateChannels
	} = context;

	return {
		songIndex,
		audioSlotKind: SAA_AUDIO_SLOT_KIND,
		separateChannels,
		getLeaderPatternRowCount() {
			return state.currentPattern && state.currentPattern.length > 0
				? state.currentPattern.length
				: 0;
		},
		runSharedPlaybackQuantum() {
			if (!state.currentPattern?.length) return;
			const timeline = state.timeline;
			if (timeline.currentTick === 0) {
				patternProcessor.parsePatternRow(
					state.currentPattern,
					timeline.currentRow,
					registerState
				);
				patternProcessor.processSpeedTable();
			}
			patternProcessor.processTrackerTick(registerState);
			engine.apply(registerState);
		},
		onPatternOrderAdvanced(needsChange) {
			if (!needsChange) return;
			const index = state.timeline.currentPatternOrderIndex;
			const pattern = patterns[index];
			if (pattern) state.currentPattern = pattern;
		},
		createChannelBuffers() {
			return Array.from({ length: EXPORT_CHANNEL_COUNT }, () => [] as number[]);
		},
		captureSample() {
			const sample = engine.generate();
			if (!separateChannels) {
				return { left: sample.left, right: sample.right };
			}
			const channels: number[] = [];
			for (let channel = 0; channel < EXPORT_CHANNEL_COUNT; channel++) {
				channels.push(sample.exportChannels[channel] ?? 0);
			}
			return { left: sample.left, right: sample.right, channels };
		},
		release() {
			engine.dispose();
		}
	};
}

export async function createSaaSharedTimelineExportLane(
	renderer: SAAChipRenderer,
	project: Project,
	songIndex: number,
	session: SharedTimelineExportBuildSession,
	onProgress?: (progress: number, message: string) => void
): Promise<SharedTimelineExportLaneHandle> {
	const song = project.songs[songIndex];
	if (!song?.patterns?.length) throw new Error('Song is empty');

	const { wasm, wasmBuffer, modules } = await loadSaaWasmBundle(renderer, session, onProgress);
	const {
		SaaState,
		TrackerPatternProcessor,
		SaaAudioDriver,
		createSaaSoundEngine,
		SaaRegisterState,
		saaPeriodFromCode
	} = modules;
	const clockRate = saaExportClockRate(song);
	const engine = createSaaSoundEngine(wasm, clockRate, SAMPLE_RATE);

	try {
		const ownsTimeline = session.sharedTimeline == null;
		const state = ownsTimeline ? new SaaState() : new SaaState(session.sharedTimeline);
		if (ownsTimeline) session.sharedTimeline = state.timeline;

		renderer.setupExportState(
			state,
			song,
			project,
			wasm,
			engine.chipPtr,
			wasmBuffer,
			clockRate,
			ownsTimeline,
			saaPeriodFromCode
		);

		const audioDriver = new SaaAudioDriver();
		const registerState = new SaaRegisterState();
		const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
			postMessage: () => {}
		});
		const patterns = renderer.getPatterns(song, session.patternOrder);
		const pattern = patterns[session.startOrderIndex];
		if (!pattern) {
			throw new Error('No patterns found');
		}

		state.currentPattern = pattern;
		state.timeline.currentPatternOrderIndex = session.startOrderIndex;
		if (ownsTimeline) state.timeline.tickAccumulator = 1;
		engine.apply(registerState);

		return createSaaLaneHandle({
			songIndex,
			state,
			patternProcessor,
			engine,
			registerState,
			patterns,
			separateChannels: session.separateChannels
		});
	} catch (error) {
		engine.dispose();
		throw error;
	}
}
