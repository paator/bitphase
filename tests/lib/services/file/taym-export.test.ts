import { describe, expect, it } from 'vitest';
import { Project } from '@/lib/models/project';
import { Song } from '@/lib/models/song';
import { resolveSingleAyTaymSongIndex } from '@/lib/services/file/taym/taym-export';

function song(chipType?: string): Song {
	const result = new Song();
	result.chipType = chipType;
	return result;
}

describe('resolveSingleAyTaymSongIndex', () => {
	it('uses the sole AY song index in mixed-chip projects', () => {
		const project = new Project('mixed', '', [song('saa'), song('ay')]);

		expect(resolveSingleAyTaymSongIndex(project, 0)).toBe(1);
	});

	it('keeps the requested song index when there are multiple AY songs', () => {
		const project = new Project('multi-ay', '', [song('ay'), song('ay')]);

		expect(resolveSingleAyTaymSongIndex(project, 0)).toBe(0);
	});
});
