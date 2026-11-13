import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemResourceLoader } from '../../../../cli/resource-loader-node';
import { SAA_AUDIO_SLOT_KIND } from '@/lib/chips/saa/audio-slot-kind';
import { SAA_CHIP } from '@/lib/chips/saa/core';
import { SAAChipRenderer } from '@/lib/chips/saa/renderer';
import { SAA_CHIP_SCHEMA, SAA_SAM_CLOCK, resolveSaaTuningTable } from '@/lib/chips/saa/schema';
import { Project } from '@/lib/models/project';
import { Instrument, Note, NoteName, Pattern, Song } from '@/lib/models/song';
import { exportToWAV } from '@/lib/services/file/wav/wav-export';
import { defaultWavExportSettings } from '@/lib/services/file/wav/wav-export-settings';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SAMPLE_RATE = 44100;
const ROWS = 4;
const SPEED = 1;

function peakOf(samples: Float32Array): number {
	let peak = 0;
	for (let i = 0; i < samples.length; i++) {
		const level = Math.abs(samples[i]!);
		if (level > peak) peak = level;
	}
	return peak;
}

function createSaaSong(): Song {
	const pattern = new Pattern(0, ROWS, SAA_CHIP_SCHEMA);
	pattern.channels[0]!.rows[0]!.note = new Note(NoteName.A, 4);
	pattern.channels[0]!.rows[0]!.instrument = 1;

	const song = new Song(SAA_CHIP_SCHEMA);
	song.chipType = 'saa';
	song.chipFrequency = SAA_SAM_CLOCK;
	song.interruptFrequency = 50;
	song.a4TuningHz = 440;
	song.tuningTable = resolveSaaTuningTable(SAA_SAM_CLOCK, 440);
	song.patterns = [pattern];
	return song;
}

function createSaaProject(
	songs: Song[] = [createSaaSong()],
	levels: { left: number; right: number } = { left: 15, right: 15 }
): Project {
	const instrument = new Instrument('01', 'Square', 'saa');
	instrument.macros = {
		left: { values: [levels.left], loop: 0 },
		right: { values: [levels.right], loop: 0 },
		tone: { values: [true], loop: 0 }
	};
	return new Project('SAA export test', '', songs, 0, [0], [], {}, [instrument], SPEED);
}

function expectedPassLength(): number {
	return (ROWS * SPEED - 1) * Math.floor(SAMPLE_RATE / 50);
}

describe('SAA wav export', () => {
	it('renders one stereo pass of a square wave', async () => {
		const renderer = new SAAChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const [left, right] = await renderer.render(createSaaProject(), 0);

		expect(left.length).toBe(expectedPassLength());
		expect(right.length).toBe(left.length);
		expect(peakOf(left)).toBeGreaterThan(0.05);
		expect(peakOf(right)).toBeGreaterThan(0.05);
	});

	it('renders a second loop after the first pass', async () => {
		const renderer = new SAAChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const project = createSaaProject();
		const once = await renderer.render(project, 0, undefined, { loopCount: 1 });
		const twice = await renderer.render(project, 0, undefined, { loopCount: 2 });

		expect(twice[0]!.length).toBeGreaterThan(once[0]!.length);
		expect(twice[0]!.length).toBeLessThan(once[0]!.length * 3);
		expect(peakOf(twice[0]!)).toBeGreaterThan(0.05);
	});

	it('renders each SAA channel in stereo when stereo export is on', async () => {
		const renderer = new SAAChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const channels = await renderer.render(
			createSaaProject([createSaaSong()], { left: 15, right: 0 }),
			0,
			undefined,
			{ separateChannels: true, stereo: true }
		);

		expect(channels).toHaveLength(SAA_CHIP_SCHEMA.channelLabels.length * 2);
		expect(channels[0]!.length).toBe(expectedPassLength());
		expect(peakOf(channels[0]!)).toBeGreaterThan(0.05);
		expect(peakOf(channels[1]!)).toBe(0);
		for (let channel = 2; channel < channels.length; channel++) {
			expect(peakOf(channels[channel]!)).toBe(0);
		}
	});

	it('renders one stem per SAA channel', async () => {
		const renderer = new SAAChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const channels = await renderer.render(createSaaProject(), 0, undefined, {
			separateChannels: true
		});

		expect(channels).toHaveLength(SAA_CHIP_SCHEMA.channelLabels.length);
		expect(channels[0]!.length).toBe(expectedPassLength());
		expect(peakOf(channels[0]!)).toBeGreaterThan(0.05);
		for (let channel = 1; channel < channels.length; channel++) {
			expect(peakOf(channels[channel]!)).toBe(0);
		}
	});

	it('keeps two SAA songs on one shared timeline', async () => {
		const renderer = new SAAChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const project = createSaaProject([createSaaSong(), createSaaSong()]);
		const parts = await renderer.renderSharedTimelineSlots(project, [
			{ songIndex: 0, audioSlotKind: SAA_AUDIO_SLOT_KIND },
			{ songIndex: 1, audioSlotKind: SAA_AUDIO_SLOT_KIND }
		]);

		expect(parts).toHaveLength(2);
		expect(parts[0]!.channels[0]!.length).toBe(expectedPassLength());
		expect(parts[1]!.channels[0]!.length).toBe(parts[0]!.channels[0]!.length);
		expect(peakOf(parts[0]!.channels[0]!)).toBeGreaterThan(0.05);
		expect(peakOf(parts[1]!.channels[0]!)).toBeGreaterThan(0.05);
	});

	it('writes a RIFF wav through the export service', async () => {
		let header = '';
		let size = 0;
		await exportToWAV(
			createSaaProject(),
			{ ...defaultWavExportSettings, title: 'saa', loops: 1 },
			undefined,
			undefined,
			{
				resourceLoader: new FileSystemResourceLoader(PUBLIC_DIR),
				getChip: (type) => (type === 'saa' ? SAA_CHIP : null),
				onOutput: async (buffer) => {
					header = new TextDecoder().decode(buffer.slice(0, 4));
					size = buffer.byteLength;
				}
			}
		);

		expect(header).toBe('RIFF');
		expect(size).toBeGreaterThan(44);
	});
});
