import type { Project } from '../../../models/project';
import { getTotalVirtualChannelCount } from '../../../models/virtual-channels';
import { filterInstrumentsForChip } from '../../instrument/instrument-filter';
import { NES_NTSC_CPU_FREQUENCY } from '../../../chips/nes/schema';

const DEFAULT_SPEED = 6;
const NES_HW_CHANNEL_COUNT = 5;
const NES_REGISTER_UNCHANGED = -1;
const NES_SQUARE_SWEEP_DISABLED = 0x08;
const NES_SQUARE_LENGTH_NIBBLE = 0xf;
const NES_TRIANGLE_LINEAR_RELOAD = 0x7f;
const NES_APU_REG_COUNT = 0x16;

export type NesCaptureResult = {
	frames: number[][];
	orderIndices: number[];
	chipFrequency: number;
	interruptFrequency: number;
};

export type NesExportModules = {
	NesState: new (sharedTimeline?: unknown) => any;
	TrackerPatternProcessor: new (
		state: any,
		driver: any,
		port: { postMessage?: (...args: unknown[]) => void }
	) => any;
	NesAudioDriver: new () => any;
	NesChipRegisterState: new (channelCount?: number) => any;
	NesVirtualChannelMixer: new () => any;
};

function buildSquareVolumeReg(volume: number, duty: number): number {
	return (3 << 4) | (volume & 15) | ((duty & 3) << 6);
}

function buildSquareSilentVolumeReg(duty = 2): number {
	return ((duty & 3) << 6) | (3 << 4);
}

function buildNoiseSilentVolumeReg(): number {
	return 3 << 4;
}

function buildTriangleSilentLinearReg(): number {
	return 0;
}

function isSquareChannelActive(channel: any): boolean {
	return Boolean(channel?.enabled && channel.period > 0);
}

function isTriangleChannelActive(channel: any): boolean {
	return Boolean(channel?.enabled && channel.period > 0);
}

function isNoiseChannelActive(channel: any): boolean {
	return Boolean(channel?.enabled);
}

function writeSquareRegs(regs: number[], channelIndex: 0 | 1, channel: any): void {
	const base = channelIndex === 0 ? 0x00 : 0x04;
	if (!isSquareChannelActive(channel)) {
		regs[base] = buildSquareSilentVolumeReg(channel?.duty ?? 2);
		regs[base + 1] = NES_SQUARE_SWEEP_DISABLED;
		regs[base + 2] = 0;
		regs[base + 3] = 0;
		return;
	}
	const volumeReg =
		channel.volumeReg !== NES_REGISTER_UNCHANGED
			? channel.volumeReg
			: buildSquareVolumeReg(channel.volume ?? 0, channel.duty ?? 2);
	const lengthNibble =
		channel.lengthNibble !== NES_REGISTER_UNCHANGED
			? channel.lengthNibble
			: NES_SQUARE_LENGTH_NIBBLE;
	const period = channel.period > 0 ? channel.period - 1 : 0;
	const sweepReg =
		channel.sweepReg === undefined || channel.sweepReg < 0
			? NES_SQUARE_SWEEP_DISABLED
			: channel.sweepReg;
	regs[base] = volumeReg & 0xff;
	regs[base + 1] = sweepReg & 0xff;
	regs[base + 2] = period & 0xff;
	regs[base + 3] = ((lengthNibble << 3) | ((period >> 8) & 7)) & 0xff;
}

function writeTriangleRegs(regs: number[], channel: any): void {
	if (!isTriangleChannelActive(channel)) {
		regs[0x08] = buildTriangleSilentLinearReg();
		regs[0x0a] = 0;
		regs[0x0b] = 0;
		return;
	}
	const linearReg =
		channel.linearReg !== NES_REGISTER_UNCHANGED
			? channel.linearReg
			: (1 << 7) | NES_TRIANGLE_LINEAR_RELOAD;
	const lengthNibble =
		channel.lengthNibble !== NES_REGISTER_UNCHANGED
			? channel.lengthNibble
			: NES_SQUARE_LENGTH_NIBBLE;
	regs[0x08] = linearReg & 0xff;
	regs[0x0a] = channel.period & 0xff;
	regs[0x0b] = ((lengthNibble << 3) | ((channel.period >> 8) & 7)) & 0xff;
}

function writeNoiseRegs(regs: number[], channel: any): void {
	if (!isNoiseChannelActive(channel)) {
		regs[0x0c] = buildNoiseSilentVolumeReg();
		regs[0x0e] = 0;
		regs[0x0f] = 0;
		return;
	}
	const volumeReg =
		channel.volumeReg !== NES_REGISTER_UNCHANGED
			? channel.volumeReg
			: buildSquareVolumeReg(channel.volume ?? 0, 0);
	const lengthNibble =
		channel.lengthNibble !== NES_REGISTER_UNCHANGED
			? channel.lengthNibble
			: NES_SQUARE_LENGTH_NIBBLE;
	regs[0x0c] = volumeReg & 0xff;
	regs[0x0e] = ((channel.noiseMode ? 0x80 : 0) | (channel.noisePeriod & 15)) & 0xff;
	regs[0x0f] = (lengthNibble << 3) & 0xff;
}

export function convertNesRegisterStateToApuRegs(registerState: any): number[] {
	const regs = new Array(NES_APU_REG_COUNT).fill(0);
	const channels = registerState?.channels ?? [];
	writeSquareRegs(regs, 0, channels[0]);
	writeSquareRegs(regs, 1, channels[1]);
	writeTriangleRegs(regs, channels[2]);
	writeNoiseRegs(regs, channels[3]);

	let status = 0;
	if (isSquareChannelActive(channels[0])) status |= 1;
	if (isSquareChannelActive(channels[1])) status |= 2;
	if (isTriangleChannelActive(channels[2])) status |= 4;
	if (isNoiseChannelActive(channels[3])) status |= 8;
	regs[0x15] = status;
	return regs;
}

async function loadNesExportModules(): Promise<NesExportModules> {
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

function getPatterns(song: any, patternOrder: number[]): any[] {
	const patterns: any[] = [];
	for (const patternId of patternOrder) {
		const pattern = song.patterns.find((p: any) => p.id === patternId);
		if (pattern) {
			patterns.push(pattern);
		}
	}
	return patterns;
}

function calculateTotalRows(song: any, patternOrder: number[]): number {
	let totalRows = 0;
	for (const patternId of patternOrder) {
		const pattern = song.patterns.find((p: any) => p.id === patternId);
		if (pattern) {
			totalRows += pattern.length;
		}
	}
	return totalRows;
}

async function captureRegisterFrames(
	state: any,
	patternProcessor: any,
	audioDriver: any,
	registerState: any,
	mixer: any,
	song: any,
	totalRows: number,
	patterns: any[],
	onProgress?: (progress: number, message: string) => void
): Promise<{ frames: number[][]; orderIndices: number[] }> {
	const frames: number[][] = [];
	const orderIndices: number[] = [];
	let totalTicks = 0;
	const maxTicks = 1000000;
	let lastProgressUpdate = 0;
	let lastProgressTime = Date.now();

	onProgress?.(50, 'Capturing NES register states...');

	while (totalTicks < maxTicks) {
		const now = Date.now();
		if (
			(totalTicks - lastProgressUpdate >= 1000 || now - lastProgressTime >= 100) &&
			totalTicks > 0
		) {
			let currentRow = 0;
			for (let i = 0; i < state.timeline.currentPatternOrderIndex; i++) {
				const patternId = state.timeline.patternOrder[i];
				const pattern = song.patterns.find((p: any) => p.id === patternId);
				if (pattern) {
					currentRow += pattern.length;
				}
			}
			if (state.currentPattern) {
				currentRow += state.timeline.currentRow;
			}
			onProgress?.(50 + (currentRow / totalRows) * 50, `Capturing... ${currentRow}/${totalRows} rows`);
			lastProgressUpdate = totalTicks;
			lastProgressTime = now;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

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
		audioDriver.advancePulseWidthTable(state);
		audioDriver.advanceSweepTable(state);
		audioDriver.syncSweepTableRegisterState(state, registerState);
		patternProcessor.processVibrato();
		patternProcessor.processSlides();

		const stateToConvert = mixer.hasVirtualChannels()
			? mixer.merge(registerState, state)
			: registerState;
		frames.push(convertNesRegisterStateToApuRegs(stateToConvert));
		orderIndices.push(state.timeline.currentPatternOrderIndex);

		const isLastPattern =
			state.timeline.currentPatternOrderIndex >= state.timeline.patternOrder.length - 1;
		const isLastRow = state.timeline.currentRow >= state.currentPattern.length - 1;
		const isLastTick = state.timeline.currentTick >= state.timeline.currentSpeed - 1;
		if (isLastPattern && isLastRow && isLastTick) {
			break;
		}

		const needsPatternChange = state.advancePosition();
		if (needsPatternChange) {
			if (state.timeline.currentPatternOrderIndex >= state.timeline.patternOrder.length) {
				break;
			}
			if (state.timeline.currentPatternOrderIndex < patterns.length) {
				state.currentPattern = patterns[state.timeline.currentPatternOrderIndex];
			} else {
				break;
			}
		}

		totalTicks++;
	}

	return { frames, orderIndices };
}

export async function captureNesRegisterFrames(
	project: Project,
	songIndex: number = 0,
	options?: {
		modules?: NesExportModules;
		onProgress?: (progress: number, message: string) => void;
		abortSignal?: AbortSignal;
	}
): Promise<NesCaptureResult> {
	const song = project.songs[songIndex];
	if (!song || song.patterns.length === 0) {
		throw new Error('Song is empty');
	}

	const modules = options?.modules ?? (await loadNesExportModules());
	const chipFrequency = song.chipFrequency ?? NES_NTSC_CPU_FREQUENCY;
	const interruptFrequency = song.interruptFrequency ?? 50;

	const virtualChannelMap: Record<number, number> = song.virtualChannelMap ?? {};
	const hasVirtual = Object.values(virtualChannelMap).some((c: number) => c > 1);
	const totalChannelCount = hasVirtual
		? getTotalVirtualChannelCount(NES_HW_CHANNEL_COUNT, virtualChannelMap)
		: NES_HW_CHANNEL_COUNT;

	const {
		NesState,
		TrackerPatternProcessor,
		NesAudioDriver,
		NesChipRegisterState,
		NesVirtualChannelMixer
	} = modules;

	const state = new NesState();
	state.setTuningTable(song.tuningTable);
	state.setInstruments(filterInstrumentsForChip(project.instruments, song.chipType ?? 'nes'));
	state.setTables(project.tables);
	state.setPatternOrder(project.patternOrder || [0]);
	state.setSpeed(song.initialSpeed || DEFAULT_SPEED);
	if (song.interruptFrequency) {
		state.timeline.intFrequency = song.interruptFrequency;
	}
	if (typeof state.resizeChannels === 'function' && totalChannelCount !== NES_HW_CHANNEL_COUNT) {
		state.resizeChannels(totalChannelCount);
	}

	const audioDriver = new NesAudioDriver();
	if (typeof audioDriver.resizeChannels === 'function') {
		audioDriver.resizeChannels(totalChannelCount);
	}
	const registerState = new NesChipRegisterState(totalChannelCount);
	const mixer = new NesVirtualChannelMixer();
	if (hasVirtual) {
		mixer.configure(virtualChannelMap, NES_HW_CHANNEL_COUNT);
	}
	const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
		postMessage: () => {}
	});

	const patternOrder = project.patternOrder || [0];
	const patterns = getPatterns(song, patternOrder);
	if (patterns.length === 0) {
		throw new Error('No patterns found');
	}

	state.currentPattern = patterns[0];
	state.timeline.currentPatternOrderIndex = 0;

	const framesResult = await captureRegisterFrames(
		state,
		patternProcessor,
		audioDriver,
		registerState,
		mixer,
		song,
		calculateTotalRows(song, patternOrder),
		patterns,
		options?.onProgress
	);

	if (options?.abortSignal?.aborted) {
		throw new Error('Export cancelled');
	}

	return {
		frames: framesResult.frames,
		orderIndices: framesResult.orderIndices,
		chipFrequency,
		interruptFrequency
	};
}
