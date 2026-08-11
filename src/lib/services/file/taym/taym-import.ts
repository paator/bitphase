import type { Project } from '../../../models/project';
import type { Instrument, Song } from '../../../models/song';
import { assembleAyProject } from '../ay/ay-register-project';
import { TaymFormatError } from './taym-spec';
import { hasTaymMagic, readTaymFile } from './taym-reader';
import { resolveTimerTimeline } from './taym-timers';
import { getTaymChipImporter } from './taym-chip-import';

export type TaymImportResult = {
	project: Project;
	warnings: string[];
};

export function isTaymBuffer(buffer: ArrayBuffer): boolean {
	return hasTaymMagic(buffer);
}

export function importTaymBuffer(buffer: ArrayBuffer, fallbackName = ''): TaymImportResult {
	const file = readTaymFile(buffer);
	const timeline = resolveTimerTimeline(file);
	const warnings = [...timeline.warnings];

	const songs: Song[] = [];
	const instruments: Instrument[] = [];
	let patternOrder: number[] = [0];
	let loopPatternIndex = 0;

	for (let chipIndex = 0; chipIndex < file.chips.length; chipIndex++) {
		const chip = file.chips[chipIndex]!;
		const importer = getTaymChipImporter(chip.chipTypeId);
		if (!importer) {
			warnings.push(
				`Chip ${chipIndex} has type 0x${chip.chipTypeId
					.toString(16)
					.padStart(2, '0')}, which Bitphase cannot import yet`
			);
			continue;
		}

		const result = importer({
			chip,
			chipIndex,
			track: file.track,
			info: file.info,
			frameData: chip.frameDataTag ? (file.frameData.get(chip.frameDataTag) ?? null) : null,
			segments: timeline.segments.filter((segment) => segment.chipIndex === chipIndex),
			instrumentIdOffset: instruments.length
		});

		songs.push(result.song);
		instruments.push(...result.instruments);
		warnings.push(...result.warnings);
		if (songs.length === 1) {
			patternOrder = result.patternOrder;
			loopPatternIndex = result.loopPatternIndex;
		}
	}

	if (songs.length === 0) {
		throw new TaymFormatError('The TAYM file contains no chip Bitphase can import');
	}

	const project = assembleAyProject({
		title: file.info.title?.trim() || fallbackName,
		author: file.info.author?.trim() || '',
		songs,
		instruments,
		patternOrder,
		loopPatternIndex
	});

	return { project, warnings };
}

export async function loadTaymFile(file: File): Promise<Project> {
	const buffer = await file.arrayBuffer();
	const stem = file.name.replace(/\.[^.]+$/, '');
	const { project, warnings } = importTaymBuffer(buffer, stem);
	for (const warning of warnings) {
		console.warn(`TAYM import: ${warning}`);
	}
	return project;
}
