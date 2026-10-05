import { DEFAULT_AYM_FREQUENCY } from '../../../chips/ay/ayumi-constants';
import { NES_NTSC_CPU_FREQUENCY, NES_PAL_CPU_FREQUENCY } from '../../../chips/nes/schema';
import type { Project } from '../../../models/project';
import { downloadFile, sanitizeFilename } from '../../../utils/file-download';
import { captureVgmProject } from '../vgm/vgm-shared-capture';
import { captureNesRegisterFrames } from './nes-register-export';
import { encodeNsf, type NsfFrame } from './nsf-encoder';

const NSF_CHIP_ERROR = 'NSF export supports one NES chip and one AY chip';
const AY_REGISTER_COUNT = 14;

export function resolveNsfLoopFrame(
	orderIndices: readonly number[],
	loopPointId: number,
	patternOrderLength: number,
	songEnded: boolean
): number | null {
	if (songEnded) return null;
	if (
		orderIndices.length === 0 ||
		loopPointId < 0 ||
		loopPointId >= patternOrderLength
	) {
		return 0;
	}
	const index = orderIndices.findIndex((orderIndex) => orderIndex === loopPointId);
	return index >= 0 ? index : 0;
}

export function resolveNsfSongs(project: Project): {
	nesIndex: number | null;
	ayIndex: number | null;
} {
	let nesIndex: number | null = null;
	let ayIndex: number | null = null;
	for (let index = 0; index < project.songs.length; index++) {
		const song = project.songs[index];
		if (!song) continue;
		const chip = song.chipType || 'ay';
		if (chip === 'nes') {
			if (nesIndex != null) throw new Error(NSF_CHIP_ERROR);
			nesIndex = index;
		} else if (chip === 'ay') {
			if (ayIndex != null) throw new Error(NSF_CHIP_ERROR);
			ayIndex = index;
		} else {
			throw new Error(NSF_CHIP_ERROR);
		}
	}
	if (nesIndex == null && ayIndex == null) {
		throw new Error(NSF_CHIP_ERROR);
	}
	return { nesIndex, ayIndex };
}

export function sunsoft5bClock(pal: boolean): number {
	const cpu = pal ? NES_PAL_CPU_FREQUENCY : NES_NTSC_CPU_FREQUENCY;
	return Math.floor(cpu / 2);
}

function scalePeriod(value: number, sourceHz: number, targetHz: number, max: number): number {
	if (value <= 0) return 0;
	const scaled = Math.round((value * targetHz) / sourceHz);
	if (scaled < 1) return 1;
	if (scaled > max) return max;
	return scaled;
}

export function scaleAyRegistersForNsf(
	registers: readonly number[],
	sourceHz: number,
	targetHz: number
): number[] {
	const out = registers.slice(0, AY_REGISTER_COUNT);
	while (out.length < AY_REGISTER_COUNT) out.push(0);
	if (!(sourceHz > 0) || !(targetHz > 0) || sourceHz === targetHz) {
		return out.map((value) => value & 0xff);
	}
	const write12 = (index: number) => {
		const period = (out[index]! & 0xff) | ((out[index + 1]! & 0x0f) << 8);
		const next = scalePeriod(period, sourceHz, targetHz, 0xfff);
		out[index] = next & 0xff;
		out[index + 1] = (next >> 8) & 0x0f;
	};
	write12(0);
	write12(2);
	write12(4);
	out[6] = scalePeriod(out[6]! & 0x1f, sourceHz, targetHz, 0x1f);
	const envelope = (out[11]! & 0xff) | ((out[12]! & 0xff) << 8);
	const nextEnvelope = scalePeriod(envelope, sourceHz, targetHz, 0xffff);
	out[11] = nextEnvelope & 0xff;
	out[12] = (nextEnvelope >> 8) & 0xff;
	return out.map((value) => value & 0xff);
}

function palFromRate(interruptFrequency: number): boolean {
	return interruptFrequency > 0 && interruptFrequency < 55;
}

export async function exportToNSF(
	project: Project,
	onProgress?: (progress: number, message: string) => void,
	abortSignal?: AbortSignal
): Promise<void> {
	try {
		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		const { nesIndex, ayIndex } = resolveNsfSongs(project);
		const patternOrder = project.patternOrder || [0];
		onProgress?.(0, 'Preparing NSF export...');

		let frames: NsfFrame[];
		let interruptFrequency: number;
		let pal: boolean;
		let orderIndices: number[];
		let songEnded: boolean;

		if (ayIndex == null && nesIndex != null) {
			const song = project.songs[nesIndex];
			if (!song) throw new Error(NSF_CHIP_ERROR);
			const captured = await captureNesRegisterFrames(project, nesIndex, {
				onProgress,
				abortSignal
			});
			frames = captured.frames.map((regs, index) => ({
				regs,
				dpcm: captured.dpcmFrames[index] ?? null,
				lengthReloads: captured.lengthReloads[index] ?? []
			}));
			interruptFrequency = captured.interruptFrequency;
			pal = song.chipVariant === 'PAL';
			orderIndices = captured.orderIndices;
			songEnded = captured.songEnded;
		} else {
			const captured = await captureVgmProject(
				project,
				ayIndex != null ? [ayIndex] : [],
				nesIndex != null ? [nesIndex] : [],
				{ onProgress, abortSignal }
			);
			const ay = captured.ayCaptures[0];
			const nes = captured.nesCaptures[0];
			const aySong = ayIndex != null ? project.songs[ayIndex] : undefined;
			const nesSong = nesIndex != null ? project.songs[nesIndex] : undefined;
			pal = nesSong ? nesSong.chipVariant === 'PAL' : palFromRate(captured.interruptFrequency);
			const sourceHz = aySong?.chipFrequency || DEFAULT_AYM_FREQUENCY;
			const targetHz = sunsoft5bClock(pal);
			const scaled = (ay?.frames ?? []).map((frame) =>
				scaleAyRegistersForNsf(frame.registers, sourceHz, targetHz)
			);
			const hold = scaled[scaled.length - 1] ?? new Array<number>(AY_REGISTER_COUNT).fill(0);
			const count = Math.max(scaled.length, nes?.frames.length ?? 0);
			frames = [];
			for (let index = 0; index < count; index++) {
				frames.push({
					regs: nes?.frames[index] ?? [],
					dpcm: nes?.dpcmFrames[index] ?? null,
					lengthReloads: nes?.lengthReloads[index] ?? [],
					ay: scaled[index] ?? hold,
					ayEnvelope: Boolean(ay?.frames[index]?.writeEnvelopeShape)
				});
			}
			interruptFrequency = captured.interruptFrequency;
			orderIndices = captured.orderIndices;
			songEnded = captured.songEnded;
		}

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		const bytes = encodeNsf({
			title: project.name || 'Untitled',
			artist: project.author || '',
			interruptFrequency: interruptFrequency > 0 ? interruptFrequency : 50,
			pal,
			frames,
			loopFrame: resolveNsfLoopFrame(
				orderIndices,
				project.loopPointId,
				patternOrder.length,
				songEnded
			)
		});

		if (abortSignal?.aborted) {
			throw new Error('Export cancelled');
		}

		onProgress?.(99, 'Downloading...');
		const filename = `${sanitizeFilename(project.name || 'export')}.nsf`;
		downloadFile(new Blob([bytes], { type: 'application/octet-stream' }), filename);
		onProgress?.(100, 'Complete!');
	} catch (error) {
		if (error instanceof Error && error.message === 'Export cancelled') {
			onProgress?.(0, 'Export cancelled');
			throw error;
		}
		console.error('Failed to export NSF:', error);
		onProgress?.(0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}
