import type { Project } from '../../../models/project';
import type { Song } from '../../../models/song';
import { ST_MONO_LAYOUT, type TaymMetadata } from './taym-builder';

function resolveTuningTableLabel(song: Song): string | undefined {
	const index = (song as { tuningTableIndex?: number }).tuningTableIndex;
	if (index === undefined) {
		return undefined;
	}
	const setting = song.getSchema()?.settings?.find((entry) => entry.key === 'tuningTableIndex');
	const option = setting?.options?.find((entry) => entry.value === index);
	if (option) {
		return option.label;
	}
	if (setting?.dynamicOption && setting.dynamicOption.value === index) {
		return setting.dynamicOption.label({
			chipFrequency: (song as { chipFrequency?: number }).chipFrequency
		});
	}
	return undefined;
}

function resolveA4Hz(song: Song): number | undefined {
	const setting = song.getSchema()?.settings?.find((entry) => entry.key === 'a4TuningHz');
	const condition = setting?.showWhen;
	const values = song as unknown as Record<string, unknown>;
	if (!setting || (condition && values[condition.key] !== condition.value)) {
		return undefined;
	}
	const a4 = values.a4TuningHz;
	return typeof a4 === 'number' ? a4 : undefined;
}

function resolveStereoLayout(song: Song): string {
	if ((song as { stMixing?: boolean }).stMixing) {
		return ST_MONO_LAYOUT;
	}
	return (song as { stereoLayout?: string }).stereoLayout ?? 'ABC';
}

export function buildTaymMetadata(project: Project, song: Song): TaymMetadata {
	return {
		title: project.name || undefined,
		author: project.author || undefined,
		tracker: 'Bitphase',
		stereoLayout: resolveStereoLayout(song),
		tuningTable: resolveTuningTableLabel(song),
		a4Hz: resolveA4Hz(song),
		speed: project.initialSpeed || undefined,
		tempo: project.tempo || undefined,
		patternLength: song.defaultPatternLength || undefined,
		instruments: project.instruments.map((instrument) => instrument.name)
	};
}
