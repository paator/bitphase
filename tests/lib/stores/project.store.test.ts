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

	it('does not create another instrument when adding a second song of the same chip', () => {
		const first = new Song(NES_CHIP_SCHEMA);
		first.chipType = 'nes';
		const second = new Song(NES_CHIP_SCHEMA);
		second.chipType = 'nes';

		projectStore.addSong(first);
		projectStore.addSong(second);

		expect(projectStore.instruments).toHaveLength(1);
		expect(projectStore.instruments[0].chipType).toBe('nes');
	});
});
