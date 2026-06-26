import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemResourceLoader } from '../../../../cli/resource-loader-node';
import { NESChipRenderer } from '@/lib/chips/nes/renderer';
import { NES_CHIP_SCHEMA, NES_DEFAULT_TUNING_TABLE } from '@/lib/chips/nes/schema';
import { Project } from '@/lib/models/project';
import { Instrument, Note, NoteName, Pattern, Song } from '@/lib/models/song';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function createNesTestProject(): Project {
	const pattern = new Pattern(0, 8, NES_CHIP_SCHEMA);
	pattern.channels[0].rows[0].note = new Note(NoteName.C, 1);
	pattern.channels[0].rows[0].instrument = 1;

	const song = new Song();
	song.chipType = 'nes';
	song.tuningTable = NES_DEFAULT_TUNING_TABLE;
	song.chipFrequency = NES_DEFAULT_TUNING_TABLE[0] ? 1_789_773 : 1_789_773;
	song.initialSpeed = 6;
	song.interruptFrequency = 50;
	song.patterns = [pattern];

	const instrument = new Instrument('01', [{ pulseWidth: 2, retrigger: false }], 0, 'Pulse', 'nes');

	return new Project('NES export test', '', [song], 0, [0], [], {}, [instrument]);
}

describe('NESChipRenderer', () => {
	it('renders stereo audio for a minimal NES song', async () => {
		const renderer = new NESChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const project = createNesTestProject();
		const [left, right] = await renderer.render(project, 0);

		expect(left.length).toBeGreaterThan(10_000);
		expect(right.length).toBe(left.length);

		let peak = 0;
		for (let i = 0; i < left.length; i++) {
			peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
		}
		expect(peak).toBeGreaterThan(0.01);
	});
});
