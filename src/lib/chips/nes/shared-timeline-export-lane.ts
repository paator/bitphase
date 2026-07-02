import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import type {
	SharedTimelineExportBuildSession,
	SharedTimelineExportLaneHandle
} from '../base/renderer';
import { NES_AUDIO_SLOT_KIND } from './audio-slot-kind';
import { NES_NTSC_CPU_FREQUENCY } from './schema';
import type { NESChipRenderer } from './renderer';

const SAMPLE_RATE = 44100;

type NesExportLaneContext = {
	songIndex: number;
	song: any;
	state: any;
	patternProcessor: any;
	audioDriver: any;
	apuEngine: any;
	registerState: any;
	patterns: Pattern[];
	wasm: Record<string, unknown>;
	apuPtr: number;
	dmcPtr: number;
};

type NesWasmBundle = {
	wasm: Record<string, unknown>;
	wasmBuffer: ArrayBuffer;
	modules: Awaited<ReturnType<NESChipRenderer['loadProcessorModules']>>;
};

async function loadNesWasmBundle(
	renderer: NESChipRenderer,
	session: SharedTimelineExportBuildSession,
	onProgress?: (progress: number, message: string) => void
): Promise<NesWasmBundle> {
	const cached = session.resourceCache?.get(NES_AUDIO_SLOT_KIND) as NesWasmBundle | undefined;
	if (cached) return cached;

	const wasmBundle = await (renderer as any).loadWasmModule(onProgress);
	const modules = await (renderer as any).loadProcessorModules(onProgress);
	const bundle: NesWasmBundle = {
		wasm: wasmBundle.wasm,
		wasmBuffer: wasmBundle.wasmBuffer,
		modules
	};
	session.resourceCache?.set(NES_AUDIO_SLOT_KIND, bundle);
	return bundle;
}

function createNesLaneHandle(
	context: NesExportLaneContext,
	renderer: NESChipRenderer
): SharedTimelineExportLaneHandle {
	const {
		songIndex,
		state,
		patternProcessor,
		audioDriver,
		apuEngine,
		registerState,
		patterns,
		wasm,
		apuPtr,
		dmcPtr
	} = context;

	return {
		songIndex,
		audioSlotKind: NES_AUDIO_SLOT_KIND,
		separateChannels: false,
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
			apuEngine.applyRegisterState(registerState);
		},
		onPatternOrderAdvanced(needsChange) {
			if (!needsChange) return;
			const index = state.timeline.currentPatternOrderIndex;
			if (index < patterns.length) {
				state.currentPattern = patterns[index]!;
			}
		},
		captureSample() {
			const { left, right } = apuEngine.process(SAMPLE_RATE);
			return { left, right };
		},
		release() {
			apuEngine.dispose();
			(renderer as any).freeWasmPointers(wasm, apuPtr, dmcPtr);
		}
	};
}

export async function createNesSharedTimelineExportLane(
	renderer: NESChipRenderer,
	project: Project,
	songIndex: number,
	session: SharedTimelineExportBuildSession,
	onProgress?: (progress: number, message: string) => void
): Promise<SharedTimelineExportLaneHandle> {
	const song = project.songs[songIndex];
	if (!song?.patterns?.length) {
		throw new Error('Song is empty');
	}

	const { wasm, wasmBuffer, modules } = await loadNesWasmBundle(renderer, session, onProgress);
	const { NesState, TrackerPatternProcessor, NesAudioDriver, createNesApuEngine, NesChipRegisterState } =
		modules;

	const { engine, apuPtr, dmcPtr } = createNesApuEngine(wasm);
	const ownsTimeline = session.sharedTimeline == null;
	const state = ownsTimeline ? new NesState() : new NesState(session.sharedTimeline);
	if (ownsTimeline) {
		session.sharedTimeline = state.timeline;
	}

	(renderer as any).setupExportState(
		state,
		song,
		project,
		wasm,
		apuPtr,
		dmcPtr,
		wasmBuffer,
		ownsTimeline
	);

	const audioDriver = new NesAudioDriver();
	engine.setCpuFrequency(song.chipFrequency ?? NES_NTSC_CPU_FREQUENCY);
	engine.setChipVariant(song.chipVariant ?? 'NTSC');
	const registerState = new NesChipRegisterState();
	const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
		postMessage: () => {}
	});

	const patterns = (renderer as any).getPatterns(song, session.patternOrder) as Pattern[];
	if (patterns.length === 0) {
		engine.dispose();
		(renderer as any).freeWasmPointers(wasm, apuPtr, dmcPtr);
		throw new Error('No patterns found');
	}

	state.currentPattern = patterns[session.startOrderIndex]!;
	state.timeline.currentPatternOrderIndex = session.startOrderIndex;
	if (ownsTimeline) {
		state.timeline.tickAccumulator = 1.0;
	}

	engine.applyRegisterState(registerState);

	return createNesLaneHandle(
		{
			songIndex,
			song,
			state,
			patternProcessor,
			audioDriver,
			apuEngine: engine,
			registerState,
			patterns,
			wasm,
			apuPtr,
			dmcPtr
		},
		renderer
	);
}
