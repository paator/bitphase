import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { generatePSGBuffer } from '@/lib/services/file/ay/psg-export';
import { generateTaymFile } from '@/lib/services/file/taym/taym-export';
import { FileImportService } from '@/lib/services/file/project/file-import';
import type { Project } from '@/lib/models/project';
import AyumiState from '../../public/ay/ayumi-state.js';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';
import TrackerPatternProcessor from '../../public/tracker/tracker-pattern-processor.js';
import VirtualChannelMixer from '../../public/ay/virtual-channel-mixer.js';
import {
	instrumentHasSample,
	advanceSamplePosition
} from '../../public/ay/ay-sample-playback.js';
import {
	TIMER_EFFECTS_DEMO,
	aySongIndices,
	demoStem,
	psgReferenceFilenames
} from './demo-dump-cases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '../../src/demo');

const psgProcessorModules = {
	AyumiState,
	TrackerPatternProcessor,
	AYAudioDriver,
	AYChipRegisterState,
	VirtualChannelMixer
};

const taymProcessorModules = {
	...psgProcessorModules,
	instrumentHasSample,
	advanceSamplePosition
};

function listDemoTracks(): string[] {
	return fs
		.readdirSync(DEMO_DIR)
		.filter((file) => file.endsWith('.btp'))
		.sort();
}

async function loadDemoProject(btpFilename: string): Promise<Project> {
	const gzipped = fs.readFileSync(path.join(DEMO_DIR, btpFilename));
	const text = gunzipSync(gzipped).toString('utf-8');
	return FileImportService.reconstructFromJsonAsync(text);
}

function readReference(filePath: string, kind: string): Buffer {
	expect(fs.existsSync(filePath), `Missing ${kind} reference dump: ${filePath}`).toBe(true);
	return fs.readFileSync(filePath);
}

async function assertPSGMatchesReference(
	project: Project,
	songIndex: number,
	psgFilename: string
): Promise<void> {
	const generated = await generatePSGBuffer(project, songIndex, {
		modules: psgProcessorModules
	});
	const expected = readReference(path.resolve(__dirname, psgFilename), 'PSG');
	expect(
		Buffer.from(generated).equals(expected),
		`Generated PSG (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

async function assertTAYMMatchesReference(
	project: Project,
	taymFilename: string
): Promise<void> {
	const generated = await generateTaymFile(project, 0, {
		modules: taymProcessorModules
	});
	const expected = readReference(path.resolve(__dirname, '../taym', taymFilename), 'TAYM');
	expect(
		Buffer.from(generated).equals(expected),
		`Generated TAYM (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

const demoTracks = listDemoTracks();

describe('demo track reference dumps', () => {
	it('covers every demo track', () => {
		expect(demoTracks.length).toBeGreaterThan(0);
		expect(demoTracks).toContain(TIMER_EFFECTS_DEMO);
	});

	for (const btpFilename of demoTracks) {
		const stem = demoStem(btpFilename);

		if (btpFilename === TIMER_EFFECTS_DEMO) {
			it(`${stem}: dynamically generated TAYM matches reference dump`, async () => {
				const project = await loadDemoProject(btpFilename);
				await assertTAYMMatchesReference(project, `${stem}.taym`);
			});
			continue;
		}

		it(`${stem}: dynamically generated PSG matches reference dump`, async () => {
			const project = await loadDemoProject(btpFilename);
			const songs = aySongIndices(project);
			expect(songs.length, `${stem} should have at least one AY song`).toBeGreaterThan(0);
			const names = psgReferenceFilenames(stem, songs.length);
			for (let i = 0; i < songs.length; i++) {
				await assertPSGMatchesReference(project, songs[i]!, names[i]!);
			}
		});
	}
});
