import type { Project } from '../../../models/project';
import { assembleAyProject } from './ay-register-project';
import { importAyRegisterFrames } from './ay-register-import';
import { decodePsgFrames, hasPsgMagic } from './psg-frames';

export const DEFAULT_PSG_CLOCK_HZ = 1773400;
export const DEFAULT_PSG_FRAME_RATE_HZ = 50;

export type PsgRepeatUnit = 1 | 4;

export const DEFAULT_PSG_REPEAT_UNIT: PsgRepeatUnit = 4;

export type PsgImportOptions = {
	clockHz?: number;
	frameRateHz?: number;
	repeatUnit?: PsgRepeatUnit;
};

export type PsgImportResult = {
	project: Project;
	warnings: string[];
};

export function isPsgBuffer(buffer: ArrayBuffer): boolean {
	return hasPsgMagic(buffer);
}

export function importPsgBuffer(
	buffer: ArrayBuffer,
	fallbackName = '',
	options: PsgImportOptions = {}
): PsgImportResult {
	const bytes = new Uint8Array(buffer);
	const repeatUnit = options.repeatUnit ?? DEFAULT_PSG_REPEAT_UNIT;
	const frames = decodePsgFrames(bytes, repeatUnit);
	const clockHz = options.clockHz ?? DEFAULT_PSG_CLOCK_HZ;
	const frameRateHz = options.frameRateHz ?? DEFAULT_PSG_FRAME_RATE_HZ;
	const warnings = describeRepeatAmbiguity(bytes, frames.length, repeatUnit);

	const result = importAyRegisterFrames({
		frames,
		frameCount: frames.length,
		frameRateHz,
		loopFrame: null,
		clockHz,
		chipVariant: 'AY',
		stereoLayout: null,
		stMixing: false,
		timerSegments: [],
		instrumentIdOffset: 0
	});

	const project = assembleAyProject({
		title: fallbackName,
		author: '',
		songs: [result.song],
		instruments: result.instruments,
		patternOrder: result.patternOrder,
		loopPatternIndex: result.loopPatternIndex
	});

	return { project, warnings: [...warnings, ...result.warnings] };
}

function describeRepeatAmbiguity(
	bytes: Uint8Array,
	frameCount: number,
	repeatUnit: PsgRepeatUnit
): string[] {
	const alternative: PsgRepeatUnit = repeatUnit === 4 ? 1 : 4;
	const alternativeCount = decodePsgFrames(bytes, alternative).length;
	if (alternativeCount === frameCount) {
		return [];
	}
	return [
		`Frame repeats were read as ${repeatUnit} frame(s) each, giving ${frameCount} frames; some tools write them as ${alternative} frame(s) each, which would give ${alternativeCount} frames`
	];
}

export async function loadPsgFile(file: File, options?: PsgImportOptions): Promise<Project> {
	const buffer = await file.arrayBuffer();
	const stem = file.name.replace(/\.[^.]+$/, '');
	const { project, warnings } = importPsgBuffer(buffer, stem, options);
	for (const warning of warnings) {
		console.warn(`PSG import: ${warning}`);
	}
	return project;
}
