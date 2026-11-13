import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemResourceLoader } from '../../../../cli/resource-loader-node';
import { AYChipRenderer } from '@/lib/chips/ay/renderer';
import { AY_CHIP_SCHEMA, resolveAYTuningTable } from '@/lib/chips/ay/schema';
import { Project } from '@/lib/models/project';
import { Note, NoteName, Pattern, Song } from '@/lib/models/song';
import { legacyInstrument } from '../../../helpers/instrument-fixtures';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function energy(samples: Float32Array): number {
	let sum = 0;
	for (const sample of samples) sum += sample * sample;
	return sum;
}

function createProject(stereoLayout: string): Project {
	const pattern = new Pattern(0, 4, AY_CHIP_SCHEMA);
	pattern.channels[0]!.rows[0]!.note = new Note(NoteName.A, 4);
	pattern.channels[0]!.rows[0]!.instrument = 1;
	pattern.channels[2]!.rows[0]!.note = new Note(NoteName.A, 4);
	pattern.channels[2]!.rows[0]!.instrument = 1;

	const song = new Song(AY_CHIP_SCHEMA);
	song.chipType = 'ay';
	song.interruptFrequency = 50;
	song.chipFrequency = 1773400;
	song.tuningTable = resolveAYTuningTable(2, 1773400, 440);
	song.patterns = [pattern];
	(song as { stereoLayout?: string }).stereoLayout = stereoLayout;

	const instrument = legacyInstrument({
		id: '01',
		chipType: 'ay',
		rows: [{ tone: true, noise: false, envelope: false, volume: 15 }],
		loop: 0
	});
	return new Project('AY stereo export', '', [song], 0, [0], [], {}, [instrument], 1);
}

describe('AY stereo wav export', () => {
	it('pans separate ABC stems and centers a mono layout', async () => {
		const renderer = new AYChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const abc = await renderer.render(createProject('ABC'), 0, undefined, {
			separateChannels: true,
			stereo: true
		});
		const mono = await renderer.render(createProject('mono'), 0, undefined, {
			separateChannels: true,
			stereo: true
		});

		expect(abc).toHaveLength(6);
		expect(energy(abc[0]!)).toBeGreaterThan(energy(abc[1]!));
		expect(energy(abc[5]!)).toBeGreaterThan(energy(abc[4]!));
		expect(energy(abc[0]!)).toBeGreaterThan(0);
		const monoRatio = energy(mono[0]!) / energy(mono[1]!);
		expect(monoRatio).toBeGreaterThan(0.99);
		expect(monoRatio).toBeLessThan(1.01);
	});
});
