import type { Project } from '../../../models/project';
import { downloadFile, sanitizeFilename } from '../../../utils/file-download';
import type { SongCaptureResult } from '../ay/psg-export';
import type { NesCaptureResult } from '../nes/nes-register-export';
import {
	appendAyWrite,
	appendNesRegisterDiffs,
	appendWait,
	encodeVgm,
	resolveVgmAyType,
	samplesPerInterrupt,
	VGM_HEADER_SIZE
} from './vgm-encoder';
import {
	createAyTimerRuntime,
	collectOwnedAyRegisters,
	expandAyFrameTimerWrites,
	type AyTimedWrite,
	type AyTimerRuntime
} from './vgm-ay-timers';
import { expandAyFrameSampleWrites } from './vgm-ay-samples';
import { captureVgmProject } from './vgm-shared-capture';

const MAX_SAME_CHIP = 2;

type StreamEvent =
	| {
			sample: number;
			kind: 'ay-base';
			chip: 0 | 1;
			registers: number[];
			skipRegisters: Set<number>;
	  }
	| { sample: number; kind: 'ay-timer'; chip: 0 | 1; write: AyTimedWrite }
	| { sample: number; kind: 'nes'; chip: 0 | 1; registers: number[] };

function getSongIndicesByChip(project: Project, chipType: string): number[] {
	const indices: number[] = [];
	for (let i = 0; i < project.songs.length; i++) {
		const song = project.songs[i];
		if (!song) continue;
		if (chipType === 'ay') {
			if (!song.chipType || song.chipType === 'ay') {
				indices.push(i);
			}
		} else if (song.chipType === chipType) {
			indices.push(i);
		}
	}
	return indices;
}

function systemNameForProject(ayCount: number, nesCount: number): string {
	if (ayCount > 0 && nesCount > 0) return 'Multi-chip';
	if (nesCount > 0) return 'NES';
	return 'AY-3-8910';
}

function findLoopFrameIndex(
	orderIndices: number[] | undefined,
	loopPointId: number,
	patternOrderLength: number
): number | null {
	if (
		!orderIndices ||
		loopPointId < 0 ||
		loopPointId >= patternOrderLength ||
		orderIndices.length === 0
	) {
		return null;
	}
	const index = orderIndices.findIndex((orderIndex) => orderIndex === loopPointId);
	return index >= 0 ? index : null;
}

function applyAyRegisterDiffs(
	commands: number[],
	previous: number[],
	registers: number[],
	chipIndex: 0 | 1,
	skipRegisters?: Set<number>
): void {
	const length = Math.min(previous.length, registers.length);
	for (let i = 0; i < length; i++) {
		if (skipRegisters?.has(i)) {
			continue;
		}
		if (previous[i] !== registers[i]) {
			appendAyWrite(commands, i, registers[i]!, chipIndex);
			previous[i] = registers[i]!;
		}
	}
}

function applyAyTimedWrite(
	commands: number[],
	previous: number[],
	write: AyTimedWrite,
	chipIndex: 0 | 1
): void {
	if (previous[write.register] === write.value) {
		return;
	}
	appendAyWrite(commands, write.register, write.value, chipIndex);
	previous[write.register] = write.value;
}

function emitStreamEvents(
	commands: number[],
	events: StreamEvent[],
	fromSample: number,
	toSample: number,
	ayPrev: number[][],
	nesPrev: number[][]
): void {
	events.sort((a, b) => {
		if (a.sample !== b.sample) return a.sample - b.sample;
		const rank = (event: StreamEvent) => {
			if (event.kind === 'ay-base' || event.kind === 'nes') return 0;
			return 1;
		};
		return rank(a) - rank(b);
	});

	let cursor = fromSample;
	for (const event of events) {
		const at = Math.min(Math.max(event.sample, fromSample), toSample);
		const wait = Math.round(at - cursor);
		if (wait > 0) {
			appendWait(commands, wait);
			cursor += wait;
		}
		if (event.kind === 'ay-base') {
			applyAyRegisterDiffs(
				commands,
				ayPrev[event.chip]!,
				event.registers,
				event.chip,
				event.skipRegisters
			);
		} else if (event.kind === 'ay-timer') {
			applyAyTimedWrite(commands, ayPrev[event.chip]!, event.write, event.chip);
		} else {
			appendNesRegisterDiffs(commands, nesPrev[event.chip]!, event.registers, event.chip);
		}
	}

	const tail = Math.round(toSample - cursor);
	if (tail > 0) {
		appendWait(commands, tail);
	}
}

function collectFrameEvents(
	frameIndex: number,
	frameStart: number,
	frameEnd: number,
	ayCaptures: SongCaptureResult[],
	nesCaptures: NesCaptureResult[],
	ayTimerRuntimes: AyTimerRuntime[]
): StreamEvent[] {
	const events: StreamEvent[] = [];

	for (let chip = 0; chip < ayCaptures.length; chip++) {
		const capture = ayCaptures[chip]!;
		const frame = capture.frames[frameIndex];
		if (!frame) continue;
		events.push({
			sample: frameStart,
			kind: 'ay-base',
			chip: chip === 0 ? 0 : 1,
			registers: frame.registers,
			skipRegisters: collectOwnedAyRegisters(frame)
		});
		const timerWrites = expandAyFrameTimerWrites(
			frame,
			ayTimerRuntimes[chip]!,
			capture.chipFrequency,
			frameStart,
			frameEnd
		);
		for (const write of timerWrites) {
			events.push({
				sample: write.sample,
				kind: 'ay-timer',
				chip: chip === 0 ? 0 : 1,
				write
			});
		}
		const sampleWrites = expandAyFrameSampleWrites(
			frame,
			capture.instruments,
			capture.chipFrequency,
			capture.isYm,
			frameStart,
			frameEnd
		);
		for (const write of sampleWrites) {
			events.push({
				sample: write.sample,
				kind: 'ay-timer',
				chip: chip === 0 ? 0 : 1,
				write
			});
		}
	}

	for (let chip = 0; chip < nesCaptures.length; chip++) {
		const regs = nesCaptures[chip]!.frames[frameIndex];
		if (!regs) continue;
		events.push({
			sample: frameStart,
			kind: 'nes',
			chip: chip === 0 ? 0 : 1,
			registers: regs
		});
	}

	return events;
}

export async function exportToVGM(
	project: Project,
	_songIndex: number = 0,
	onProgress?: (progress: number, message: string) => void,
	abortSignal?: AbortSignal
): Promise<void> {
	try {
		onProgress?.(0, 'Preparing VGM export...');

		const ayIndices = getSongIndicesByChip(project, 'ay').slice(0, MAX_SAME_CHIP);
		const nesIndices = getSongIndicesByChip(project, 'nes').slice(0, MAX_SAME_CHIP);

		if (ayIndices.length === 0 && nesIndices.length === 0) {
			throw new Error('No AY or NES songs to export');
		}
		if (
			getSongIndicesByChip(project, 'ay').length > MAX_SAME_CHIP ||
			getSongIndicesByChip(project, 'nes').length > MAX_SAME_CHIP
		) {
			throw new Error('VGM supports at most 2 chips of the same type');
		}

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		const captured = await captureVgmProject(project, ayIndices, nesIndices, {
			onProgress,
			abortSignal
		});
		const ayCaptures = captured.ayCaptures;
		const nesCaptures = captured.nesCaptures;

		onProgress?.(85, 'Encoding VGM...');

		const interruptFrequency = captured.interruptFrequency;
		const waitSamples = samplesPerInterrupt(interruptFrequency);
		const frameCount = Math.max(
			0,
			...ayCaptures.map((c) => c.frames.length),
			...nesCaptures.map((c) => c.frames.length)
		);
		const patternOrder = project.patternOrder || [0];
		const loopFrameIndex = findLoopFrameIndex(
			captured.orderIndices,
			project.loopPointId,
			patternOrder.length
		);

		const commands: number[] = [];
		const ayPrev = ayCaptures.map(() => new Array(14).fill(-1));
		const nesPrev = nesCaptures.map(() => new Array(0x16).fill(-1));
		const ayTimerRuntimes = ayCaptures.map(() => createAyTimerRuntime());
		let totalSamples = 0;
		let loopDataOffset: number | undefined;
		let samplesBeforeLoop = 0;

		for (let frame = 0; frame < frameCount; frame++) {
			if (loopFrameIndex === frame) {
				loopDataOffset = VGM_HEADER_SIZE + commands.length;
				samplesBeforeLoop = totalSamples;
			}
			const frameStart = totalSamples;
			const frameEnd = totalSamples + waitSamples;
			const events = collectFrameEvents(
				frame,
				frameStart,
				frameEnd,
				ayCaptures,
				nesCaptures,
				ayTimerRuntimes
			);
			emitStreamEvents(commands, events, frameStart, frameEnd, ayPrev, nesPrev);
			totalSamples = frameEnd;
		}

		const loopSamples =
			loopDataOffset != null ? totalSamples - samplesBeforeLoop : undefined;

		const firstAySong = ayIndices.length > 0 ? project.songs[ayIndices[0]!] : null;
		const ayType = firstAySong
			? resolveVgmAyType(
					firstAySong.chipVariant,
					Boolean((firstAySong as { stMixing?: boolean }).stMixing)
				)
			: undefined;

		const buffer = encodeVgm({
			ayClock: ayCaptures[0]?.chipFrequency,
			ayDual: ayCaptures.length > 1,
			ayType,
			nesClock: nesCaptures[0]?.chipFrequency,
			nesDual: nesCaptures.length > 1,
			totalSamples,
			loopDataOffset,
			loopSamples: loopSamples != null && loopSamples > 0 ? loopSamples : undefined,
			rateHz: interruptFrequency,
			commands: Uint8Array.from(commands),
			gd3: {
				trackName: project.name || 'Untitled',
				author: project.author || '',
				systemName: systemNameForProject(ayCaptures.length, nesCaptures.length),
				converter: 'bitphase'
			}
		});

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		onProgress?.(99, 'Downloading...');
		const filename = `${sanitizeFilename(project.name || 'export')}.vgm`;
		downloadFile(
			new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' }),
			filename
		);
		onProgress?.(100, 'Complete!');
	} catch (error) {
		if (error instanceof Error && error.message === 'Export cancelled') {
			onProgress?.(0, 'Export cancelled');
			throw error;
		}
		console.error('Failed to export VGM:', error);
		onProgress?.(0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}
