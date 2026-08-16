import { beforeEach, describe, expect, it } from 'vitest';
import { Song } from '../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../src/lib/chips/ay/schema';
import { NES_CHIP_SCHEMA } from '../../../src/lib/chips/nes/schema';
import { projectStore } from '../../../src/lib/stores/project.svelte';
import { Project } from '../../../src/lib/models/project';

describe('projectStore.addSong', () => {
	beforeEach(() => {
		projectStore.applyProject(new Project());
	});

	it('creates instrument 01 for the first NES song on an empty project', () => {
		const song = new Song(NES_CHIP_SCHEMA);
		song.chipType = 'nes';

		projectStore.addSong(song);

		expect(projectStore.instruments).toHaveLength(1);
		expect(projectStore.instruments[0].id).toBe('01');
		expect(projectStore.instruments[0].chipType).toBe('nes');
	});

	it('creates instrument 01 for the first AY song on an empty project', () => {
		const song = new Song(AY_CHIP_SCHEMA);
		song.chipType = 'ay';

		projectStore.addSong(song);

		expect(projectStore.instruments).toHaveLength(1);
		expect(projectStore.instruments[0].id).toBe('01');
		expect(projectStore.instruments[0].chipType).toBe('ay');
	});

	it('assigns the next free id when adding a second chip type', () => {
		const aySong = new Song(AY_CHIP_SCHEMA);
		aySong.chipType = 'ay';
		const nesSong = new Song(NES_CHIP_SCHEMA);
		nesSong.chipType = 'nes';

		projectStore.addSong(aySong);
		projectStore.addSong(nesSong);

		expect(projectStore.instruments).toHaveLength(2);
		expect(projectStore.instruments.map((instrument) => instrument.id)).toEqual(['01', '02']);
		expect(projectStore.instruments.map((instrument) => instrument.chipType)).toEqual([
			'ay',
			'nes'
		]);
	});

	it('does not keep leftover NES pattern channels when adding AY after a new project', () => {
		const nesSong = new Song(NES_CHIP_SCHEMA);
		nesSong.chipType = 'nes';
		projectStore.addSong(nesSong);

		const leftoverNesPatterns = projectStore.patterns[0];
		expect(leftoverNesPatterns[0].channels.map((channel) => channel.label)).toEqual([
			'Pulse 1',
			'Pulse 2',
			'Triangle',
			'Noise',
			'DPCM'
		]);

		projectStore.applyProject(new Project());
		projectStore.updatePatterns(0, leftoverNesPatterns);

		const aySong = new Song(AY_CHIP_SCHEMA);
		aySong.chipType = 'ay';
		projectStore.addSong(aySong);

		expect(projectStore.songs).toHaveLength(1);
		expect(projectStore.songs[0].chipType).toBe('ay');
		expect(projectStore.patterns).toHaveLength(1);
		expect(projectStore.patterns[0][0].channels.map((channel) => channel.label)).toEqual([
			'A',
			'B',
			'C'
		]);
	});

	it('ignores pattern writes when no song exists at that index', () => {
		const nesSong = new Song(NES_CHIP_SCHEMA);
		nesSong.chipType = 'nes';
		projectStore.addSong(nesSong);
		const nesPatterns = projectStore.patterns[0];

		projectStore.applyProject(new Project());
		projectStore.updatePatterns(0, nesPatterns);

		expect(projectStore.songs).toHaveLength(0);
		expect(projectStore.patterns).toHaveLength(0);
	});

	it('keeps existing song patterns when adding another song', () => {
		const aySong = new Song(AY_CHIP_SCHEMA);
		aySong.chipType = 'ay';
		const nesSong = new Song(NES_CHIP_SCHEMA);
		nesSong.chipType = 'nes';

		projectStore.addSong(aySong);
		projectStore.addSong(nesSong);

		expect(projectStore.patterns).toHaveLength(2);
		expect(projectStore.patterns[0][0].channels.map((channel) => channel.label)).toEqual([
			'A',
			'B',
			'C'
		]);
		expect(projectStore.patterns[1][0].channels.map((channel) => channel.label)).toEqual([
			'Pulse 1',
			'Pulse 2',
			'Triangle',
			'Noise',
			'DPCM'
		]);
	});
});
