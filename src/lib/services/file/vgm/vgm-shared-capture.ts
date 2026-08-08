import type { Project } from '../../../models/project';
import { getTotalVirtualChannelCount } from '../../../models/virtual-channels';
import { filterInstrumentsForChip } from '../../instrument/instrument-filter';
import {
	convertRegisterStateToAYRegisters,
	extractHardwareEnvFmStates,
	extractHardwareFmStates,
	extractHardwareSampleStates,
	extractHardwareSidStates,
	extractHardwareSyncBuzzerStates,
	TONE_CHANNELS,
	type CapturedAySampleInstrument,
	type SongCaptureFrame
} from '../ay/ay-export-utils';
import {
	convertNesRegisterStateToApuRegs,
	type NesCaptureResult,
	type NesExportModules
} from '../nes/nes-register-export';
import {
	type PsgExportModules,
	type SongCaptureResult
} from '../ay/psg-export';
import { resolveVgmAyType } from './vgm-encoder';

const DEFAULT_SPEED = 6;
const MAX_TICKS = 1_000_000;
const CAPTURE_OUTPUT_SAMPLE_RATE = 44100;
const NES_HW_CHANNEL_COUNT = 5;

type CaptureSlot = {
	songIndex: number;
	chip: 'ay' | 'nes';
	getLeaderPatternRowCount: () => number;
	runSharedPlaybackQuantum: () => void;
	onPatternOrderAdvanced: (needsChange: boolean) => void;
};

export type VgmProjectCapture = {
	ayCaptures: SongCaptureResult[];
	nesCaptures: NesCaptureResult[];
	interruptFrequency: number;
	orderIndices: number[];
};

function getPatterns(song: { patterns: Array<{ id: number }> }, patternOrder: number[]) {
	const patterns: Array<{ id: number; length: number }> = [];
	for (const patternId of patternOrder) {
		const pattern = song.patterns.find((entry) => entry.id === patternId);
		if (pattern) {
			patterns.push(pattern as { id: number; length: number });
		}
	}
	return patterns;
}

function calculateTotalRows(
	song: { patterns: Array<{ id: number; length: number }> },
	patternOrder: number[]
): number {
	let totalRows = 0;
	for (const patternId of patternOrder) {
		const pattern = song.patterns.find((entry) => entry.id === patternId);
		if (pattern) {
			totalRows += pattern.length;
		}
	}
	return totalRows;
}

function resolveInterruptFrequency(song: { interruptFrequency?: number }): number {
	return song.interruptFrequency ?? 50;
}

function resolveAyIsYm(song: {
	stMixing?: boolean;
	chipVariant?: string;
	chipFrequency?: number;
}): boolean {
	return (
		Boolean(song.stMixing) ||
		song.chipVariant === 'YM' ||
		(song.chipFrequency ?? 1773400) >= 2000000
	);
}

function assertCompatibleExportSongs(
	project: Project,
	ayIndices: number[],
	nesIndices: number[]
): number {
	const songs = [...ayIndices, ...nesIndices].map((index) => {
		const song = project.songs[index];
		if (!song || song.patterns.length === 0) {
			throw new Error(`Song ${index + 1} is empty`);
		}
		return song;
	});

	const interruptFrequency = resolveInterruptFrequency(songs[0]!);
	for (const song of songs) {
		if (resolveInterruptFrequency(song) !== interruptFrequency) {
			throw new Error('VGM export requires all songs to use the same interrupt frequency');
		}
	}

	if (ayIndices.length > 1) {
		const first = project.songs[ayIndices[0]!]!;
		const second = project.songs[ayIndices[1]!]!;
		const firstClock = first.chipFrequency ?? 1773400;
		const secondClock = second.chipFrequency ?? 1773400;
		if (firstClock !== secondClock) {
			throw new Error('VGM dual AY requires matching chip frequencies');
		}
		const firstType = resolveVgmAyType(
			first.chipVariant,
			Boolean((first as { stMixing?: boolean }).stMixing)
		);
		const secondType = resolveVgmAyType(
			second.chipVariant,
			Boolean((second as { stMixing?: boolean }).stMixing)
		);
		if (firstType !== secondType) {
			throw new Error('VGM dual AY requires matching chip type (AY / YM)');
		}
	}

	if (nesIndices.length > 1) {
		const first = project.songs[nesIndices[0]!]!;
		const second = project.songs[nesIndices[1]!]!;
		const firstClock = first.chipFrequency ?? 1789773;
		const secondClock = second.chipFrequency ?? 1789773;
		if (firstClock !== secondClock) {
			throw new Error('VGM dual NES requires matching chip frequencies');
		}
	}

	return interruptFrequency;
}

async function loadAyModules(): Promise<PsgExportModules> {
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
	const samplePlayback = await import(`${baseUrl}ay/ay-sample-playback.js`);
	return {
		AyumiState,
		TrackerPatternProcessor,
		AYAudioDriver,
		AYChipRegisterState,
		VirtualChannelMixer,
		instrumentHasSample: samplePlayback.instrumentHasSample,
		advanceSamplePosition: samplePlayback.advanceSamplePosition
	};
}

async function loadNesModules(): Promise<NesExportModules> {
	const baseUrl = import.meta.env.BASE_URL;
	const { default: NesState } = await import(`${baseUrl}nes/nes-state.js`);
	const { default: TrackerPatternProcessor } = await import(
		`${baseUrl}tracker/tracker-pattern-processor.js`
	);
	const { default: NesAudioDriver } = await import(`${baseUrl}nes/nes-audio-driver.js`);
	const { default: NesChipRegisterState } = await import(
		`${baseUrl}nes/nes-chip-register-state.js`
	);
	const { default: NesVirtualChannelMixer } = await import(
		`${baseUrl}nes/nes-virtual-channel-mixer.js`
	);
	return {
		NesState,
		TrackerPatternProcessor,
		NesAudioDriver,
		NesChipRegisterState,
		NesVirtualChannelMixer
	};
}

function advanceAyDigiSamples(
	state: any,
	audioDriver: any,
	modules: PsgExportModules,
	samplesPerInterrupt: number
): void {
	const instrumentHasSample = modules.instrumentHasSample;
	const advanceSamplePosition = modules.advanceSamplePosition;
	if (!instrumentHasSample || !advanceSamplePosition) {
		return;
	}
	for (let channelIndex = 0; channelIndex < state.channelInstruments.length; channelIndex++) {
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

function createAyCaptureSlot(
	project: Project,
	songIndex: number,
	modules: PsgExportModules,
	sharedTimeline: unknown | null,
	patternOrder: number[],
	samplesPerInterrupt: number,
	framesOut: SongCaptureFrame[],
	ownsTimeline: boolean
): { slot: CaptureSlot; result: SongCaptureResult; timeline: unknown } {
	const song = project.songs[songIndex]!;
	const chipFrequency = song.chipFrequency ?? 1773400;
	const interruptFrequency = resolveInterruptFrequency(song);
	const isYm = resolveAyIsYm(song as { stMixing?: boolean; chipVariant?: string; chipFrequency?: number });
	const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
	const hasVirtual = Object.values(virtualChannelMap).some((count) => count > 1);
	const totalChannelCount = hasVirtual
		? getTotalVirtualChannelCount(TONE_CHANNELS, virtualChannelMap)
		: TONE_CHANNELS;

	const filteredInstruments = filterInstrumentsForChip(
		project.instruments,
		song.chipType ?? 'ay'
	);
	const state = sharedTimeline
		? new modules.AyumiState(totalChannelCount, sharedTimeline)
		: new modules.AyumiState(totalChannelCount);
	const timeline = state.timeline;

	state.setTuningTable(song.tuningTable);
	state.setInstruments(filteredInstruments);
	state.setTables(project.tables);
	if (typeof state.setChipVariant === 'function') {
		state.setChipVariant(isYm ? 'YM' : 'AY');
	}
	if (typeof state.setAymFrequency === 'function') {
		state.setAymFrequency(chipFrequency);
	} else if (state.aymFrequency !== undefined) {
		state.aymFrequency = chipFrequency;
	}
	if (ownsTimeline) {
		state.setPatternOrder(patternOrder, project.loopPointId || 0);
		state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
		timeline.intFrequency = interruptFrequency;
	}

	const audioDriver = new modules.AYAudioDriver(totalChannelCount);
	const registerState = new modules.AYChipRegisterState(totalChannelCount);
	const mixer = new modules.VirtualChannelMixer();
	if (hasVirtual) {
		mixer.configure(virtualChannelMap, TONE_CHANNELS);
	}
	const patternProcessor = new modules.TrackerPatternProcessor(state, audioDriver, {
		postMessage: () => {}
	});
	const patterns = getPatterns(song, patternOrder);
	if (patterns.length === 0) {
		throw new Error(`No patterns found for song ${songIndex + 1}`);
	}
	state.currentPattern = patterns[0];
	if (ownsTimeline) {
		timeline.currentPatternOrderIndex = 0;
	} else {
		const index = Math.min(
			Math.max(0, timeline.currentPatternOrderIndex | 0),
			Math.max(0, patterns.length - 1)
		);
		state.currentPattern = patterns[index];
	}

	const slot: CaptureSlot = {
		songIndex,
		chip: 'ay',
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

			const stateToConvert = mixer.hasVirtualChannels()
				? mixer.merge(registerState, state)
				: registerState;
			const sample = extractHardwareSampleStates(
				state,
				(channelIndex) => audioDriver.getEffectiveTone(state, channelIndex),
				(channelIndex) =>
					mixer.hasVirtualChannels()
						? mixer.getHardwareChannelIndex(channelIndex)
						: channelIndex
			);
			framesOut.push({
				registers: [...convertRegisterStateToAYRegisters(stateToConvert)],
				sid: extractHardwareSidStates(stateToConvert),
				syncbuzzer: extractHardwareSyncBuzzerStates(stateToConvert),
				fm: extractHardwareFmStates(stateToConvert),
				envFm: extractHardwareEnvFmStates(stateToConvert),
				sample
			});
			if (mixer.hasVirtualChannels()) {
				registerState.forceEnvelopeShapeWrite = false;
			}
			advanceAyDigiSamples(state, audioDriver, modules, samplesPerInterrupt);
		},
		onPatternOrderAdvanced(needsChange) {
			if (!needsChange) return;
			const index = state.timeline.currentPatternOrderIndex;
			if (index < patterns.length) {
				state.currentPattern = patterns[index];
			}
		}
	};

	return {
		slot,
		timeline,
		result: {
			frames: framesOut,
			orderIndices: [],
			instruments: filteredInstruments as CapturedAySampleInstrument[],
			chipFrequency,
			interruptFrequency,
			isYm
		}
	};
}

function createNesCaptureSlot(
	project: Project,
	songIndex: number,
	modules: NesExportModules,
	sharedTimeline: unknown | null,
	patternOrder: number[],
	framesOut: number[][],
	ownsTimeline: boolean
): { slot: CaptureSlot; result: NesCaptureResult; timeline: unknown } {
	const song = project.songs[songIndex]!;
	const chipFrequency = song.chipFrequency ?? 1789773;
	const interruptFrequency = resolveInterruptFrequency(song);
	const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
	const hasVirtual = Object.values(virtualChannelMap).some((count) => count > 1);
	const totalChannelCount = hasVirtual
		? getTotalVirtualChannelCount(NES_HW_CHANNEL_COUNT, virtualChannelMap)
		: NES_HW_CHANNEL_COUNT;

	const state = sharedTimeline
		? new modules.NesState(sharedTimeline)
		: new modules.NesState();
	const timeline = state.timeline;

	state.setTuningTable(song.tuningTable);
	state.setInstruments(filterInstrumentsForChip(project.instruments, song.chipType ?? 'nes'));
	state.setTables(project.tables);
	if (ownsTimeline) {
		state.setPatternOrder(patternOrder, project.loopPointId || 0);
		state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
		timeline.intFrequency = interruptFrequency;
	}
	if (typeof state.resizeChannels === 'function' && totalChannelCount !== NES_HW_CHANNEL_COUNT) {
		state.resizeChannels(totalChannelCount);
	}

	const audioDriver = new modules.NesAudioDriver();
	if (typeof audioDriver.resizeChannels === 'function') {
		audioDriver.resizeChannels(totalChannelCount);
	}
	const registerState = new modules.NesChipRegisterState(totalChannelCount);
	const mixer = new modules.NesVirtualChannelMixer();
	if (hasVirtual) {
		mixer.configure(virtualChannelMap, NES_HW_CHANNEL_COUNT);
	}
	const patternProcessor = new modules.TrackerPatternProcessor(state, audioDriver, {
		postMessage: () => {}
	});
	const patterns = getPatterns(song, patternOrder);
	if (patterns.length === 0) {
		throw new Error(`No patterns found for song ${songIndex + 1}`);
	}
	state.currentPattern = patterns[0];
	if (ownsTimeline) {
		timeline.currentPatternOrderIndex = 0;
	} else {
		const index = Math.min(
			Math.max(0, timeline.currentPatternOrderIndex | 0),
			Math.max(0, patterns.length - 1)
		);
		state.currentPattern = patterns[index];
	}

	const slot: CaptureSlot = {
		songIndex,
		chip: 'nes',
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
			audioDriver.advancePulseWidthTable(state);
			audioDriver.advanceSweepTable(state);
			audioDriver.syncSweepTableRegisterState(state, registerState);
			patternProcessor.processVibrato();
			patternProcessor.processSlides();

			const stateToConvert = mixer.hasVirtualChannels()
				? mixer.merge(registerState, state)
				: registerState;
			framesOut.push(convertNesRegisterStateToApuRegs(stateToConvert));
		},
		onPatternOrderAdvanced(needsChange) {
			if (!needsChange) return;
			const index = state.timeline.currentPatternOrderIndex;
			if (index < patterns.length) {
				state.currentPattern = patterns[index];
			}
		}
	};

	return {
		slot,
		timeline,
		result: {
			frames: framesOut,
			orderIndices: [],
			chipFrequency,
			interruptFrequency
		}
	};
}

export async function captureVgmProject(
	project: Project,
	ayIndices: number[],
	nesIndices: number[],
	options?: {
		onProgress?: (progress: number, message: string) => void;
		abortSignal?: AbortSignal;
	}
): Promise<VgmProjectCapture> {
	if (ayIndices.length === 0 && nesIndices.length === 0) {
		throw new Error('No AY or NES songs to export');
	}

	const interruptFrequency = assertCompatibleExportSongs(project, ayIndices, nesIndices);
	const patternOrder = project.patternOrder || [0];
	const samplesPerInterrupt = Math.max(
		1,
		Math.round(CAPTURE_OUTPUT_SAMPLE_RATE / interruptFrequency)
	);

	options?.onProgress?.(10, 'Loading capture modules...');
	const ayModules = ayIndices.length > 0 ? await loadAyModules() : null;
	const nesModules = nesIndices.length > 0 ? await loadNesModules() : null;

	if (options?.abortSignal?.aborted) {
		throw new Error('Export cancelled');
	}

	const orderedSlots: Array<{ chip: 'ay' | 'nes'; songIndex: number; arrayIndex: number }> = [
		...ayIndices.map((songIndex, arrayIndex) => ({
			chip: 'ay' as const,
			songIndex,
			arrayIndex
		})),
		...nesIndices.map((songIndex, arrayIndex) => ({
			chip: 'nes' as const,
			songIndex,
			arrayIndex
		}))
	].sort((a, b) => a.songIndex - b.songIndex);

	const ayFrameBuffers = ayIndices.map(() => [] as SongCaptureFrame[]);
	const nesFrameBuffers = nesIndices.map(() => [] as number[][]);
	const ayResults: SongCaptureResult[] = new Array(ayIndices.length);
	const nesResults: NesCaptureResult[] = new Array(nesIndices.length);
	const slots: CaptureSlot[] = [];

	let sharedTimeline: unknown | null = null;
	for (const entry of orderedSlots) {
		const ownsTimeline = sharedTimeline == null;
		if (entry.chip === 'ay') {
			const created = createAyCaptureSlot(
				project,
				entry.songIndex,
				ayModules!,
				sharedTimeline,
				patternOrder,
				samplesPerInterrupt,
				ayFrameBuffers[entry.arrayIndex]!,
				ownsTimeline
			);
			if (ownsTimeline) {
				sharedTimeline = created.timeline;
			}
			ayResults[entry.arrayIndex] = created.result;
			slots.push(created.slot);
		} else {
			const created = createNesCaptureSlot(
				project,
				entry.songIndex,
				nesModules!,
				sharedTimeline,
				patternOrder,
				nesFrameBuffers[entry.arrayIndex]!,
				ownsTimeline
			);
			if (ownsTimeline) {
				sharedTimeline = created.timeline;
			}
			nesResults[entry.arrayIndex] = created.result;
			slots.push(created.slot);
		}
	}

	if (!sharedTimeline) {
		throw new Error('Shared timeline was not initialized');
	}

	const timeline = sharedTimeline as {
		currentTick: number;
		currentSpeed: number;
		currentRow: number;
		currentPatternOrderIndex: number;
		patternOrder: number[];
		advancePosition: (leaderLen: number) => boolean;
	};

	const leaderSongIndex = orderedSlots[0]!.songIndex;
	const leaderSong = project.songs[leaderSongIndex]!;
	const totalRows = Math.max(1, calculateTotalRows(leaderSong, patternOrder));
	const orderIndices: number[] = [];

	options?.onProgress?.(50, 'Capturing shared timeline...');
	let totalTicks = 0;
	let lastProgressUpdate = 0;
	let lastProgressTime = Date.now();

	while (totalTicks < MAX_TICKS) {
		if (options?.abortSignal?.aborted) {
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
				const pattern = leaderSong.patterns.find((entry) => entry.id === patternId);
				if (pattern) {
					currentRow += pattern.length;
				}
			}
			currentRow += timeline.currentRow;
			options?.onProgress?.(
				50 + (currentRow / totalRows) * 35,
				`Capturing... ${currentRow}/${totalRows} rows`
			);
			lastProgressUpdate = totalTicks;
			lastProgressTime = now;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const leaderLen = (() => {
			const primary = slots[0]?.getLeaderPatternRowCount() ?? 0;
			if (primary > 0) return primary;
			for (const slot of slots) {
				const length = slot.getLeaderPatternRowCount();
				if (length > 0) return length;
			}
			return 1;
		})();

		for (const slot of slots) {
			slot.runSharedPlaybackQuantum();
		}
		orderIndices.push(timeline.currentPatternOrderIndex);

		const isLastPattern =
			timeline.currentPatternOrderIndex >= timeline.patternOrder.length - 1;
		const isLastRow = timeline.currentRow >= leaderLen - 1;
		const isLastTick = timeline.currentTick >= timeline.currentSpeed - 1;
		if (isLastPattern && isLastRow && isLastTick) {
			break;
		}

		const needsOrderWrap = timeline.advancePosition(leaderLen);
		for (const slot of slots) {
			slot.onPatternOrderAdvanced(needsOrderWrap);
		}

		totalTicks++;
	}

	for (const result of ayResults) {
		result.orderIndices = [...orderIndices];
	}
	for (const result of nesResults) {
		result.orderIndices = [...orderIndices];
	}

	return {
		ayCaptures: ayResults,
		nesCaptures: nesResults,
		interruptFrequency,
		orderIndices
	};
}
