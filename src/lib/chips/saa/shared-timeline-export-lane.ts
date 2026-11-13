import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import type {
	SharedTimelineExportBuildSession,
	SharedTimelineExportLaneHandle
} from '../base/renderer';
import { SAA_AUDIO_SLOT_KIND } from './audio-slot-kind';
import { getTotalVirtualChannelCount } from '../../models/virtual-channels';
import { SAA_SAM_CLOCK, SAA_CHIP_SCHEMA } from './schema';
import { appendStemSample, stemBufferCount } from '../../services/file/wav/stem-samples';
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
	audioDriver: unknown;
	mixer: {
		hasVirtualChannels: () => boolean;
	};
	resolveHardwareState: (
		driver: unknown,
		mixer: unknown,
		virtualState: unknown,
		playbackState: unknown
	) => unknown;
	patterns: Pattern[];
	separateChannels: boolean;
	stereo: boolean;
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
		audioDriver,
		mixer,
		resolveHardwareState,
		patterns,
		separateChannels,
		stereo
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
			engine.apply(resolveHardwareState(audioDriver, mixer, registerState, state));
		},
		onPatternOrderAdvanced(needsChange) {
			if (!needsChange) return;
			const index = state.timeline.currentPatternOrderIndex;
			const pattern = patterns[index];
			if (pattern) state.currentPattern = pattern;
		},
		createChannelBuffers() {
			return Array.from(
				{ length: stemBufferCount(EXPORT_CHANNEL_COUNT, stereo) },
				() => [] as number[]
			);
		},
		captureSample() {
			const sample = engine.generate();
			if (!separateChannels) {
				return { left: sample.left, right: sample.right };
			}
			const channels: number[] = [];
			for (let channel = 0; channel < EXPORT_CHANNEL_COUNT; channel++) {
				appendStemSample(
					channels,
					stereo,
					sample.exportChannels[channel] ?? 0,
					sample.exportLeft[channel] ?? 0,
					sample.exportRight[channel] ?? 0
				);
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
		saaPeriodFromCode,
		SaaVirtualChannelMixer,
		resolveSaaHardwareState
	} = modules;
	const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
	const hasVirtual = Object.values(virtualChannelMap).some((count) => count > 1);
	const totalChannelCount = hasVirtual
		? getTotalVirtualChannelCount(EXPORT_CHANNEL_COUNT, virtualChannelMap)
		: EXPORT_CHANNEL_COUNT;
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
		const registerState = new SaaRegisterState(totalChannelCount);
		const mixer = new SaaVirtualChannelMixer();
		if (hasVirtual) {
			state.resizeChannels(totalChannelCount);
			mixer.configure(
				virtualChannelMap,
				EXPORT_CHANNEL_COUNT,
				song.virtualChannelRoles ?? {}
			);
			audioDriver.setVirtualChannelMode((index: number) =>
				mixer.getHardwareChannelIndex(index)
			);
		}
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
			audioDriver,
			mixer,
			resolveHardwareState: resolveSaaHardwareState,
			patterns,
			separateChannels: session.separateChannels,
			stereo: session.separateChannels && session.stereo === true
		});
	} catch (error) {
		engine.dispose();
		throw error;
	}
}
