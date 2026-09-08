import type { Project } from '../../src/lib/models/project';

export const TIMER_EFFECTS_DEMO = 'atarized.btp';

export function demoStem(btpFilename: string): string {
	return btpFilename.replace(/\.btp$/i, '');
}

export function aySongIndices(project: Project): number[] {
	const indices: number[] = [];
	for (let index = 0; index < project.songs.length; index++) {
		const song = project.songs[index];
		if (song && (!song.chipType || song.chipType === 'ay')) {
			indices.push(index);
		}
	}
	return indices;
}

export function psgReferenceFilenames(stem: string, aySongCount: number): string[] {
	if (aySongCount <= 1) return [`${stem}.psg`];
	return Array.from({ length: aySongCount }, (_, index) => `${stem}_ay${index + 1}.psg`);
}
