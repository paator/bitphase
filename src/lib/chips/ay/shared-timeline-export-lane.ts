import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import type {
	SharedTimelineExportBuildSession,
	SharedTimelineExportLaneHandle
} from '../base/renderer';
import { AYUMI_AUDIO_SLOT_KIND } from './audio-slot-kind';
import {
	AYUMI_STRUCT_CHANNEL_OUT_OFFSET,
	AYUMI_STRUCT_LEFT_OFFSET,
	AYUMI_STRUCT_RIGHT_OFFSET
} from './ayumi-constants';
import { getTotalVirtualChannelCount } from '../../models/virtual-channels';
import type { AYChipRenderer } from './renderer';

const SAMPLE_RATE = 44100;
const TONE_CHANNELS = 3;

type AyExportLaneContext = {
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
	wasm: any;
	separateChannels: boolean;
};

type AyWasmBundle = {
	wasm: any;
	wasmBuffer: ArrayBuffer;
	modules: Awaited<ReturnType<AYChipRenderer['loadProcessorModules']>>;
	getPanSettingsForLayout: (layout: string) => { channel: number; pan: number; isEqp: number }[];
};

async function loadAyWasmBundle(
	renderer: AYChipRenderer,
	session: SharedTimelineExportBuildSession,
	onProgress?: (progress: number, message: string) => void
): Promise<AyWasmBundle> {
	const cached = session.resourceCache?.get(AYUMI_AUDIO_SLOT_KIND) as AyWasmBundle | undefined;
	if (cached) return cached;

	const wasmBundle = await (renderer as any).loadWasmModule(onProgress);
	const { getPanSettingsForLayout } = await (renderer as any).loader.loadModule(
		'ay/ayumi-constants.js'
	);
	const modules = await (renderer as any).loadProcessorModules(onProgress);
	const bundle: AyWasmBundle = {
		wasm: wasmBundle.wasm,
		wasmBuffer: wasmBundle.wasmBuffer,
		modules,
		getPanSettingsForLayout
	};
	session.resourceCache?.set(AYUMI_AUDIO_SLOT_KIND, bundle);
	return bundle;
}

function createAyLaneHandle(context: AyExportLaneContext, renderer: AYChipRenderer): SharedTimelineExportLaneHandle {
	const {
		songIndex,
		song,
		state,
		patternProcessor,
		audioDriver,
		ayumiEngine,
		registerState,
		mixer,
		ayumiPtr,
		patterns,
		wasm,
		separateChannels
	} = context;

	return {
		songIndex,
		audioSlotKind: AYUMI_AUDIO_SLOT_KIND,
		separateChannels,
		getLeaderPatternRowCount() {
			return state.currentPattern?.length > 0 ? state.currentPattern.length : 0;
		},
		runSharedPlaybackQuantum() {
			if (!state.currentPattern?.length) return;
			const tl = state.timeline;
			if (tl.currentTick === 0) {
				patternProcessor.parsePatternRow(state.currentPattern, tl.currentRow, registerState);
				patternProcessor.processSpeedTable();
			}
			patternProcessor.processTables();
			patternProcessor.processArpeggio();
			patternProcessor.processEffectTables();
			audioDriver.processInstruments(state, registerState);
			patternProcessor.processVibrato();
			patternProcessor.processSlides();
			if (mixer.hasVirtualChannels()) {
				ayumiEngine.applyRegisterState(mixer.merge(registerState, state));
				registerState.forceEnvelopeShapeWrite = false;
			} else {
				ayumiEngine.applyRegisterState(registerState);
			}
		},
		onPatternOrderAdvanced(needsChange) {
			if (!needsChange) return;
			const index = state.timeline.currentPatternOrderIndex;
			if (index < patterns.length) {
				state.currentPattern = patterns[index]!;
			}
		},
		createChannelBuffers() {
			return Array.from({ length: TONE_CHANNELS }, () => [] as number[]);
		},
		captureSample() {
			audioDriver.updateSamplePlayback(
				state,
				registerState,
				ayumiEngine,
				SAMPLE_RATE,
				(channelIndex: number) => (renderer as any).resolveSampleAyumiChannel(mixer, channelIndex)
			);
			ayumiEngine.process();
			ayumiEngine.removeDC();

			const leftOffset = ayumiPtr + AYUMI_STRUCT_LEFT_OFFSET;
			const rightOffset = ayumiPtr + AYUMI_STRUCT_RIGHT_OFFSET;
			const left = new Float64Array(wasm.memory.buffer, leftOffset, 1)[0];
			const right = new Float64Array(wasm.memory.buffer, rightOffset, 1)[0];

			if (separateChannels) {
				const channels: number[] = [];
				for (let ch = 0; ch < TONE_CHANNELS; ch++) {
					const offset = ayumiPtr + AYUMI_STRUCT_CHANNEL_OUT_OFFSET + ch * 8;
					channels.push(new Float64Array(wasm.memory.buffer, offset, 1)[0]);
				}
				return { left, right, channels };
			}

			return { left, right };
		},
		release() {
			wasm.free(ayumiPtr);
		}
	};
}

export async function createAySharedTimelineExportLane(
	renderer: AYChipRenderer,
	project: Project,
	songIndex: number,
	session: SharedTimelineExportBuildSession,
	onProgress?: (progress: number, message: string) => void
): Promise<SharedTimelineExportLaneHandle> {
	const song = project.songs[songIndex];
	if (!song?.patterns?.length) {
		throw new Error('Song is empty');
	}

	const { wasm, wasmBuffer, modules, getPanSettingsForLayout } = await loadAyWasmBundle(
		renderer,
		session,
		onProgress
	);
	const {
		AyumiState,
		TrackerPatternProcessor,
		AYAudioDriver,
		AyumiEngine,
		AYChipRegisterState,
		VirtualChannelMixer
	} = modules;

	const ayumiPtr = (renderer as any).initializeAyumi(wasm, song, getPanSettingsForLayout);
	const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
	const hasVirtual = Object.values(virtualChannelMap).some((count: number) => count > 1);
	const totalChannelCount = hasVirtual
		? getTotalVirtualChannelCount(TONE_CHANNELS, virtualChannelMap)
		: TONE_CHANNELS;

	const ownsTimeline = session.sharedTimeline == null;
	const state = ownsTimeline
		? new AyumiState(totalChannelCount)
		: new AyumiState(totalChannelCount, session.sharedTimeline);
	if (ownsTimeline) {
		session.sharedTimeline = state.timeline;
	}

	(renderer as any).applyAyExportLaneSetup(
		state,
		song,
		project,
		wasm,
		ayumiPtr,
		wasmBuffer,
		ownsTimeline
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

	(renderer as any).syncExportEngineRegisterState(
		audioDriver,
		ayumiEngine,
		registerState,
		mixer,
		state
	);

	const patterns = (renderer as any).getPatterns(song, session.patternOrder) as Pattern[];
	if (patterns.length === 0) {
		wasm.free(ayumiPtr);
		throw new Error('No patterns found');
	}

	state.currentPattern = patterns[session.startOrderIndex]!;
	state.timeline.currentPatternOrderIndex = session.startOrderIndex;
	if (ownsTimeline) {
		state.timeline.tickAccumulator = 1.0;
	}

	return createAyLaneHandle(
		{
			songIndex,
			song,
			state,
			patternProcessor,
			audioDriver,
			ayumiEngine,
			registerState,
			mixer,
			ayumiPtr,
			patterns,
			wasm,
			separateChannels: session.separateChannels
		},
		renderer
	);
}
